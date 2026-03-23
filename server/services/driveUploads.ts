import { google, type drive_v3 } from 'googleapis';
import { getOAuth2ClientForDrive } from './driveClient';

const MB = 1024 * 1024;

export const MAX_AUDIO_BYTES = 150 * MB;
export const MAX_IMAGE_BYTES = 10 * MB;
export const AUDIO_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type UploadKind = 'audio' | 'image';

export interface UploadFileInput {
  name: string;
  size: number;
  type: string;
}

export interface UploadSession {
  fileId: string;
  sessionUrl: string;
  fileName: string;
}

export interface VerifiedDriveUpload {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  parents: string[];
}

function getUploadRules(kind: UploadKind) {
  return kind === 'audio'
    ? {
        maxBytes: MAX_AUDIO_BYTES,
        mimeTypes: AUDIO_MIME_TYPES,
        prefix: 'audio',
        label: 'MP3',
      }
    : {
        maxBytes: MAX_IMAGE_BYTES,
        mimeTypes: IMAGE_MIME_TYPES,
        prefix: 'cover',
        label: 'JPG / PNG / WEBP',
      };
}

function makeUploadError(message: string, code = 'UPLOAD_VALIDATION_FAILED') {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'upload.bin';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toErrorMessage(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 500) : 'unknown error';
}

function parseNumericSize(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function assertUploadFileInput(kind: UploadKind, input: UploadFileInput): UploadFileInput {
  const rules = getUploadRules(kind);
  const name = String(input.name ?? '').trim();
  const size = Number(input.size);
  const type = String(input.type ?? '').trim().toLowerCase();

  if (!name) throw makeUploadError(`${rules.label} のファイル名が必要です。`);
  if (!Number.isFinite(size) || size <= 0) {
    throw makeUploadError(`${rules.label} のファイルサイズが不正です。`);
  }
  if (size > rules.maxBytes) {
    throw makeUploadError(
      `${rules.label} は ${Math.round(rules.maxBytes / MB)}MB 以下にしてください。`
    );
  }
  if (!rules.mimeTypes.has(type)) {
    throw makeUploadError(`${rules.label} の MIME type が不正です。`);
  }

  return { name, size, type };
}

async function getDriveAccessToken(): Promise<string> {
  const oauth2 = await getOAuth2ClientForDrive();
  const accessToken = await oauth2.getAccessToken();
  const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;
  if (!token) {
    throw makeUploadError('Drive access token を取得できませんでした。', 'DRIVE_AUTH_FAILED');
  }
  return token;
}

export async function startDriveResumableUpload(
  kind: UploadKind,
  input: UploadFileInput,
  folderId: string
): Promise<UploadSession> {
  const file = assertUploadFileInput(kind, input);
  const oauth2 = await getOAuth2ClientForDrive();
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  const ids = await drive.files.generateIds({ count: 1, space: 'drive', type: 'files' });
  const fileId = ids.data.ids?.[0];
  if (!fileId) {
    throw makeUploadError('Drive fileId を生成できませんでした。', 'DRIVE_INIT_FAILED');
  }

  const token = await getDriveAccessToken();
  const fileName = `${getUploadRules(kind).prefix}_${Date.now()}_${sanitizeFileName(file.name)}`;
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,parents',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        id: fileId,
        name: fileName,
        parents: [folderId],
        mimeType: file.type,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw makeUploadError(
      `Drive upload session の作成に失敗しました: ${toErrorMessage(text)}`,
      'DRIVE_INIT_FAILED'
    );
  }

  const sessionUrl = response.headers.get('location');
  if (!sessionUrl) {
    throw makeUploadError('Drive upload session URL が返されませんでした。', 'DRIVE_INIT_FAILED');
  }

  return { fileId, sessionUrl, fileName };
}

export async function verifyDriveUpload(
  drive: drive_v3.Drive,
  fileId: string,
  kind: UploadKind,
  folderId: string
): Promise<VerifiedDriveUpload> {
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,parents,trashed',
    supportsAllDrives: true,
  });
  const data = response.data;
  const parents = Array.isArray(data.parents) ? data.parents.filter(Boolean) : [];
  const mimeType = String(data.mimeType ?? '').trim().toLowerCase();
  const size = parseNumericSize(data.size);
  const rules = getUploadRules(kind);

  if (!data.id) throw makeUploadError('Drive 上にアップロード済みファイルが見つかりません。');
  if (data.trashed) throw makeUploadError('Drive 上のファイルがゴミ箱にあります。');
  if (!parents.includes(folderId)) {
    throw makeUploadError('Drive 上のファイル保存先が想定フォルダではありません。');
  }
  if (!rules.mimeTypes.has(mimeType)) {
    throw makeUploadError(`${rules.label} の MIME type が不正です。`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw makeUploadError(`${rules.label} のサイズを確認できませんでした。`);
  }
  if (size > rules.maxBytes) {
    throw makeUploadError(`${rules.label} は ${Math.round(rules.maxBytes / MB)}MB 以下にしてください。`);
  }

  return {
    fileId: data.id,
    name: String(data.name ?? ''),
    mimeType,
    size,
    parents,
  };
}

export async function deleteDriveFileIfPresent(
  drive: drive_v3.Drive,
  fileId: string
): Promise<void> {
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (error) {
    console.error(`Failed to delete Drive file ${fileId}`, error);
  }
}
