import { upload } from '@vercel/blob/client';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from './constants';
import type { UploadedBlobInfo, UploadKind } from './types';

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

function extensionFor(file: File, kind: UploadKind): string {
  const type = normalizeMimeType(file, kind);
  if (kind === 'audio') return 'mp3';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function randomPart(): string {
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function makeBlobPath(trackId: string, kind: UploadKind, file: File): string {
  const prefix = kind === 'audio' ? 'audio' : 'cover';
  return `tracks/${trackId}/${prefix}-${randomPart()}.${extensionFor(file, kind)}`;
}

export async function uploadFileToBlob(
  trackId: string,
  kind: UploadKind,
  file: File,
  headers: Record<string, string>,
  onProgress?: (percentage: number) => void
): Promise<UploadedBlobInfo> {
  const result = await upload(makeBlobPath(trackId, kind, file), file, {
    access: 'public',
    handleUploadUrl: '/api/admin/blob-upload',
    headers,
    contentType: normalizeMimeType(file, kind),
    multipart: file.size > 20 * 1024 * 1024,
    clientPayload: JSON.stringify({ kind }),
    onUploadProgress: (event) => {
      onProgress?.(event.percentage);
    },
  });

  return {
    url: result.url,
    pathname: result.pathname,
    size: file.size,
    contentType: normalizeMimeType(file, kind),
  };
}

export function maxBytesForKind(kind: UploadKind): number {
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}
