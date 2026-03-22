import { oauthStateKey } from './kvKeys';
import { getRedis, isRedisConfigured } from './redisStore';

const STATE_TTL_MS = 10 * 60 * 1000;

/** ローカル: メモリ（単一プロセス） */
const pendingOAuthStates = new Map<string, number>();

function cleanupStates() {
  const now = Date.now();
  for (const [k, exp] of pendingOAuthStates) {
    if (exp < now) pendingOAuthStates.delete(k);
  }
}

export async function saveOAuthState(state: string): Promise<void> {
  if (isRedisConfigured()) {
    await getRedis().set(oauthStateKey(state), '1', { ex: Math.ceil(STATE_TTL_MS / 1000) });
    return;
  }
  cleanupStates();
  pendingOAuthStates.set(state, Date.now() + STATE_TTL_MS);
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  if (isRedisConfigured()) {
    const r = getRedis();
    const key = oauthStateKey(state);
    const raw = await r.get(key);
    if (raw == null) return false;
    await r.del(key);
    return true;
  }
  cleanupStates();
  const exp = pendingOAuthStates.get(state);
  if (!exp || exp < Date.now()) return false;
  pendingOAuthStates.delete(state);
  return true;
}
