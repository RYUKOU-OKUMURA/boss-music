/**
 * Resolves the URL used for <audio src>. New backend rows use direct Vercel Blob
 * HTTPS URLs, but relative URLs are still accepted for local/static assets.
 */
export function resolveAudioPlaybackUrl(track: { audioUrl: string }): string {
  return track.audioUrl?.trim() ?? '';
}

export function resolveCoverImageUrl(track: { coverImage?: string }): string {
  return track.coverImage?.trim() ?? '';
}
