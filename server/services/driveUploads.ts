import type { drive_v3 } from 'googleapis';

const MB = 1024 * 1024;

export const MAX_AUDIO_BYTES = 150 * MB;
export const MAX_IMAGE_BYTES = 10 * MB;
const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type UploadKind = 'audio' | 'image';

export interface UploadFileInput {
  name: string;
  size: number;
  type: string;
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
