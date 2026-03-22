import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

export const Admin: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [imageProgress, setImageProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
      setMessage('ログインに失敗しました。');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const uploadFileWithProgress = (file: File, path: string, onProgress: (progress: number) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (err) {
            reject(err);
          }
        }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !imageFile || !title || !artist) {
      setMessage('必須項目（タイトル、アーティスト、音声ファイル、画像ファイル）を入力してください。');
      return;
    }

    setIsUploading(true);
    setAudioProgress(0);
    setImageProgress(0);
    setMessage('アップロードを開始しています...');

    try {
      // 1. Upload Audio
      setMessage('音声ファイルをアップロード中...');
      const audioUrl = await uploadFileWithProgress(
        audioFile, 
        `audio/${Date.now()}_${audioFile.name}`, 
        setAudioProgress
      );

      // 2. Upload Image
      setMessage('画像ファイルをアップロード中...');
      const coverImage = await uploadFileWithProgress(
        imageFile, 
        `images/${Date.now()}_${imageFile.name}`, 
        setImageProgress
      );

      // 3. Save to Firestore
      setMessage('データベースに登録中...');
      const tracksRef = collection(db, 'tracks');
      const snapshot = await getDocs(tracksRef);
      const order = snapshot.size; // Simple ordering

      const newTrack = {
        title,
        artist,
        description,
        tags: tags.split(',').map(t => t.trim()).filter(t => t),
        audioUrl,
        coverImage,
        createdAt: new Date().toISOString().split('T')[0],
        order,
        playable: true
      };

      await addDoc(tracksRef, newTrack);

      setMessage('アップロードが完了しました！');
      setTitle('');
      setArtist('');
      setDescription('');
      setTags('');
      setAudioFile(null);
      setImageFile(null);
      setAudioProgress(0);
      setImageProgress(0);
      
      // Reset file inputs
      const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
      fileInputs.forEach(input => input.value = '');

    } catch (error: any) {
      console.error('Upload failed', error);
      
      // Provide more helpful error messages for common Firebase errors
      if (error?.code === 'storage/unauthorized') {
        setMessage('エラー: ストレージへのアクセス権限がありません。Firebase ConsoleでStorageのルールを確認してください。');
      } else if (error?.code === 'permission-denied') {
        setMessage(`エラー: データベースへのアクセス権限がありません。ログイン中のアカウント（${user?.email}）が管理者として登録されていないか、データ形式が不正です。`);
      } else if (error?.code === 'storage/retry-limit-exceeded' || error?.message?.includes('retry')) {
        setMessage('エラー: ストレージへの接続がタイムアウトしました。Firebase Consoleで「Storage」が有効化されているか確認してください。');
      } else {
        setMessage(`エラーが発生しました: Firebase Storageが有効化されていない可能性があります。Firebase ConsoleからStorageを「開始」してください。（詳細: ${error.message || '不明なエラー'}）`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zen-bg text-zen-mist flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-headline mb-8">管理者ログイン</h1>
        <button 
          onClick={handleLogin}
          className="bg-white text-black px-6 py-3 rounded-full font-bold hover:scale-105 transition-transform"
        >
          Googleでログイン
        </button>
        {message && <p className="mt-4 text-red-400">{message}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist p-6 md:p-12 pb-32">
      <div className="max-w-2xl mx-auto bg-surface p-8 rounded-xl border border-white/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-headline">楽曲アップロード</h1>
            <p className="text-sm text-white/50 mt-2">ログイン中: {user.email}</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white px-4 py-2 border border-white/10 rounded-full">ログアウト</button>
        </div>

        {message && (
          <div className={`p-4 mb-6 rounded ${message.includes('エラー') ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm mb-2 opacity-70">タイトル *</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
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
              onChange={e => setArtist(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">説明</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white h-24"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">タグ (カンマ区切り)</label>
            <input 
              type="text" 
              value={tags}
              onChange={e => setTags(e.target.value)}
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
              onChange={e => setAudioFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
            {isUploading && audioProgress > 0 && (
              <div className="mt-2 h-2 w-full bg-black/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-neon-cyan transition-all duration-300"
                  style={{ width: `${audioProgress}%` }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm mb-2 opacity-70">ジャケット画像 (JPG/PNG) *</label>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              onChange={e => setImageFile(e.target.files?.[0] || null)}
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white"
              required
              disabled={isUploading}
            />
            {isUploading && imageProgress > 0 && (
              <div className="mt-2 h-2 w-full bg-black/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-neon-purple transition-all duration-300"
                  style={{ width: `${imageProgress}%` }}
                />
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={isUploading}
            className="w-full bg-neon-cyan text-black font-bold py-4 rounded-full hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 mt-8"
          >
            {isUploading ? 'アップロード処理中...' : 'アップロード'}
          </button>
        </form>
      </div>
    </div>
  );
};
