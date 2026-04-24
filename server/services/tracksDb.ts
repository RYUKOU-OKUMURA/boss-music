import { neon } from '@neondatabase/serverless';

export interface TrackRow {
  id: string;
  title: string;
  artist: string;
  description: string;
  createdAt: string;
  playlist: string;
  tags: string[];
  playable: boolean;
  order: number;
  audioUrl: string;
  audioPath: string;
  audioSize: number;
  audioContentType: string;
  coverUrl?: string;
  coverPath?: string;
  coverSize?: number;
  coverContentType?: string;
}

export interface UploadedBlobRef {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
}

interface TrackRecord {
  id: string;
  title: string;
  artist: string;
  description: string | null;
  created_at: string | Date;
  playlist: string | null;
  tags: unknown;
  playable: boolean;
  sort_order: number;
  audio_url: string;
  audio_path: string;
  audio_size: number | string;
  audio_content_type: string;
  cover_url: string | null;
  cover_path: string | null;
  cover_size: number | string | null;
  cover_content_type: string | null;
}

let schemaReady: Promise<void> | null = null;

function getSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    const err = new Error('DATABASE_URL is required') as Error & { code?: string };
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
  return neon(url);
}

function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().split('T')[0] ?? value.toISOString();
  return value.includes('T') ? value.split('T')[0] ?? value : value;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag)).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((tag) => String(tag)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapTrack(row: TrackRecord): TrackRow {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    description: row.description ?? '',
    createdAt: dateOnly(row.created_at),
    playlist: row.playlist?.trim() || 'BGM',
    tags: parseTags(row.tags),
    playable: row.playable,
    order: row.sort_order,
    audioUrl: row.audio_url,
    audioPath: row.audio_path,
    audioSize: toNumber(row.audio_size) ?? 0,
    audioContentType: row.audio_content_type,
    ...(row.cover_url ? { coverUrl: row.cover_url } : {}),
    ...(row.cover_path ? { coverPath: row.cover_path } : {}),
    ...(row.cover_size !== null ? { coverSize: toNumber(row.cover_size) ?? 0 } : {}),
    ...(row.cover_content_type ? { coverContentType: row.cover_content_type } : {}),
  };
}

function createTrackError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function normalizePlaylistValue(value: string): string {
  return value.trim() || 'BGM';
}

function normalizeRequiredText(value: string): string | null {
  const normalized = value.trim();
  return normalized || null;
}

export async function ensureTracksSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS tracks (
        id text PRIMARY KEY,
        title text NOT NULL,
        artist text NOT NULL,
        description text,
        created_at date NOT NULL DEFAULT CURRENT_DATE,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        playable boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        audio_url text NOT NULL,
        audio_path text NOT NULL,
        audio_size bigint NOT NULL,
        audio_content_type text NOT NULL,
        cover_url text,
        cover_path text,
        cover_size bigint,
        cover_content_type text,
        inserted_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `
      .then(() => sql`
        ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS playlist text NOT NULL DEFAULT 'BGM'
      `)
      .then(() => undefined);
  }
  await schemaReady;
}

export async function listTracks(): Promise<TrackRow[]> {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM tracks
    ORDER BY sort_order ASC, inserted_at ASC
  `) as TrackRecord[];
  return rows.map(mapTrack);
}

export async function addTrack(input: {
  id: string;
  title: string;
  artist: string;
  description: string;
  playlist: string;
  tags: string[];
  audio: UploadedBlobRef;
  cover?: UploadedBlobRef;
}): Promise<TrackRow> {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO tracks (
      id,
      title,
      artist,
      description,
      created_at,
      playlist,
      tags,
      playable,
      sort_order,
      audio_url,
      audio_path,
      audio_size,
      audio_content_type,
      cover_url,
      cover_path,
      cover_size,
      cover_content_type
    )
    VALUES (
      ${input.id},
      ${input.title},
      ${input.artist},
      ${input.description},
      CURRENT_DATE,
      ${input.playlist || 'BGM'},
      ${JSON.stringify(input.tags)}::jsonb,
      true,
      (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM tracks),
      ${input.audio.url},
      ${input.audio.pathname},
      ${input.audio.size},
      ${input.audio.contentType},
      ${input.cover?.url ?? null},
      ${input.cover?.pathname ?? null},
      ${input.cover?.size ?? null},
      ${input.cover?.contentType ?? null}
    )
    RETURNING *
  `) as TrackRecord[];
  const row = rows[0];
  if (!row) throw new Error('Failed to add track');
  return mapTrack(row);
}

export async function updateTrackPlaylistById(id: string, playlist: string): Promise<TrackRow> {
  await ensureTracksSchema();
  const normalizedPlaylist = normalizePlaylistValue(playlist);
  const sql = getSql();
  const rows = (await sql`
    UPDATE tracks
    SET
      playlist = ${normalizedPlaylist},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as TrackRecord[];
  const row = rows[0];
  if (!row) {
    const err = new Error('Track not found') as Error & { code?: string };
    err.code = 'TRACK_NOT_FOUND';
    throw err;
  }
  return mapTrack(row);
}

export async function updateTrackOrder(trackIds: string[]): Promise<TrackRow[]> {
  await ensureTracksSchema();
  const sql = getSql();

  if (trackIds.length > 0) {
    const missing = (await sql`
      WITH incoming AS (
        SELECT id, MIN(ordinality) - 1 AS sort_order
        FROM unnest(${trackIds}::text[]) WITH ORDINALITY AS input(id, ordinality)
        GROUP BY id
      )
      SELECT incoming.id
      FROM incoming
      LEFT JOIN tracks ON tracks.id = incoming.id
      WHERE tracks.id IS NULL
      LIMIT 1
    `) as Array<{ id: string }>;

    if (missing[0]) {
      throw createTrackError('TRACK_NOT_FOUND', 'Track not found');
    }
  }

  await sql`
    WITH incoming AS (
      SELECT id, MIN(ordinality) - 1 AS sort_order
      FROM unnest(${trackIds}::text[]) WITH ORDINALITY AS input(id, ordinality)
      GROUP BY id
    )
    UPDATE tracks
    SET
      sort_order = incoming.sort_order,
      updated_at = now()
    FROM incoming
    WHERE tracks.id = incoming.id
  `;

  return listTracks();
}

export async function updateTrackMetadataById(
  id: string,
  input: { title: string; artist: string; description: string; playlist: string }
): Promise<TrackRow> {
  await ensureTracksSchema();

  const title = normalizeRequiredText(input.title);
  const artist = normalizeRequiredText(input.artist);
  if (!title || !artist) {
    throw createTrackError('TRACK_VALIDATION_FAILED', 'Track validation failed');
  }

  const description = input.description.trim();
  const playlist = normalizePlaylistValue(input.playlist);
  const sql = getSql();
  const rows = (await sql`
    UPDATE tracks
    SET
      title = ${title},
      artist = ${artist},
      description = ${description},
      playlist = ${playlist},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as TrackRecord[];
  const row = rows[0];
  if (!row) {
    throw createTrackError('TRACK_NOT_FOUND', 'Track not found');
  }
  return mapTrack(row);
}

export async function findTrackById(id: string): Promise<TrackRow | null> {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM tracks
    WHERE id = ${id}
    LIMIT 1
  `) as TrackRecord[];
  return rows[0] ? mapTrack(rows[0]) : null;
}

export async function renamePlaylist(from: string, to: string): Promise<TrackRow[]> {
  await ensureTracksSchema();

  const fromPlaylist = from.trim();
  const toPlaylist = to.trim();
  if (!fromPlaylist || !toPlaylist || fromPlaylist === toPlaylist) {
    throw createTrackError('TRACK_VALIDATION_FAILED', 'Track validation failed');
  }

  const sql = getSql();
  const existing = (await sql`
    SELECT id
    FROM tracks
    WHERE COALESCE(NULLIF(BTRIM(playlist), ''), 'BGM') = ${fromPlaylist}
    LIMIT 1
  `) as Array<{ id: string }>;

  if (!existing[0]) {
    throw createTrackError('TRACK_NOT_FOUND', 'Track not found');
  }

  await sql`
    UPDATE tracks
    SET
      playlist = ${toPlaylist},
      updated_at = now()
    WHERE COALESCE(NULLIF(BTRIM(playlist), ''), 'BGM') = ${fromPlaylist}
  `;

  return listTracks();
}

export async function updateTrackCoverById(
  id: string,
  cover: UploadedBlobRef | null
): Promise<{ track: TrackRow; oldCoverPath?: string }> {
  await ensureTracksSchema();
  const before = await findTrackById(id);
  if (!before) {
    const err = new Error('Track not found') as Error & { code?: string };
    err.code = 'TRACK_NOT_FOUND';
    throw err;
  }

  const sql = getSql();
  const rows = (await sql`
    UPDATE tracks
    SET
      cover_url = ${cover?.url ?? null},
      cover_path = ${cover?.pathname ?? null},
      cover_size = ${cover?.size ?? null},
      cover_content_type = ${cover?.contentType ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as TrackRecord[];
  const row = rows[0];
  if (!row) throw new Error('Failed to update track cover');
  return {
    track: mapTrack(row),
    ...(before.coverPath ? { oldCoverPath: before.coverPath } : {}),
  };
}

export async function removeTrackById(id: string): Promise<TrackRow> {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM tracks
    WHERE id = ${id}
    RETURNING *
  `) as TrackRecord[];
  const row = rows[0];
  if (!row) {
    const err = new Error('Track not found') as Error & { code?: string };
    err.code = 'TRACK_NOT_FOUND';
    throw err;
  }
  return mapTrack(row);
}
