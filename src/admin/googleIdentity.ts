import { DRIVE_SCOPE } from './constants';
import {
  GoogleAuthInteractionRequiredError,
  GoogleAuthPopupError,
} from './errors';
import type { CachedDriveToken } from './types';

let gisScriptPromise: Promise<void> | null = null;

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = String(email ?? '').trim().toLowerCase();
  return value || null;
}

function getDriveTokenCacheKey(clientId: string, email: string | null): string {
  return `boss-music:drive-token:${clientId}:${email ?? 'unknown'}`;
}

function readCachedDriveToken(clientId: string, email: string | null): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getDriveTokenCacheKey(clientId, email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDriveToken;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now() + 60_000) {
      window.sessionStorage.removeItem(getDriveTokenCacheKey(clientId, email));
      return null;
    }
    return parsed.accessToken;
  } catch {
    return null;
  }
}

function writeCachedDriveToken(
  clientId: string,
  email: string | null,
  accessToken: string,
  expiresInSeconds?: number
): void {
  if (typeof window === 'undefined') return;
  if (!accessToken) return;
  const expiresAt = Date.now() + Math.max((expiresInSeconds ?? 3600) - 60, 60) * 1000;
  const payload: CachedDriveToken = { accessToken, expiresAt };
  try {
    window.sessionStorage.setItem(getDriveTokenCacheKey(clientId, email), JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity script failed to load.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity script failed to load.'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

async function requestDriveAccessToken(
  clientId: string,
  loginHint: string | null,
  prompt: '' | 'consent' = ''
): Promise<{ accessToken: string; expiresIn?: number }> {
  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is not available.');
  }

  return await new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt,
      ...(loginHint ? { login_hint: loginHint } : {}),
      callback: (response) => {
        if (response.error || !response.access_token) {
          if (
            response.error === 'interaction_required' ||
            response.error === 'consent_required' ||
            response.error === 'login_required'
          ) {
            reject(new GoogleAuthInteractionRequiredError(response.error_description || response.error));
            return;
          }
          reject(new Error(response.error_description || response.error || 'Google authorization failed.'));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: response.expires_in,
        });
      },
      error_callback: (error) => {
        if (error?.type === 'popup_closed' || error?.type === 'popup_failed_to_open') {
          reject(new GoogleAuthPopupError('Google authorization popup was blocked or closed.'));
          return;
        }
        reject(new Error(`Google authorization failed (${error?.type ?? 'unknown'}).`));
      },
    });

    tokenClient.requestAccessToken();
  });
}

export async function getDriveAccessTokenForUpload(clientId: string, email: string | null): Promise<string> {
  const cached = readCachedDriveToken(clientId, email);
  if (cached) return cached;

  try {
    const silent = await requestDriveAccessToken(clientId, email, '');
    writeCachedDriveToken(clientId, email, silent.accessToken, silent.expiresIn);
    return silent.accessToken;
  } catch (error) {
    if (!(error instanceof GoogleAuthInteractionRequiredError)) throw error;
  }

  const prompted = await requestDriveAccessToken(clientId, email, 'consent');
  writeCachedDriveToken(clientId, email, prompted.accessToken, prompted.expiresIn);
  return prompted.accessToken;
}
