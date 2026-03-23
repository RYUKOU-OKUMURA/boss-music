export function createAuthHeaders(secret: string | undefined): Record<string, string> {
  if (!secret) return {};
  return { 'X-Admin-Secret': secret };
}

export async function postJson<T>(
  path: string,
  payload: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return (await res.json()) as T;
}

export async function deleteJson<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      ...(extraHeaders ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return (await res.json()) as T;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // no-op
  }
  return raw;
}

export function explainUploadError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('google authorization popup was blocked or closed')) {
    return (
      'Google 認証ポップアップが閉じられたか、OAuth 設定が一致していません。Google Cloud Console の OAuth クライアントで ' +
      'Authorized JavaScript origins に本番URL、Authorized redirect URIs に /api/auth/google/callback を追加してください。'
    );
  }
  if (lower.includes('origin_mismatch') || lower.includes('redirect_uri_mismatch')) {
    return (
      'Google OAuth 設定が一致していません。Authorized JavaScript origins に本番URL、Authorized redirect URIs に ' +
      '/api/auth/google/callback を追加してください。'
    );
  }
  if (lower.includes('access_denied')) {
    return 'Google Drive へのアクセスが拒否されました。権限を許可して、同じ Google アカウントで再実行してください。';
  }
  if (lower.includes('google drive upload request failed')) {
    return 'Google Drive へのアップロード通信に失敗しました。回線状態を確認して、もう一度アップロードしてください。';
  }
  return message;
}
