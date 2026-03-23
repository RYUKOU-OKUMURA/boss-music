import { DRIVE_CHUNK_BYTES } from './constants';
import { parseErrorMessage } from './adminHttp';
import { UploadSessionExpiredError } from './errors';
import type {
  BrowserDriveUser,
  BrowserUploadSession,
  PutResult,
  UploadKind,
} from './types';

export function normalizeMimeType(file: File, kind: UploadKind): string {
  const explicit = file.type.trim().toLowerCase();
  if (explicit) return explicit;

  const name = file.name.toLowerCase();
  if (kind === 'audio' && name.endsWith('.mp3')) return 'audio/mpeg';
  if (kind === 'image' && (name.endsWith('.jpg') || name.endsWith('.jpeg'))) return 'image/jpeg';
  if (kind === 'image' && name.endsWith('.png')) return 'image/png';
  if (kind === 'image' && name.endsWith('.webp')) return 'image/webp';
  return explicit;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'upload.bin';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function makeDriveFileName(kind: UploadKind, name: string): string {
  const prefix = kind === 'audio' ? 'audio' : 'cover';
  return `${prefix}_${Date.now()}_${sanitizeFileName(name)}`;
}

function parseRangeEnd(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /bytes=0-(\d+)/i.exec(rangeHeader);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorMessage(text) || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchBrowserDriveUser(accessToken: string): Promise<BrowserDriveUser> {
  const data = await fetchJson<{ user?: { displayName?: string; emailAddress?: string } }>(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)&supportsAllDrives=true',
    accessToken
  );
  return {
    displayName: data.user?.displayName ?? null,
    emailAddress: data.user?.emailAddress ?? null,
  };
}

async function generateDriveFileId(accessToken: string): Promise<string> {
  const data = await fetchJson<{ ids?: string[] }>(
    'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',
    accessToken
  );
  const id = data.ids?.[0];
  if (!id) throw new Error('Drive fileId を生成できませんでした。');
  return id;
}

export async function startBrowserResumableUpload(
  accessToken: string,
  folderId: string,
  kind: UploadKind,
  file: File
): Promise<BrowserUploadSession> {
  const fileId = await generateDriveFileId(accessToken);
  const fileName = makeDriveFileName(kind, file.name);
  const mimeType = normalizeMimeType(file, kind);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        id: fileId,
        name: fileName,
        parents: [folderId],
        mimeType,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload session の作成に失敗しました: ${parseErrorMessage(text)}`);
  }

  const sessionUrl = res.headers.get('location');
  if (!sessionUrl) throw new Error('Drive upload session URL が返されませんでした。');

  return { fileId, fileName, sessionUrl };
}

function drivePut(
  sessionUrl: string,
  accessToken: string,
  headers: Record<string, string>,
  body: Blob | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    if (body && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
    }
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        range: xhr.getResponseHeader('Range'),
      });
    };
    xhr.onerror = () => reject(new Error('Google Drive upload request failed.'));
    xhr.send(body);
  });
}

async function queryUploadedOffset(
  sessionUrl: string,
  accessToken: string,
  totalBytes: number
): Promise<number> {
  const result = await drivePut(
    sessionUrl,
    accessToken,
    {
      'Content-Length': '0',
      'Content-Range': `*/${totalBytes}`,
    },
    null
  );

  if (result.status === 200 || result.status === 201) return totalBytes;
  if (result.status === 308) {
    const end = parseRangeEnd(result.range);
    return end === null ? 0 : end + 1;
  }
  if (result.status >= 400 && result.status < 500) {
    throw new UploadSessionExpiredError('Drive upload session expired.');
  }
  throw new Error(`Failed to query upload status (${result.status})`);
}

export async function uploadFileToDrive(
  sessionUrl: string,
  accessToken: string,
  file: File,
  chunkSize: number,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  let offset = 0;
  let retries = 0;

  while (offset < file.size) {
    const nextOffset = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, nextOffset);

    try {
      const result = await drivePut(
        sessionUrl,
        accessToken,
        {
          'Content-Length': String(chunk.size),
          'Content-Range': `bytes ${offset}-${nextOffset - 1}/${file.size}`,
        },
        chunk,
        (loaded) => onProgress(offset + loaded, file.size)
      );

      if (result.status === 200 || result.status === 201) {
        onProgress(file.size, file.size);
        return;
      }

      if (result.status === 308) {
        const confirmedEnd = parseRangeEnd(result.range);
        offset = confirmedEnd === null ? nextOffset : confirmedEnd + 1;
        retries = 0;
        onProgress(offset, file.size);
        continue;
      }

      if (result.status >= 400 && result.status < 500) {
        throw new UploadSessionExpiredError('Drive upload session expired.');
      }

      if (result.status >= 500) {
        offset = await queryUploadedOffset(sessionUrl, accessToken, file.size);
        retries += 1;
        if (retries > 5) throw new Error('Drive upload retried too many times.');
        onProgress(offset, file.size);
        continue;
      }

      throw new Error(`Unexpected upload response (${result.status})`);
    } catch (error) {
      if (error instanceof UploadSessionExpiredError) throw error;

      offset = await queryUploadedOffset(sessionUrl, accessToken, file.size);
      retries += 1;
      if (retries > 5) {
        throw error instanceof Error ? error : new Error('Drive upload failed.');
      }
      onProgress(offset, file.size);
    }
  }
}
