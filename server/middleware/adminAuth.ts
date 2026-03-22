import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const COOKIE = 'boss_music_admin';

function getSessionSecret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return s;
}

/** Signed token: base64url(payload).hmac — null if SESSION_SECRET not configured */
export function createAdminSessionToken(): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const expSec = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload = Buffer.from(JSON.stringify({ exp: expSec }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  const secret = getSessionSecret();
  if (!secret) return false;
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    if (sig !== expected) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number };
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (adminSecret && req.headers['x-admin-secret'] === adminSecret) {
    next();
    return;
  }

  const reqCookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = reqCookies?.[COOKIE] ?? parseCookies(req.headers.cookie)[COOKIE];
  if (verifyAdminSessionToken(token)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}

export const adminCookieName = COOKIE;
