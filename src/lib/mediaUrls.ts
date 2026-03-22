/** Base for API (empty = same origin, e.g. Vite proxy to :8787). */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return raw?.replace(/\/$/, '') ?? '';
}

export function mediaAudioUrl(fileId: string): string {
  const base = getApiBase();
  const path = `/api/media/audio/${encodeURIComponent(fileId)}`;
  return base ? `${base}${path}` : path;
}

export function mediaImageUrl(fileId: string): string {
  const base = getApiBase();
  const path = `/api/media/image/${encodeURIComponent(fileId)}`;
  return base ? `${base}${path}` : path;
}

/**
 * Resolves the URL used for <audio src>. Supports legacy full URLs (http/https),
 * relative API paths, and Drive file ids.
 */
export function resolveAudioPlaybackUrl(track: {
  id: string;
  audioUrl: string;
  driveAudioFileId?: string;
}): string {
  const u = track.audioUrl?.trim() ?? '';
  if (u.startsWith('http://') || u.startsWith('https://')) {
    return u;
  }
  if (u.startsWith('/')) {
    return u;
  }
  if (track.driveAudioFileId) {
    return mediaAudioUrl(track.driveAudioFileId);
  }
  return u;
}

export function resolveCoverImageUrl(track: {
  coverImage: string;
  driveCoverFileId?: string;
}): string {
  const u = track.coverImage?.trim() ?? '';
  if (u.startsWith('http://') || u.startsWith('https://')) {
    return u;
  }
  if (u.startsWith('/')) {
    return u;
  }
  if (track.driveCoverFileId) {
    return mediaImageUrl(track.driveCoverFileId);
  }
  return u;
}

