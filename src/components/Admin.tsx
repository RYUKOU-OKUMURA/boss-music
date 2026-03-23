import React, { useState, useEffect, useCallback } from 'react';
import type { Track } from '../context/AudioContext';
import { createAuthHeaders, explainUploadError, parseErrorMessage, postJson } from '../admin/adminHttp';
import { DRIVE_CHUNK_BYTES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '../admin/constants';
import {
  fetchBrowserDriveUser,
  normalizeMimeType,
  startBrowserResumableUpload,
  uploadFileToDrive,
} from '../admin/driveBrowserUpload';
import {
  GoogleAuthPopupError,
  UploadSessionExpiredError,
} from '../admin/errors';
import { formatBytes } from '../admin/formatBytes';
import { getDriveAccessTokenForUpload, normalizeEmail } from '../admin/googleIdentity';
import type { BrowserUploadSession, DriveStatusResponse, GoogleUploadConfigResponse } from '../admin/types';

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

    if (!audioFile || !title || !artist) {
      setMessage('必須項目（タイトル、アーティスト、MP3 ファイル）を入力してください。');
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
    const imageType = imageFile ? normalizeMimeType(imageFile, 'image') : '';

    if (!['audio/mpeg', 'audio/mp3'].includes(audioType)) {
      setMessage('MP3 ファイルのみアップロードできます。');
      return;
    }
    if (imageFile && !['image/jpeg', 'image/png', 'image/webp'].includes(imageType)) {
      setMessage('画像は JPG / PNG / WEBP のみアップロードできます。');
      return;
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      setMessage(`MP3 は ${formatBytes(MAX_AUDIO_BYTES)} 以下にしてください。`);
      return;
    }
    if (imageFile && imageFile.size > MAX_IMAGE_BYTES) {
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
      const serverEmail = normalizeEmail(config.connectedUser.emailAddress);
      const accessToken = await getDriveAccessTokenForUpload(config.clientId, serverEmail);
      const browserUser = await fetchBrowserDriveUser(accessToken);
      const browserEmail = normalizeEmail(browserUser.emailAddress);

      if (serverEmail && browserEmail && serverEmail !== browserEmail) {
        throw new Error(
          `アップロードに使う Google アカウントが違います。サーバー連携済み: ${serverEmail} / 今回選択: ${browserEmail}`
        );
      }

      setMessage('Google Drive のアップロード準備中...');
      const audioUploadPromise = startBrowserResumableUpload(accessToken, config.folderId, 'audio', audioFile);
      const imageUploadPromise = imageFile
        ? startBrowserResumableUpload(accessToken, config.folderId, 'image', imageFile)
        : Promise.resolve<BrowserUploadSession | null>(null);
      const [audioUpload, imageUpload] = await Promise.all([audioUploadPromise, imageUploadPromise]);

      if (imageFile && imageUpload) {
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
      } else {
        setUploadProgress(20);
      }

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
          imageFileId: imageUpload?.fileId,
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
      } else if (error instanceof GoogleAuthPopupError) {
        setMessage(`エラー: ${explainUploadError(msg)}`);
      } else if (msg.includes('Unauthorized') || msg.includes('401')) {
        setMessage(
          'エラー: 管理者認証に失敗しました。SESSION_SECRET または ADMIN_SECRET の設定を確認してください。'
        );
      } else {
        setMessage(`エラー: ${explainUploadError(msg)}`);
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
              ジャケット画像 (JPG/PNG/WEBP / 最大 {formatBytes(MAX_IMAGE_BYTES)} / 任意)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
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
