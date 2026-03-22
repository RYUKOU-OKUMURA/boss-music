import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k || k.length < 8) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set (min 8 chars)');
  }
  return crypto.createHash('sha256').update(k, 'utf8').digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid token payload');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const tokenPath = () =>
  path.resolve(process.cwd(), process.env.DRIVE_TOKEN_PATH || 'data/drive-tokens.enc');

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const body = JSON.stringify({ refresh_token: refreshToken });
  const enc = encrypt(body);
  const p = tokenPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, enc, 'utf8');
}

export async function loadRefreshToken(): Promise<string | null> {
  try {
    const enc = await fs.readFile(tokenPath(), 'utf8');
    const json = JSON.parse(decrypt(enc)) as { refresh_token?: string };
    return json.refresh_token ?? null;
  } catch {
    return null;
  }
}
