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
  const res = await fetch(path, { credentials: 'include', cache: 'no-store' });
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
  const detail = message.replace(/^Vercel Blob:\s*/i, '').trim();
  const lower = message.toLowerCase();
  if (lower.includes('invalid `blob_read_write_token`') || lower.includes('no token found')) {
    return 'Vercel Blob の BLOB_READ_WRITE_TOKEN が未設定または形式不正です。Vercel の Environment Variables を確認し、再デプロイしてください。';
  }
  if (lower.includes('store not found') || lower.includes('store_not_found')) {
    return 'Vercel Blob Store が見つかりません。BLOB_READ_WRITE_TOKEN が現在の Blob Store の Read Write Token か確認してください。';
  }
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('access')) {
    return `Vercel Blob の認証に失敗しました。BLOB_READ_WRITE_TOKEN を確認してください。${detail ? `詳細: ${detail}` : ''}`;
  }
  if (lower.includes('content type') || lower.includes('file type') || lower.includes('not allowed')) {
    return `ファイル形式が許可されていません。MP3 または JPG / PNG / WEBP を選んでください。${detail ? `詳細: ${detail}` : ''}`;
  }
  if (lower.includes('blob') || lower.includes('vercel')) {
    return `Vercel Blob へのアップロードに失敗しました。${detail ? `詳細: ${detail}` : 'BLOB_READ_WRITE_TOKEN とファイル形式を確認してください。'}`;
  }
  if (lower.includes('database') || lower.includes('database_url')) {
    return 'Neon DB への接続に失敗しました。DATABASE_URL を確認してください。';
  }
  return message;
}
