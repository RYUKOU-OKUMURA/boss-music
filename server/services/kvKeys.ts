/** Redis キー（プレフィックスで衝突回避） */
export const KV_REFRESH_TOKEN = 'boss-music:refresh-token';
export const KV_CATALOG_FILE_ID = 'boss-music:catalog-file-id';

export function oauthStateKey(state: string): string {
  return `boss-music:oauth-state:${state}`;
}
