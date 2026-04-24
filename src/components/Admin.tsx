import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const PLAYLIST_PRESETS = ['BGM', 'お気に入り'];
const ADMIN_SECRET_STORAGE_KEY = 'boss-music:admin-secret';
const ALL_PLAYLISTS = '__all__';

interface TrackEditDraft {
  title: string;
  artist: string;
  description: string;
  playlist: string;
}

function readSavedAdminSecret(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveAdminSecret(secret: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = secret.trim();
    if (trimmed) {
      window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable in private browsing or restricted contexts.
  }
}

export const Admin: React.FC = () => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [playlist, setPlaylist] = useState('BGM');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adminSecret, setAdminSecret] = useState(readSavedAdminSecret);
  const [id3Loading, setId3Loading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [storageStatus, setStorageStatus] = useState<StorageStatusResponse | null>(null);
  const [catalogTracks, setCatalogTracks] = useState<Track[] | null>(null);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>([]);
  const [playlistFilter, setPlaylistFilter] = useState(ALL_PLAYLISTS);
  const [dragTrackId, setDragTrackId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TrackEditDraft | null>(null);
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksLoadError, setTracksLoadError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  /** 画像ファイル入力でユーザーが選んだあとは、MP3 の ID3 ジャケで上書きしない */
  const coverChosenManuallyRef = useRef(false);
  const id3ParseGenRef = useRef(0);
  const viteSecret = import.meta.env.VITE_ADMIN_SECRET as string | undefined;

  const playlistOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...PLAYLIST_PRESETS, ...(catalogTracks ?? []).map((track) => track.playlist || 'BGM')].filter((item) => {
      const normalized = item.trim() || 'BGM';
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [catalogTracks]);

  const playlistSummaries = useMemo(() => {
    const summaries = new Map<string, { name: string; count: number }>();
    (catalogTracks ?? []).forEach((track) => {
      const name = track.playlist?.trim() || 'BGM';
      const current = summaries.get(name) ?? { name, count: 0 };
      current.count += 1;
      summaries.set(name, current);
    });
    return Array.from(summaries.values());
  }, [catalogTracks]);

  const visibleTracks = useMemo(() => {
    const tracks = catalogTracks ?? [];
    if (playlistFilter === ALL_PLAYLISTS) return tracks;
    return tracks.filter((track) => (track.playlist?.trim() || 'BGM') === playlistFilter);
  }, [catalogTracks, playlistFilter]);

  const orderDirty = useMemo(() => {
    const trackIds = (catalogTracks ?? []).map((track) => track.id);
    if (trackIds.length !== savedOrderIds.length) return false;
    return trackIds.some((id, index) => id !== savedOrderIds[index]);
  }, [catalogTracks, savedOrderIds]);

  const authHeaders = useCallback(
    () => createAuthHeaders(viteSecret?.trim() || adminSecret.trim() || undefined),
    [viteSecret, adminSecret]
  );

  const handleAdminSecretChange = (nextSecret: string) => {
    setAdminSecret(nextSecret);
    saveAdminSecret(nextSecret);
  };

  const clearSavedAdminSecret = () => {
    setAdminSecret('');
    saveAdminSecret('');
    setMessage('この端末に保存した管理者シークレットを削除しました。');
  };

  const refreshTracks = useCallback(async () => {
    setTracksLoading(true);
    setTracksLoadError(null);
    try {
      const data = await getJson<{ tracks: Track[] }>('/api/tracks');
      setCatalogTracks(data.tracks);
      setSavedOrderIds(data.tracks.map((track) => track.id));
      setDragTrackId(null);
    } catch (e: unknown) {
      setCatalogTracks([]);
      setSavedOrderIds([]);
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
    const gen = ++id3ParseGenRef.current;
    setAudioFile(file);
    if (!file) {
      setId3Loading(false);
      return;
    }

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

  function moveTrack(fromIndex: number, toIndex: number): void {
    setCatalogTracks((prev) => {
      if (!prev || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function moveTrackById(trackId: string, toIndex: number): void {
    const fromIndex = (catalogTracks ?? []).findIndex((track) => track.id === trackId);
    moveTrack(fromIndex, toIndex);
  }

  const handleDropTrack = (targetTrackId: string) => {
    if (!dragTrackId || dragTrackId === targetTrackId || playlistFilter !== ALL_PLAYLISTS) {
      setDragTrackId(null);
      return;
    }
    const targetIndex = (catalogTracks ?? []).findIndex((track) => track.id === targetTrackId);
    moveTrackById(dragTrackId, targetIndex);
    setDragTrackId(null);
  };

  const handleSaveOrder = async () => {
    const trackIds = (catalogTracks ?? []).map((track) => track.id);
    if (trackIds.length === 0 || !orderDirty) return;
    const headers = authHeaders();
    setRowBusyId('__reorder__');
    setMessage('曲順を保存中...');
    try {
      const result = await postJson<{ tracks: Track[] }>('/api/admin/tracks/reorder', { trackIds }, headers);
      setCatalogTracks(result.tracks);
      setSavedOrderIds(result.tracks.map((track) => track.id));
      setMessage('曲順を保存しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
    } catch (error: unknown) {
      console.error('Track reorder failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      setMessage(`エラー: ${parseErrorMessage(raw)}`);
      await refreshTracks();
    } finally {
      setRowBusyId(null);
    }
  };

  const handleResetOrder = () => {
    setCatalogTracks((prev) => {
      if (!prev) return prev;
      const order = new Map<string, number>(savedOrderIds.map((id, index) => [id, index]));
      return [...prev].sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    });
    setDragTrackId(null);
    setMessage('未保存の曲順変更を戻しました。');
  };

  const beginEditTrack = (track: Track) => {
    setEditingTrackId(track.id);
    setEditDraft({
      title: track.title,
      artist: track.artist,
      description: track.description,
      playlist: track.playlist || 'BGM',
    });
  };

  const handleEditDraftChange = (field: keyof TrackEditDraft, value: string) => {
    setEditDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveTrackMetadata = async (trackId: string) => {
    if (!editDraft) return;
    const titleNext = editDraft.title.trim();
    const artistNext = editDraft.artist.trim();
    if (!titleNext || !artistNext) {
      setMessage('エラー: タイトルとアーティストは必須です。');
      return;
    }

    const headers = authHeaders();
    setRowBusyId(trackId);
    setMessage('');
    try {
      await postJson<{ track: Track }>(
        `/api/admin/tracks/${encodeURIComponent(trackId)}`,
        {
          title: titleNext,
          artist: artistNext,
          description: editDraft.description.trim(),
          playlist: editDraft.playlist.trim() || 'BGM',
        },
        headers
      );
      setEditingTrackId(null);
      setEditDraft(null);
      setMessage('曲情報を更新しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
      await refreshTracks();
    } catch (error: unknown) {
      console.error('Track metadata update failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      setMessage(`エラー: ${parseErrorMessage(raw)}`);
    } finally {
      setRowBusyId(null);
    }
  };

  const handleRenamePlaylist = async () => {
    const from = renameFrom.trim();
    const to = renameTo.trim();
    if (!from || !to) {
      setMessage('エラー: 変更前と変更後のプレイリスト名を入力してください。');
      return;
    }
    if (from === to) {
      setMessage('エラー: 変更前と変更後のプレイリスト名が同じです。');
      return;
    }

    const headers = authHeaders();
    setRowBusyId('__playlist-rename__');
    setMessage('');
    try {
      const result = await postJson<{ tracks: Track[] }>('/api/admin/playlists/rename', { from, to }, headers);
      setCatalogTracks(result.tracks);
      setSavedOrderIds(result.tracks.map((track) => track.id));
      setPlaylistFilter((current) => (current === from ? to : current));
      setRenameFrom('');
      setRenameTo('');
      setMessage('プレイリスト名を一括変更しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
    } catch (error: unknown) {
      console.error('Playlist rename failed', error);
      const raw = error instanceof Error ? error.message : '不明なエラー';
      setMessage(`エラー: ${parseErrorMessage(raw)}`);
    } finally {
      setRowBusyId(null);
    }
  };

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

  const handlePlaylistChange = async (trackId: string, nextPlaylist: string) => {
    const normalizedPlaylist = nextPlaylist.trim() || 'BGM';
    const headers = authHeaders();
    setRowBusyId(trackId);
    setMessage('');
    try {
      await postJson<{ track: Track }>(
        `/api/admin/tracks/${encodeURIComponent(trackId)}/playlist`,
        { playlist: normalizedPlaylist },
        headers
      );
      setMessage('プレイリストを更新しました。');
      window.dispatchEvent(new Event('boss-music-catalog-changed'));
      await refreshTracks();
    } catch (error: unknown) {
      console.error('Playlist update failed', error);
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
          playlist,
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
      setPlaylist('BGM');
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
  const canReorder = playlistFilter === ALL_PLAYLISTS && !rowSectionDisabled && configOk;

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist p-6 md:p-12 pb-32">
      <div className="max-w-6xl mx-auto bg-surface p-6 md:p-8 rounded-xl border border-white/10">
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
            {storageStatus?.configOk === true && <span className="text-xs text-neon-green">接続確認済み</span>}
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
            onChange={(e) => handleAdminSecretChange(e.target.value)}
            placeholder={viteSecret ? 'VITE_ADMIN_SECRET が設定済み' : '一度入力するとこの端末に保存されます'}
            className="w-full bg-black/50 border border-white/10 rounded p-2 text-white text-sm"
            autoComplete="off"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-white/35">
              入力した値はこのブラウザの localStorage に保存され、次回から自動入力されます。
            </p>
            {adminSecret.trim() && !viteSecret ? (
              <button type="button" onClick={clearSavedAdminSecret} className="text-[10px] text-white/45 hover:text-white">
                保存を削除
              </button>
            ) : null}
          </div>
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
            <label className="block text-sm mb-2 opacity-70">プレイリスト</label>
            <input
              type="text"
              value={playlist}
              list="playlist-presets"
              onChange={(e) => setPlaylist(e.target.value)}
              placeholder="例: BGM, お気に入り"
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              disabled={isUploading}
            />
            <datalist id="playlist-presets">
              {playlistOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
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

        <div className="mt-16 pt-10 border-t border-white/10 space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-headline text-white">登録済みトラック</h2>
              <p className="text-xs text-white/50 mt-2">
                全体順の並び替え、曲情報編集、プレイリスト整理、カバー変更、削除ができます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveOrder()}
                disabled={!orderDirty || rowSectionDisabled || !configOk || playlistFilter !== ALL_PLAYLISTS}
                className="text-xs font-bold px-4 py-2 rounded-full bg-neon-cyan text-black disabled:opacity-40"
              >
                {rowBusyId === '__reorder__' ? '保存中…' : '曲順を保存'}
              </button>
              <button
                type="button"
                onClick={handleResetOrder}
                disabled={!orderDirty || rowSectionDisabled}
                className="text-xs font-bold px-4 py-2 rounded-full border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40"
              >
                並び順を戻す
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Playlists</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlaylistFilter(ALL_PLAYLISTS)}
                  className={`rounded-full px-3 py-2 text-xs font-bold ${
                    playlistFilter === ALL_PLAYLISTS
                      ? 'bg-neon-cyan text-black'
                      : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  すべて {(catalogTracks ?? []).length}
                </button>
                {playlistSummaries.map((summary) => (
                  <button
                    key={summary.name}
                    type="button"
                    onClick={() => setPlaylistFilter(summary.name)}
                    className={`rounded-full px-3 py-2 text-xs font-bold ${
                      playlistFilter === summary.name
                        ? 'bg-neon-purple text-black'
                        : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {summary.name} {summary.count}
                  </button>
                ))}
              </div>
              {playlistFilter !== ALL_PLAYLISTS && (
                <p className="mt-3 text-[11px] text-amber-200/70">
                  曲順保存は全体表示のときだけ使えます。プレイリスト内順は次段階で対応します。
                </p>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Rename Playlist</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  value={renameFrom}
                  onChange={(ev) => setRenameFrom(ev.target.value)}
                  disabled={rowSectionDisabled || !configOk}
                  className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white disabled:opacity-40"
                >
                  <option value="">変更前</option>
                  {playlistSummaries.map((summary) => (
                    <option key={summary.name} value={summary.name}>
                      {summary.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={renameTo}
                  onChange={(ev) => setRenameTo(ev.target.value)}
                  list="playlist-presets"
                  placeholder="変更後"
                  disabled={rowSectionDisabled || !configOk}
                  className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => void handleRenamePlaylist()}
                  disabled={rowSectionDisabled || !configOk || !renameFrom.trim() || !renameTo.trim()}
                  className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  {rowBusyId === '__playlist-rename__' ? '変更中…' : '一括変更'}
                </button>
              </div>
            </div>
          </div>

          {tracksLoading && <p className="text-sm text-white/50">読み込み中…</p>}
          {tracksLoadError && <p className="text-sm text-red-300">{tracksLoadError}</p>}

          {!tracksLoading && !tracksLoadError && catalogTracks && catalogTracks.length === 0 && (
            <p className="text-sm text-white/50">まだ登録された曲がありません。</p>
          )}

          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
            <div className="hidden grid-cols-[56px_72px_minmax(180px,1.5fr)_minmax(140px,0.8fr)_minmax(260px,1.2fr)] gap-3 border-b border-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 lg:grid">
              <span>Order</span>
              <span>Cover</span>
              <span>Track</span>
              <span>Playlist</span>
              <span>Actions</span>
            </div>

            <ul className="divide-y divide-white/10">
              {visibleTracks.map((track) => {
                const globalIndex = (catalogTracks ?? []).findIndex((item) => item.id === track.id);
                const draft = editingTrackId === track.id ? editDraft : null;
                const isEditing = draft !== null;
                const isDragging = dragTrackId === track.id;

                return (
                  <li
                    key={track.id}
                    draggable={canReorder}
                    onDragStart={() => {
                      if (canReorder) setDragTrackId(track.id);
                    }}
                    onDragOver={(ev) => {
                      if (canReorder) ev.preventDefault();
                    }}
                    onDrop={() => handleDropTrack(track.id)}
                    onDragEnd={() => setDragTrackId(null)}
                    className={`p-4 transition-colors ${isDragging ? 'bg-neon-cyan/10' : 'bg-transparent'}`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[56px_72px_minmax(180px,1.5fr)_minmax(140px,0.8fr)_minmax(260px,1.2fr)] lg:items-center">
                      <div className="flex items-center gap-2">
                        <span className="cursor-grab rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/45">
                          ::
                        </span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={!canReorder || globalIndex <= 0}
                            onClick={() => moveTrack(globalIndex, globalIndex - 1)}
                            className="text-[10px] text-white/55 hover:text-white disabled:opacity-25"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={!canReorder || !catalogTracks || globalIndex >= catalogTracks.length - 1}
                            onClick={() => moveTrack(globalIndex, globalIndex + 1)}
                            className="text-[10px] text-white/55 hover:text-white disabled:opacity-25"
                          >
                            ↓
                          </button>
                        </div>
                      </div>

                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                        {track.coverImage ? (
                          <img src={track.coverImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">
                            なし
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={draft.title}
                              onChange={(ev) => handleEditDraftChange('title', ev.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                              disabled={rowSectionDisabled || !configOk}
                            />
                            <input
                              type="text"
                              value={draft.artist}
                              onChange={(ev) => handleEditDraftChange('artist', ev.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                              disabled={rowSectionDisabled || !configOk}
                            />
                            <textarea
                              value={draft.description}
                              onChange={(ev) => handleEditDraftChange('description', ev.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                              rows={2}
                              disabled={rowSectionDisabled || !configOk}
                            />
                          </div>
                        ) : (
                          <>
                            <p className="font-bold text-white truncate">{track.title}</p>
                            <p className="text-sm text-white/50 truncate">{track.artist}</p>
                            {track.description ? (
                              <p className="mt-1 line-clamp-1 text-xs text-white/35">{track.description}</p>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div>
                        <select
                          value={isEditing ? draft.playlist : track.playlist || 'BGM'}
                          disabled={rowSectionDisabled || !configOk}
                          onChange={(ev) => {
                            if (isEditing) {
                              handleEditDraftChange('playlist', ev.target.value);
                            } else {
                              void handlePlaylistChange(track.id, ev.target.value);
                            }
                          }}
                          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                        >
                          {playlistOptions.includes(track.playlist || 'BGM') ? null : (
                            <option value={track.playlist || 'BGM'}>{track.playlist || 'BGM'}</option>
                          )}
                          {playlistOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={rowSectionDisabled || !configOk}
                              onClick={() => void handleSaveTrackMetadata(track.id)}
                              className="text-xs font-bold px-3 py-2 rounded-full bg-neon-green text-black disabled:opacity-40"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              disabled={rowSectionDisabled}
                              onClick={() => {
                                setEditingTrackId(null);
                                setEditDraft(null);
                              }}
                              className="text-xs font-bold px-3 py-2 rounded-full border border-white/20 text-white/70 hover:bg-white/10 disabled:opacity-40"
                            >
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={rowSectionDisabled || !configOk}
                            onClick={() => beginEditTrack(track)}
                            className="text-xs font-bold px-3 py-2 rounded-full border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
                          >
                            編集
                          </button>
                        )}

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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
