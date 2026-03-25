const DB_NAME = 'boss-music-audio-cache';
const STORE = 'blobs';
const MAX_ENTRIES = 10;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'trackId' });
    };
  });
}

interface Row {
  trackId: string;
  blob: Blob;
  lastUsed: number;
}

async function getAllRows(): Promise<Row[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve((r.result as Row[]) || []);
  });
}

async function putRow(row: Row): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row);
  });
}

async function deleteRow(trackId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(trackId);
  });
}

async function evictIfNeeded(): Promise<void> {
  const rows = await getAllRows();
  if (rows.length < MAX_ENTRIES) return;
  rows.sort((a, b) => a.lastUsed - b.lastUsed);
  const toDrop = rows.slice(0, rows.length - MAX_ENTRIES + 1);
  for (const r of toDrop) {
    await deleteRow(r.trackId);
  }
}

async function getRow(trackId: string): Promise<Row | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(trackId);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result as Row | undefined);
  });
}

/**
 * Drive プロキシ URL は `<audio src>` 直付けだと Range/デコード周りで環境によって
 * MEDIA_ERR_SRC_NOT_SUPPORTED になることがあるため、フル取得した Blob を `blob:` で渡す。
 * LRU で再訪問時はディスクキャッシュ相当。
 */
export async function resolveAudioSource(trackId: string, streamUrl: string): Promise<string> {
  const isDriveProxy =
    streamUrl.startsWith('/api/media/audio/') || streamUrl.includes('/api/media/audio/');
  if (!isDriveProxy) {
    return streamUrl;
  }

  try {
    const existing = await getRow(trackId);
    if (existing) {
      existing.lastUsed = Date.now();
      await putRow(existing);
      return URL.createObjectURL(existing.blob);
    }

    await evictIfNeeded();
    const res = await fetch(streamUrl);
    if (!res.ok) {
      return streamUrl;
    }
    const blob = await res.blob();
    await putRow({ trackId, blob, lastUsed: Date.now() });
    return URL.createObjectURL(blob);
  } catch {
    return streamUrl;
  }
}

export function revokeObjectUrl(url: string | undefined) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}
