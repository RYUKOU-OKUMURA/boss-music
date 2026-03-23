import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import type { drive_v3 } from 'googleapis';
import { KV_CATALOG_FILE_ID } from './kvKeys';
import { getRedis, isRedisConfigured } from './redisStore';
import { assertPersistentStorageConfigured } from './runtimeEnv';

export type DriveClient = drive_v3.Drive;

export const CATALOG_FILENAME = 'boss-music-catalog.json';

const catalogIdPath = () =>
  path.resolve(process.cwd(), process.env.CATALOG_ID_PATH || 'data/catalog-file-id.txt');

export interface TrackRow {
  id: string;
  title: string;
  artist: string;
  description: string;
  createdAt: string;
  tags: string[];
  playable: boolean;
  order: number;
  driveAudioFileId: string;
  driveCoverFileId?: string;
}

export interface CatalogRoot {
  version: number;
  updatedAt: string;
  tracks: TrackRow[];
}

export function emptyCatalog(): CatalogRoot {
  return {
    version: 0,
    updatedAt: new Date().toISOString(),
    tracks: [],
  };
}

async function readStoredCatalogFileId(): Promise<string | null> {
  const env = process.env.GOOGLE_DRIVE_CATALOG_FILE_ID?.trim();
  if (env) return env;
  if (isRedisConfigured()) {
    try {
      const id = await getRedis().get<string>(KV_CATALOG_FILE_ID);
      return typeof id === 'string' && id.trim() ? id.trim() : null;
    } catch {
      return null;
    }
  }
  assertPersistentStorageConfigured();
  try {
    const raw = await fs.readFile(catalogIdPath(), 'utf8');
    return raw.trim() || null;
  } catch {
    return null;
  }
}

async function writeStoredCatalogFileId(id: string): Promise<void> {
  if (isRedisConfigured()) {
    await getRedis().set(KV_CATALOG_FILE_ID, id);
    return;
  }
  assertPersistentStorageConfigured();
  const p = catalogIdPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, id, 'utf8');
}

/** Find or create catalog file in Drive folder. */
export async function ensureCatalogFile(drive: DriveClient, folderId: string): Promise<string> {
  let id = await readStoredCatalogFileId();
  if (id) {
    try {
      await drive.files.get({ fileId: id, fields: 'id', supportsAllDrives: true });
      return id;
    } catch {
      id = null;
    }
  }

  const q = `'${folderId}' in parents and name = '${CATALOG_FILENAME}' and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 5,
  });
  const found = list.data.files?.[0]?.id;
  if (found) {
    await writeStoredCatalogFileId(found);
    return found;
  }

  const empty = emptyCatalog();
  const buf = Buffer.from(JSON.stringify(empty, null, 2), 'utf8');
  const created = await drive.files.create({
    requestBody: {
      name: CATALOG_FILENAME,
      parents: [folderId],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from(buf),
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const newId = created.data.id;
  if (!newId) throw new Error('Failed to create catalog file');
  await writeStoredCatalogFileId(newId);
  return newId;
}

async function downloadCatalogJson(drive: DriveClient, fileId: string): Promise<CatalogRoot> {
  const gRes = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  const buf = Buffer.from(gRes.data as ArrayBuffer);
  const text = buf.toString('utf8');
  const parsed = JSON.parse(text) as CatalogRoot;
  if (!Array.isArray(parsed.tracks)) parsed.tracks = [];
  if (typeof parsed.version !== 'number') parsed.version = 0;
  return parsed;
}

export async function readCatalog(drive: DriveClient, folderId: string): Promise<{
  catalog: CatalogRoot;
  fileId: string;
}> {
  const fileId = await ensureCatalogFile(drive, folderId);
  const catalog = await downloadCatalogJson(drive, fileId);
  return { catalog, fileId };
}

export async function writeCatalog(drive: DriveClient, fileId: string, catalog: CatalogRoot): Promise<void> {
  catalog.version = (catalog.version ?? 0) + 1;
  catalog.updatedAt = new Date().toISOString();
  const buf = Buffer.from(JSON.stringify(catalog, null, 2), 'utf8');
  await drive.files.update({
    fileId,
    media: {
      mimeType: 'application/json',
      body: Readable.from(buf),
    },
    supportsAllDrives: true,
  });
}

export async function addTrackAndSave(
  drive: DriveClient,
  folderId: string,
  track: TrackRow
): Promise<CatalogRoot> {
  const { catalog, fileId } = await readCatalog(drive, folderId);
  const maxOrder = catalog.tracks.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
  track.order = maxOrder + 1;
  catalog.tracks.push(track);
  catalog.tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  await writeCatalog(drive, fileId, catalog);
  return catalog;
}
