import { del, head } from '@vercel/blob';

export type UploadKind = 'audio' | 'image';

export const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface BlobUploadPayload {
  url?: string;
  pathname?: string;
  size?: number;
  contentType?: string;
}

export function allowedContentTypes(kind: UploadKind): string[] {
  return kind === 'audio' ? AUDIO_TYPES : IMAGE_TYPES;
}

export function maxUploadBytes(kind: UploadKind): number {
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}

export function isAllowedContentType(kind: UploadKind, contentType: string): boolean {
  return allowedContentTypes(kind).includes(contentType.trim().toLowerCase());
}

function normalizeContentType(contentType: string | undefined): string {
  return String(contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export function parseUploadKind(value: unknown): UploadKind {
  if (value === 'audio' || value === 'image') return value;
  const err = new Error('Invalid upload kind') as Error & { code?: string };
  err.code = 'UPLOAD_VALIDATION_FAILED';
  throw err;
}

export function validateBlobUpload(kind: UploadKind, payload: BlobUploadPayload) {
  const url = String(payload.url ?? '').trim();
  const pathname = String(payload.pathname ?? '').trim();
  const contentType = normalizeContentType(payload.contentType);
  const size = Number(payload.size);

  if (!url || !pathname) {
    throwUploadError('Blob upload metadata is incomplete.');
  }
  if (!url.startsWith('https://')) {
    throwUploadError('Blob URL must be an HTTPS URL.');
  }
  if (!pathname.startsWith('tracks/')) {
    throwUploadError('Blob pathname is outside the expected tracks/ folder.');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throwUploadError('Blob upload size is invalid.');
  }
  if (size > maxUploadBytes(kind)) {
    throwUploadError(`${kind === 'audio' ? 'MP3' : '画像'} is too large.`);
  }
  if (!isAllowedContentType(kind, contentType)) {
    throwUploadError(`${kind === 'audio' ? 'MP3' : '画像'} content type is not allowed.`);
  }

  return { url, pathname, size, contentType };
}

export async function verifyBlobUpload(kind: UploadKind, payload: BlobUploadPayload) {
  const validated = validateBlobUpload(kind, payload);
  let metadata;
  try {
    metadata = await head(validated.pathname);
  } catch {
    throwUploadError('Uploaded blob was not found in this Blob store.');
  }
  const actualContentType = normalizeContentType(metadata.contentType);

  if (metadata.url !== validated.url) {
    throwUploadError('Blob URL does not match the uploaded pathname.');
  }
  if (metadata.size !== validated.size) {
    throwUploadError('Blob size does not match the uploaded file.');
  }
  if (!isAllowedContentType(kind, actualContentType)) {
    throwUploadError(`${kind === 'audio' ? 'MP3' : '画像'} content type is not allowed.`);
  }

  return {
    url: metadata.url,
    pathname: metadata.pathname,
    size: metadata.size,
    contentType: actualContentType,
  };
}

export async function deleteBlobIfPresent(pathname: string | undefined): Promise<boolean> {
  if (!pathname) return true;
  try {
    await del(pathname);
    return true;
  } catch (error) {
    console.error(`Failed to delete blob ${pathname}`, error);
    return false;
  }
}

function throwUploadError(message: string): never {
  const err = new Error(message) as Error & { code?: string };
  err.code = 'UPLOAD_VALIDATION_FAILED';
  throw err;
}
