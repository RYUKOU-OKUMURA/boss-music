import React, { useState, useEffect, useCallback } from 'react';
import type { Track } from '../context/AudioContext';

const MB = 1024 * 1024;
const MAX_AUDIO_BYTES = 150 * MB;
const MAX_IMAGE_BYTES = 10 * MB;
const DRIVE_CHUNK_BYTES = 8 * 1024 * 1024;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

type StorageMode = 'redis' | 'local';
type UploadKind = 'audio' | 'image';

interface DriveStatusResponse {
  connected: boolean;
  storage: StorageMode;
  configOk: boolean;
  reason?: string;
}

interface GoogleUploadConfigResponse {
  clientId: string;
  folderId: string;
  connectedUser: {
    displayName: string | null;
    emailAddress: string | null;
  };
}

interface BrowserDriveUser {
  displayName: string | null;
  emailAddress: string | null;
}

interface BrowserUploadSession {
  fileId: string;
  fileName: string;
  sessionUrl: string;
}

interface PutResult {
  status: number;
  range: string | null;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: () => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

class UploadSessionExpiredError extends Error {}

let gisScriptPromise: Promise<void> | null = null;

function createAuthHeaders(secret: string | undefined): Record<string, string> {
  if (!secret) return {};
  return { 'X-Admin-Secret': secret };
}

async function postJson<T>(
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

function normalizeMimeType(file: File, kind: UploadKind): string {
  const explicit = file.type.trim().toLowerCase();
  if (explicit) return explicit;

  const name = file.name.toLowerCase();
  if (kind === 'audio' && name.endsWith('.mp3')) return 'audio/mpeg';
  if (kind === 'image' && (name.endsWith('.jpg') || name.endsWith('.jpeg'))) return 'image/jpeg';
  if (kind === 'image' && name.endsWith('.png')) return 'image/png';
  if (kind === 'image' && name.endsWith('.webp')) return 'image/webp';
  return explicit;
}

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // no-op
  }
  return raw;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'upload.bin';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function makeDriveFileName(kind: UploadKind, name: string): string {
  const prefix = kind === 'audio' ? 'audio' : 'cover';
  return `${prefix}_${Date.now()}_${sanitizeFileName(name)}`;
}

function parseRangeEnd(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /bytes=0-(\d+)/i.exec(rangeHeader);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = String(email ?? '').trim().toLowerCase();
  return value || null;
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

async function requestDriveAccessToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is not available.');
  }

  return await new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: 'consent select_account',
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google authorization failed.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error('Google authorization popup was blocked or closed.')),
    });

    tokenClient.requestAccessToken();
  });
}

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorMessage(text) || res.statusText);
  }
  return (await res.json()) as T;
}

async function fetchBrowserDriveUser(accessToken: string): Promise<BrowserDriveUser> {
  const data = await fetchJson<{ user?: { displayName?: string; emailAddress?: string } }>(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)&supportsAllDrives=true',
    accessToken
  );
  return {
    displayName: data.user?.displayName ?? null,
    emailAddress: data.user?.emailAddress ?? null,
  };
}

async function generateDriveFileId(accessToken: string): Promise<string> {
  const data = await fetchJson<{ ids?: string[] }>(
    'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',
    accessToken
  );
  const id = data.ids?.[0];
  if (!id) throw new Error('Drive fileId を生成できませんでした。');
  return id;
}

async function startBrowserResumableUpload(
  accessToken: string,
  folderId: string,
  kind: UploadKind,
  file: File
): Promise<BrowserUploadSession> {
  const fileId = await generateDriveFileId(accessToken);
  const fileName = makeDriveFileName(kind, file.name);
  const mimeType = normalizeMimeType(file, kind);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        id: fileId,
        name: fileName,
        parents: [folderId],
        mimeType,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload session の作成に失敗しました: ${parseErrorMessage(text)}`);
  }

  const sessionUrl = res.headers.get('location');
  if (!sessionUrl) throw new Error('Drive upload session URL が返されませんでした。');

  return { fileId, fileName, sessionUrl };
}

function drivePut(
  sessionUrl: string,
  accessToken: string,
  headers: Record<string, string>,
  body: Blob | null,
  onProgress?: (loaded: number, total: number) => void
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    if (body && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
    }
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        range: xhr.getResponseHeader('Range'),
      });
    };
    xhr.onerror = () => reject(new Error('Google Drive upload request failed.'));
    xhr.send(body);
  });
}

async function queryUploadedOffset(
  sessionUrl: string,
  accessToken: string,
  totalBytes: number
): Promise<number> {
  const result = await drivePut(
    sessionUrl,
    accessToken,
    {
      'Content-Length': '0',
      'Content-Range': `*/${totalBytes}`,
    },
    null
  );

  if (result.status === 200 || result.status === 201) return totalBytes;
  if (result.status === 308) {
    const end = parseRangeEnd(result.range);
    return end === null ? 0 : end + 1;
  }
  if (result.status >= 400 && result.status < 500) {
    throw new UploadSessionExpiredError('Drive upload session expired.');
  }
  throw new Error(`Failed to query upload status (${result.status})`);
}

async function uploadFileToDrive(
  sessionUrl: string,
  accessToken: string,
  file: File,
  chunkSize: number,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  let offset = 0;
  let retries = 0;

  while (offset < file.size) {
    const nextOffset = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, nextOffset);

    try {
      const result = await drivePut(
        sessionUrl,
        accessToken,
        {
          'Content-Length': String(chunk.size),
          'Content-Range': `bytes ${offset}-${nextOffset - 1}/${file.size}`,
        },
        chunk,
        (loaded) => onProgress(offset + loaded, file.size)
      );

      if (result.status === 200 || result.status === 201) {
        onProgress(file.size, file.size);
        return;
      }

      if (result.status === 308) {
        const confirmedEnd = parseRangeEnd(result.range);
        offset = confirmedEnd === null ? nextOffset : confirmedEnd + 1;
        retries = 0;
        onProgress(offset, file.size);
        continue;
      }

      if (result.status >= 400 && result.status < 500) {
        throw new UploadSessionExpiredError('Drive upload session expired.');
      }

      if (result.status >= 500) {
        offset = await queryUploadedOffset(sessionUrl, accessToken, file.size);
        retries += 1;
        if (retries > 5) throw new Error('Drive upload retried too many times.');
        onProgress(offset, file.size);
        continue;
      }

      throw new Error(`Unexpected upload response (${result.status})`);
    } catch (error) {
      if (error instanceof UploadSessionExpiredError) throw error;

      offset = await queryUploadedOffset(sessionUrl, accessToken, file.size);
      retries += 1;
      if (retries > 5) {
        throw error instanceof Error ? error : new Error('Drive upload failed.');
      }
      onProgress(offset, file.size);
    }
  }
}

export const Admin: React.FC = () => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adminSecret, setAdminSecret] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);

  const viteSecret = import.meta.env.VITE_ADMIN_SECRET as string | undefined;

  const refreshDriveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/drive-status', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DriveStatusResponse;
      setDriveStatus(data);
    } catch {
      setDriveStatus({
        connected: false,
        storage: 'local',
        configOk: false,
        reason: 'Drive 状態を確認できませんでした。',
      });
    }
  }, []);

  useEffect(() => {
    refreshDriveStatus();
  }, [refreshDriveStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audioFile || !imageFile || !title || !artist) {
      setMessage('必須項目（タイトル、アーティスト、MP3、画像ファイル）を入力してください。');
      return;
    }

    if (driveStatus?.configOk === false) {
      setMessage(`エラー: ${driveStatus.reason ?? 'Vercel 本番設定が不足しています。'}`);
      return;
    }

    if (driveStatus?.connected !== true) {
      setMessage('先に Google Drive と連携してください（下のボタン）。');
      return;
    }

    const audioType = normalizeMimeType(audioFile, 'audio');
    const imageType = normalizeMimeType(imageFile, 'image');

    if (!['audio/mpeg', 'audio/mp3'].includes(audioType)) {
      setMessage('MP3 ファイルのみアップロードできます。');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageType)) {
      setMessage('画像は JPG / PNG / WEBP のみアップロードできます。');
      return;
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      setMessage(`MP3 は ${formatBytes(MAX_AUDIO_BYTES)} 以下にしてください。`);
      return;
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      setMessage(`画像は ${formatBytes(MAX_IMAGE_BYTES)} 以下にしてください。`);
      return;
    }

    const secret = viteSecret?.trim() || adminSecret.trim() || undefined;
    const headers = createAuthHeaders(secret);

    setIsUploading(true);
    setUploadProgress(0);
    setMessage('Google アカウント認証を確認中...');

    try {
      const config = await postJson<GoogleUploadConfigResponse>('/api/admin/google-upload-config', {}, headers);
      const accessToken = await requestDriveAccessToken(config.clientId);
      const browserUser = await fetchBrowserDriveUser(accessToken);
      const serverEmail = normalizeEmail(config.connectedUser.emailAddress);
      const browserEmail = normalizeEmail(browserUser.emailAddress);

      if (serverEmail && browserEmail && serverEmail !== browserEmail) {
        throw new Error(
          `アップロードに使う Google アカウントが違います。サーバー連携済み: ${serverEmail} / 今回選択: ${browserEmail}`
        );
      }

      setMessage('Google Drive のアップロード準備中...');
      const [imageUpload, audioUpload] = await Promise.all([
        startBrowserResumableUpload(accessToken, config.folderId, 'image', imageFile),
        startBrowserResumableUpload(accessToken, config.folderId, 'audio', audioFile),
      ]);

      setMessage('ジャケット画像を Google Drive にアップロード中...');
      await uploadFileToDrive(
        imageUpload.sessionUrl,
        accessToken,
        imageFile,
        Math.min(DRIVE_CHUNK_BYTES, imageFile.size),
        (loaded, total) => {
          const pct = total === 0 ? 0 : loaded / total;
          setUploadProgress(Math.round(pct * 20));
        }
      );

      setMessage('MP3 を Google Drive にアップロード中...');
      await uploadFileToDrive(audioUpload.sessionUrl, accessToken, audioFile, DRIVE_CHUNK_BYTES, (loaded, total) => {
        const pct = total === 0 ? 0 : loaded / total;
        setUploadProgress(20 + Math.round(pct * 70));
      });

      setMessage('カタログを更新中...');
      setUploadProgress(95);

      await postJson<{ track: Track }>(
        '/api/admin/upload/complete',
        {
          title,
          artist,
          description,
          tags,
          audioFileId: audioUpload.fileId,
          imageFileId: imageUpload.fileId,
        },
        headers
      );

      setMessage('アップロードが完了しました。');
      setTitle('');
      setArtist('');
      setDescription('');
      setTags('');
      setAudioFile(null);
      setImageFile(null);
      setUploadProgress(100);

      const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
      fileInputs.forEach((input) => {
        input.value = '';
      });

      window.dispatchEvent(new Event('boss-music-catalog-changed'));
    } catch (error: unknown) {
      console.error('Upload failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      const msg = parseErrorMessage(raw);
      if (error instanceof UploadSessionExpiredError) {
        setMessage('エラー: Drive のアップロードセッションが失効しました。もう一度アップロードしてください。');
      } else if (msg.includes('Unauthorized') || msg.includes('401')) {
        setMessage(
          'エラー: 管理者認証に失敗しました。SESSION_SECRET または ADMIN_SECRET の設定を確認してください。'
        );
      } else {
        setMessage(`エラー: ${msg}`);
      }
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      refreshDriveStatus().catch(() => undefined);
    }
  };

  const driveConnected = driveStatus?.connected ?? null;

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist p-6 md:p-12 pb-32">
      <div className="max-w-2xl mx-auto bg-surface p-8 rounded-xl border border-white/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-headline">楽曲アップロード</h1>
            <p className="text-sm text-white/50 mt-2">
              Vercel 本番ではブラウザから Google Drive に直接アップロードします。
            </p>
          </div>
        </div>

        <div className="mb-8 p-4 rounded-lg border border-white/10 bg-black/20 space-y-3">
          <p className="text-sm font-bold text-white/90">Google Drive 連携（初回・再認証）</p>
          <p className="text-xs text-white/50">
            サーバー連携済みの Google アカウントと同じアカウントでアップロードしてください。Vercel
            本番では Upstash Redis が必須です。
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <a
              href="/api/auth/google"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm font-bold border border-white/20"
            >
              Drive と連携する
            </a>
            <button
              type="button"
              onClick={() => refreshDriveStatus()}
              className="text-sm text-neon-cyan hover:underline"
            >
              連携状態を再確認
            </button>
            {driveConnected === null && <span className="text-xs text-white/40">確認中…</span>}
            {driveStatus && (
              <span className="text-xs text-white/40">
                storage: <span className="font-mono">{driveStatus.storage}</span>
              </span>
            )}
            {driveConnected === true && <span className="text-xs text-neon-green">連携済み</span>}
            {driveStatus?.configOk === false && (
              <span className="text-xs text-amber-400">{driveStatus.reason ?? '本番設定が不足しています。'}</span>
            )}
            {driveStatus?.configOk !== false && driveConnected === false && (
              <span className="text-xs text-amber-400">未連携（上のリンクから許可してください）</span>
            )}
          </div>
        </div>

        <div className="mb-6 p-4 rounded-lg border border-white/10 bg-black/15">
          <label className="block text-xs text-white/50 mb-2">管理者シークレット（ADMIN_SECRET と同じ値・任意）</label>
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder={viteSecret ? 'VITE_ADMIN_SECRET が設定済み' : 'Cookie が無い場合に必要'}
            className="w-full bg-black/50 border border-white/10 rounded p-2 text-white text-sm"
            autoComplete="off"
          />
          <p className="text-[10px] text-white/35 mt-1">
            OAuth 後の Cookie と併用できます。ローカルでは .env に ADMIN_SECRET と
            VITE_ADMIN_SECRET を同じ値で入れると入力不要です。
          </p>
        </div>

        {message && (
          <div
            className={`p-4 mb-6 rounded ${message.includes('エラー') ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30'}`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm mb-2 opacity-70">タイトル *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">アーティスト *</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white h-24"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">タグ (カンマ区切り)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="例: Ambient, Chill, Piano"
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">
              音声ファイル (MP3 / 最大 {formatBytes(MAX_AUDIO_BYTES)}) *
            </label>
            <input
              type="file"
              accept=".mp3,audio/mpeg,audio/mp3"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">
              ジャケット画像 (JPG/PNG/WEBP / 最大 {formatBytes(MAX_IMAGE_BYTES)}) *
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
            {isUploading && uploadProgress > 0 && (
              <div className="mt-2 h-2 w-full bg-black/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-cyan transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isUploading || driveConnected !== true || driveStatus?.configOk === false}
            className="w-full bg-neon-cyan text-black font-bold py-4 rounded-full hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 mt-8"
          >
            {isUploading ? 'アップロード処理中...' : 'アップロード'}
          </button>
        </form>
      </div>
    </div>
  );
};
