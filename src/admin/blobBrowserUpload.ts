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

function parseResponseError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // Keep the raw response text below.
  }
  return text.trim();
}

async function explainClientTokenFailure(
  pathname: string,
  kind: UploadKind,
  multipart: boolean,
  headers: Record<string, string>
): Promise<string> {
  try {
    const res = await fetch('/api/admin/blob-upload', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          clientPayload: JSON.stringify({ kind }),
          multipart,
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) return parseResponseError(text) || res.statusText;
    return 'Vercel Blob のアップロードトークン取得後、SDK がレスポンスを処理できませんでした。';
  } catch (error) {
    return error instanceof Error ? error.message : 'アップロードトークン取得に失敗しました。';
  }
}

export async function uploadFileToBlob(
  trackId: string,
  kind: UploadKind,
  file: File,
  headers: Record<string, string>,
  onProgress?: (percentage: number) => void
): Promise<UploadedBlobInfo> {
  const pathname = makeBlobPath(trackId, kind, file);
  const contentType = normalizeMimeType(file, kind);
  const multipart = file.size > 20 * 1024 * 1024;
  let result;
  try {
    result = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/admin/blob-upload',
      headers,
      contentType,
      multipart,
      clientPayload: JSON.stringify({ kind }),
      onUploadProgress: (event) => {
        onProgress?.(event.percentage);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'アップロードに失敗しました。';
    if (message.toLowerCase().includes('retrieve the client token')) {
      throw new Error(await explainClientTokenFailure(pathname, kind, multipart, headers));
    }
    throw error;
  }

  return {
    url: result.url,
    pathname: result.pathname,
    size: file.size,
    contentType,
  };
}

export function maxBytesForKind(kind: UploadKind): number {
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}
