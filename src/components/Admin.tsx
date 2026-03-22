import React, { useState, useEffect, useCallback } from 'react';
import type { Track } from '../context/AudioContext';

function postUploadWithProgress(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void,
  extraHeaders?: Record<string, string>
): Promise<{ track: Track }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        xhr.setRequestHeader(k, v);
      }
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid JSON from server'));
        }
      } else {
        reject(new Error(xhr.responseText || xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
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
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);

  const viteSecret = import.meta.env.VITE_ADMIN_SECRET as string | undefined;

  const refreshDriveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/drive-status');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { connected: boolean };
      setDriveConnected(data.connected);
    } catch {
      setDriveConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshDriveStatus();
  }, [refreshDriveStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !imageFile || !title || !artist) {
      setMessage('必須項目（タイトル、アーティスト、音声ファイル、画像ファイル）を入力してください。');
      return;
    }

    if (!driveConnected) {
      setMessage('先に Google Drive と連携してください（下のボタン）。');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setMessage('アップロードを開始しています...');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('image', imageFile);
      formData.append('title', title);
      formData.append('artist', artist);
      formData.append('description', description);
      formData.append('tags', tags);

      const headers: Record<string, string> = {};
      const secret = viteSecret?.trim() || adminSecret.trim();
      if (secret) {
        headers['X-Admin-Secret'] = secret;
      }

      setMessage('サーバー経由で Google Drive にアップロード中...');
      await postUploadWithProgress('/api/admin/upload', formData, setUploadProgress, headers);

      setMessage('アップロードが完了しました！');
      setTitle('');
      setArtist('');
      setDescription('');
      setTags('');
      setAudioFile(null);
      setImageFile(null);
      setUploadProgress(0);

      const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
      fileInputs.forEach((input) => (input.value = ''));

      window.dispatchEvent(new Event('boss-music-catalog-changed'));
    } catch (error: unknown) {
      console.error('Upload failed', error);
      const msg = error instanceof Error ? error.message : '不明なエラー';
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        setMessage(
          'エラー: 管理者認証に失敗しました。Drive 連携後にセッション Cookie が付くよう SESSION_SECRET を設定するか、.env の ADMIN_SECRET と（開発用）VITE_ADMIN_SECRET を揃えてください。'
        );
      } else {
        setMessage(`エラー: ${msg}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist p-6 md:p-12 pb-32">
      <div className="max-w-2xl mx-auto bg-surface p-8 rounded-xl border border-white/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-headline">楽曲アップロード</h1>
            <p className="text-sm text-white/50 mt-2">Firebase は使いません。カタログは Drive 上の JSON です。</p>
          </div>
        </div>

        <div className="mb-8 p-4 rounded-lg border border-white/10 bg-black/20 space-y-3">
          <p className="text-sm font-bold text-white/90">Google Drive 連携（初回・再認証）</p>
          <p className="text-xs text-white/50">
            楽曲とカタログはあなたの Google ドライブの指定フォルダに保存されます。別タブで許可画面が開きます。連携後、SESSION_SECRET が設定されていれば管理者用 Cookie が付きます。
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
            {driveConnected === true && <span className="text-xs text-neon-green">連携済み</span>}
            {driveConnected === false && (
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
            OAuth 後の Cookie と併用可。ローカルでは .env に ADMIN_SECRET と VITE_ADMIN_SECRET を同じ値で入れると入力不要です。
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
            <label className="block text-sm mb-2 opacity-70">音声ファイル (MP3) *</label>
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">ジャケット画像 (JPG/PNG) *</label>
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
            disabled={isUploading || driveConnected !== true}
            className="w-full bg-neon-cyan text-black font-bold py-4 rounded-full hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 mt-8"
          >
            {isUploading ? 'アップロード処理中...' : 'アップロード'}
          </button>
        </form>
      </div>
    </div>
  );
};
