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
  if (lower.includes('blob') || lower.includes('vercel')) {
    return 'Vercel Blob へのアップロードに失敗しました。BLOB_READ_WRITE_TOKEN とファイル形式を確認してください。';
  }
  if (lower.includes('database') || lower.includes('database_url')) {
    return 'Neon DB への接続に失敗しました。DATABASE_URL を確認してください。';
  }
  return message;
}
