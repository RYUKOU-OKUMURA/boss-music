import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../context/AudioContext';
import {
  createAuthHeaders,
  deleteJson,
  explainUploadError,
  getJson,
  parseErrorMessage,
  postJson,
} from '../admin/adminHttp';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '../admin/constants';
import { normalizeMimeType, uploadFileToBlob } from '../admin/blobBrowserUpload';
import { formatBytes } from '../admin/formatBytes';
import type { StorageStatusResponse, UploadedBlobInfo } from '../admin/types';
import { parseMp3Metadata } from '../admin/parseMp3Id3';

export const Admin: React.FC = () => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adminSecret, setAdminSecret] = useState('');
  const [id3Loading, setId3Loading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [storageStatus, setStorageStatus] = useState<StorageStatusResponse | null>(null);
  const [catalogTracks, setCatalogTracks] = useState<Track[] | null>(null);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksLoadError, setTracksLoadError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  /** 画像ファイル入力でユーザーが選んだあとは、MP3 の ID3 ジャケで上書きしない */
  const coverChosenManuallyRef = useRef(false);
  const id3ParseGenRef = useRef(0);
  const viteSecret = import.meta.env.VITE_ADMIN_SECRET as string | undefined;

  const authHeaders = useCallback(
    () => createAuthHeaders(viteSecret?.trim() || adminSecret.trim() || undefined),
    [viteSecret, adminSecret]
  );

  const refreshTracks = useCallback(async () => {
    setTracksLoading(true);
    setTracksLoadError(null);
    try {
      const data = await getJson<{ tracks: Track[] }>('/api/tracks');
      setCatalogTracks(data.tracks);
    } catch (e: unknown) {
      setCatalogTracks([]);
      setTracksLoadError(parseErrorMessage(e instanceof Error ? e.message : '読み込み失敗'));
    } finally {
      setTracksLoading(false);
    }
  }, []);

  const refreshStorageStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/storage-status', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      setStorageStatus((await res.json()) as StorageStatusResponse);
    } catch {
      setStorageStatus({
        configOk: false,
        storage: 'vercel-blob+neon',
        reason: 'Blob / DB 状態を確認できませんでした。',
      });
    }
  }, []);

  useEffect(() => {
    void refreshTracks();
    void refreshStorageStatus();
  }, [refreshStorageStatus, refreshTracks]);

  useEffect(() => {
    const onCatalog = () => void refreshTracks();
    window.addEventListener('boss-music-catalog-changed', onCatalog);
    return () => window.removeEventListener('boss-music-catalog-changed', onCatalog);
  }, [refreshTracks]);

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAudioFile(file);
    if (!file) return;

    const gen = ++id3ParseGenRef.current;
    setId3Loading(true);
    void (async () => {
      try {
        const result = await parseMp3Metadata(file);
        if (gen !== id3ParseGenRef.current) return;

        setTitle((prev) => (prev.trim() === '' ? result.title ?? prev : prev));
        setArtist((prev) => (prev.trim() === '' ? result.artist ?? prev : prev));
        if (result.warning) setMessage(result.warning);
        if (!coverChosenManuallyRef.current && result.coverFile) setImageFile(result.coverFile);
      } finally {
        if (gen === id3ParseGenRef.current) setId3Loading(false);
      }
    })();
  };

  function makeTrackId(): string {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function validateStorageReady(): boolean {
    if (storageStatus?.configOk === false) {
      setMessage(`エラー: ${storageStatus.reason ?? 'Vercel Blob / Neon DB の設定が不足しています。'}`);
      return false;
    }
    return true;
  }

  function validateAudio(file: File): boolean {
    const audioType = normalizeMimeType(file, 'audio');
    if (!['audio/mpeg', 'audio/mp3'].includes(audioType)) {
      setMessage('MP3 ファイルのみアップロードできます。');
      return false;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setMessage(`MP3 は ${formatBytes(MAX_AUDIO_BYTES)} 以下にしてください。`);
      return false;
    }
    return true;
  }

  function validateImage(file: File): boolean {
    const imageType = normalizeMimeType(file, 'image');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageType)) {
      setMessage('画像は JPG / PNG / WEBP のみアップロードできます。');
      return false;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMessage(`画像は ${formatBytes(MAX_IMAGE_BYTES)} 以下にしてください。`);
      return false;
    }
    return true;
  }

  const handleCoverReplace = async (trackId: string, file: File) => {
    if (!validateStorageReady() || !validateImage(file)) return;

    const headers = authHeaders();
    setRowBusyId(trackId);
    setMessage('ジャケット画像を Vercel Blob にアップロード中...');

    try {
      const image = await uploadFileToBlob(trackId, 'image', file, headers);
      setMessage('カタログを更新中...');
      await postJson<{ track: Track }>(
        `/api/admin/tracks/${encodeURIComponent(trackId)}/cover`,
        { image },
        headers
      );

      setMessage('ジャケット画像を更新しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
      await refreshTracks();
    } catch (error: unknown) {
      console.error('Cover replace failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      const msg = parseErrorMessage(raw);
      if (msg.includes('Unauthorized') || msg.includes('401')) {
        setMessage('エラー: 管理者認証に失敗しました。SESSION_SECRET または ADMIN_SECRET の設定を確認してください。');
      } else {
        setMessage(`エラー: ${explainUploadError(msg)}`);
      }
    } finally {
      setRowBusyId(null);
      void refreshStorageStatus();
    }
  };

  const handleDeleteCover = async (trackId: string) => {
    if (!window.confirm('この曲のジャケット画像を削除しますか？Blob 上の画像ファイルも削除します。')) return;
    const headers = authHeaders();
    setRowBusyId(trackId);
    setMessage('');
    try {
      await deleteJson<{ track: Track | null }>(`/api/admin/tracks/${encodeURIComponent(trackId)}/cover`, headers);
      setMessage('ジャケット画像を削除しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
      await refreshTracks();
    } catch (error: unknown) {
      console.error('Delete cover failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      setMessage(`エラー: ${parseErrorMessage(raw)}`);
    } finally {
      setRowBusyId(null);
    }
  };

  const handleDeleteTrack = async (trackId: string, trackTitle: string) => {
    if (!window.confirm(`「${trackTitle}」をカタログから削除し、Blob 上の音声ファイルとジャケット画像も削除しますか？`)) {
      return;
    }
    const headers = authHeaders();
    setRowBusyId(trackId);
    setMessage('');
    try {
      const result = await deleteJson<{ ok: boolean; fileDeleteWarnings?: string[] }>(
        `/api/admin/tracks/${encodeURIComponent(trackId)}`,
        headers
      );
      if (result.fileDeleteWarnings?.length) {
        setMessage(
          `曲はカタログから削除しました。一部の Blob ファイル削除に失敗した可能性があります（${result.fileDeleteWarnings.join(', ')}）。`
        );
      } else {
        setMessage('曲を削除しました。');
      }
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
      await refreshTracks();
    } catch (error: unknown) {
      console.error('Delete track failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      setMessage(`エラー: ${parseErrorMessage(raw)}`);
    } finally {
      setRowBusyId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (!audioFile || !title || !artist) {
      setMessage('必須項目（タイトル、アーティスト、MP3 ファイル）を入力してください。');
      return;
    }
    if (!validateStorageReady() || !validateAudio(audioFile)) return;
    if (imageFile && !validateImage(imageFile)) return;

    const headers = authHeaders();
    const trackId = makeTrackId();

    setIsUploading(true);
    setUploadProgress(0);
    setMessage('Vercel Blob のアップロード準備中...');

    try {
      let cover: UploadedBlobInfo | undefined;
      if (imageFile) {
        setMessage('ジャケット画像を Vercel Blob にアップロード中...');
        cover = await uploadFileToBlob(trackId, 'image', imageFile, headers, (percentage) => {
          setUploadProgress(Math.round(percentage * 0.2));
        });
      } else {
        setUploadProgress(20);
      }

      setMessage('MP3 を Vercel Blob にアップロード中...');
      const audio = await uploadFileToBlob(trackId, 'audio', audioFile, headers, (percentage) => {
        setUploadProgress(20 + Math.round(percentage * 0.7));
      });

      setMessage('カタログを更新中...');
      setUploadProgress(95);
      await postJson<{ track: Track }>(
        '/api/admin/upload/complete',
        {
          trackId,
          title,
          artist,
          description,
          tags,
          audio,
          cover,
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
      coverChosenManuallyRef.current = false;
      setUploadProgress(100);

      form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
        input.value = '';
      });

      window.dispatchEvent(new Event('boss-music-catalog-changed'));
    } catch (error: unknown) {
      console.error('Upload failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      const msg = parseErrorMessage(raw);
      if (msg.includes('Unauthorized') || msg.includes('401')) {
        setMessage('エラー: 管理者認証に失敗しました。SESSION_SECRET または ADMIN_SECRET の設定を確認してください。');
      } else {
        setMessage(`エラー: ${explainUploadError(msg)}`);
      }
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      void refreshStorageStatus();
    }
  };

  const configOk = storageStatus?.configOk !== false;
  const rowSectionDisabled = rowBusyId !== null || isUploading;

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist p-6 md:p-12 pb-32">
      <div className="max-w-2xl mx-auto bg-surface p-8 rounded-xl border border-white/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-headline">楽曲アップロード</h1>
            <p className="text-sm text-white/50 mt-2">
              音源とジャケット画像は Vercel Blob、曲情報は Neon DB に保存します。
            </p>
          </div>
        </div>

        <div className="mb-8 p-4 rounded-lg border border-white/10 bg-black/20 space-y-3">
          <p className="text-sm font-bold text-white/90">ストレージ設定</p>
          <p className="text-xs text-white/50">
            Vercel に <span className="font-mono">BLOB_READ_WRITE_TOKEN</span>、Neon に{' '}
            <span className="font-mono">DATABASE_URL</span> を設定してください。
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button type="button" onClick={() => refreshStorageStatus()} className="text-sm text-neon-cyan hover:underline">
              状態を再確認
            </button>
            {storageStatus && (
              <span className="text-xs text-white/40">
                storage: <span className="font-mono">{storageStatus.storage}</span>
              </span>
            )}
            {storageStatus?.configOk === true && <span className="text-xs text-neon-green">設定済み</span>}
            {storageStatus?.configOk === false && (
              <span className="text-xs text-amber-400">{storageStatus.reason ?? '本番設定が不足しています。'}</span>
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
            ローカルでは .env に ADMIN_SECRET と VITE_ADMIN_SECRET を同じ値で入れると入力不要です。
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
              onChange={handleAudioFileChange}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
            {id3Loading && <p className="mt-2 text-xs text-white/45">ID3 タグを読み込み中…</p>}
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">
              ジャケット画像 (JPG/PNG/WEBP / 最大 {formatBytes(MAX_IMAGE_BYTES)} / 任意)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                coverChosenManuallyRef.current = Boolean(next);
                setImageFile(next);
              }}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              disabled={isUploading}
            />
            {isUploading && uploadProgress > 0 && (
              <div className="mt-2 h-2 w-full bg-black/50 rounded-full overflow-hidden">
                <div className="h-full bg-neon-cyan transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isUploading || rowBusyId !== null || !configOk}
            className="w-full bg-neon-cyan text-black font-bold py-4 rounded-full hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 mt-8"
          >
            {isUploading ? 'アップロード処理中...' : 'アップロード'}
          </button>
        </form>

        <div className="mt-16 pt-10 border-t border-white/10 space-y-4">
          <h2 className="text-xl font-headline text-white">登録済みトラック</h2>
          <p className="text-xs text-white/50">
            ジャケットの差し替え・削除、曲の削除ができます（DB と Blob ファイルを更新します）。
          </p>

          {tracksLoading && <p className="text-sm text-white/50">読み込み中…</p>}
          {tracksLoadError && <p className="text-sm text-red-300">{tracksLoadError}</p>}

          {!tracksLoading && !tracksLoadError && catalogTracks && catalogTracks.length === 0 && (
            <p className="text-sm text-white/50">まだ登録された曲がありません。</p>
          )}

          <ul className="space-y-4">
            {catalogTracks?.map((track) => (
              <li
                key={track.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border border-white/10 bg-black/20"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                    {track.coverImage ? (
                      <img src={track.coverImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">
                        なし
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{track.title}</p>
                    <p className="text-sm text-white/50 truncate">{track.artist}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={rowSectionDisabled || !configOk}
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = '';
                        if (f) void handleCoverReplace(track.id, f);
                      }}
                    />
                    <span
                      className={`inline-block text-xs font-bold px-3 py-2 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 ${
                        rowSectionDisabled || !configOk ? 'opacity-40 pointer-events-none' : ''
                      }`}
                    >
                      {rowBusyId === track.id ? '処理中…' : 'カバー変更'}
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={rowSectionDisabled || !configOk || !track.coverImage}
                    onClick={() => void handleDeleteCover(track.id)}
                    className="text-xs font-bold px-3 py-2 rounded-full border border-amber-500/40 text-amber-200/90 hover:bg-amber-500/10 disabled:opacity-40"
                  >
                    ジャケット削除
                  </button>

                  <button
                    type="button"
                    disabled={rowSectionDisabled || !configOk}
                    onClick={() => void handleDeleteTrack(track.id, track.title)}
                    className="text-xs font-bold px-3 py-2 rounded-full border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    曲を削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
