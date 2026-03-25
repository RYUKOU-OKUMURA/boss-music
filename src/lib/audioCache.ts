/**
 * Drive プロキシ（/api/media/audio/...）はサーバーが Range を Google Drive に転送するため、
 * `<audio>` に直接渡してストリーミング再生できる。
 * 旧実装の「全ファイル fetch → blob → IndexedDB」は本番で初回再生が極端に遅くなるため行わない。
 */
export async function resolveAudioSource(_trackId: string, streamUrl: string): Promise<string> {
  return streamUrl;
}

export function revokeObjectUrl(url: string | undefined) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}
