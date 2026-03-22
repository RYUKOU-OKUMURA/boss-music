import crypto from 'crypto';
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

function getHmacSecret(): string | null {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim() ||
    null
  );
}

/**
 * HMAC 署名付き state を生成する。nonce.expiry.signature の形式で、
 * サーバー側に保存せずにコールバックで検証できる（サーバーレス対応）。
 */
export function createSignedState(): string {
  const secret = getHmacSecret();
  const nonce = crypto.randomBytes(24).toString('hex');
  if (!secret) return nonce;

  const expiry = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${expiry}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySignedState(state: string): boolean {
  const secret = getHmacSecret();
  if (!secret) return false;

  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiryStr, sig] = parts;
  if (!nonce || !expiryStr || !sig) return false;

  const payload = `${nonce}.${expiryStr}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (sig !== expected) return false;

  const expiry = Number(expiryStr);
  if (Number.isNaN(expiry) || expiry < Date.now()) return false;

  return true;
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

  // インメモリ（ローカル開発・単一プロセス）
  cleanupStates();
  const exp = pendingOAuthStates.get(state);
  if (exp && exp >= Date.now()) {
    pendingOAuthStates.delete(state);
    return true;
  }

  // HMAC 署名ベースのステートレス検証（サーバーレス環境フォールバック）
  return verifySignedState(state);
}
