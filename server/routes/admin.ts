import { Router } from 'express';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
  allowedContentTypes,
  deleteBlobIfPresent,
  maxUploadBytes,
  parseUploadKind,
  verifyBlobUpload,
  type BlobUploadPayload,
  type UploadKind,
} from '../services/blobUploads';
import {
  addTrack,
  ensureTracksSchema,
  removeTrackById,
  updateTrackCoverById,
  type UploadedBlobRef,
} from '../services/tracksDb';
import { adminCookieName, createAdminSessionToken, requireAdmin } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const adminRouter = Router();

interface UploadCompleteBody {
  trackId?: string;
  title?: string;
  artist?: string;
  description?: string;
  tags?: string[] | string;
  audio?: BlobUploadPayload;
  cover?: BlobUploadPayload;
}

interface CoverUpdateBody {
  image?: BlobUploadPayload;
}

interface BlobClientPayload {
  kind?: UploadKind;
}

function splitTags(input: string[] | string | undefined): string[] {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }
  const raw = String(input ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseClientPayload(payload: string | null): BlobClientPayload {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload) as BlobClientPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isValidationError(error: unknown): error is Error & { code?: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isTrackNotFound(error: unknown): boolean {
  return isValidationError(error) && error.code === 'TRACK_NOT_FOUND';
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ensureExpectedPath(kind: UploadKind, pathname: string): void {
  const audio = /^tracks\/([0-9a-f-]+)\/audio-[a-zA-Z0-9_-]+\.(mp3)$/i;
  const image = /^tracks\/([0-9a-f-]+)\/cover-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
  const match = kind === 'audio' ? audio.exec(pathname) : image.exec(pathname);
  if (!match?.[1] || !isUuidLike(match[1])) {
    const err = new Error('Blob upload pathname is not allowed') as Error & { code?: string };
    err.code = 'UPLOAD_VALIDATION_FAILED';
    throw err;
  }
}

function getStorageStatus() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL?.trim()) missing.push('DATABASE_URL');
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) missing.push('BLOB_READ_WRITE_TOKEN');
  return {
    configOk: missing.length === 0,
    storage: 'vercel-blob+neon',
    missing,
    reason: missing.length ? `${missing.join(', ')} is required` : undefined,
  };
}

adminRouter.get(
  '/admin/storage-status',
  asyncHandler(async (_req, res) => {
    const status = getStorageStatus();
    if (status.configOk) {
      try {
        await ensureTracksSchema();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Database connection failed';
        res.json({ ...status, configOk: false, reason: message });
        return;
      }
    }
    res.json(status);
  })
);

adminRouter.post(
  '/admin/session',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const token = createAdminSessionToken();
    if (token) {
      res.cookie(adminCookieName, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    res.json({ ok: true, cookieSet: Boolean(token) });
  })
);

adminRouter.post(
  '/admin/blob-upload',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const jsonResponse = await handleUpload({
      request: req,
      body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = parseClientPayload(clientPayload);
        const kind = parseUploadKind(parsed.kind);
        ensureExpectedPath(kind, pathname);
        return {
          allowedContentTypes: allowedContentTypes(kind),
          maximumSizeInBytes: maxUploadBytes(kind),
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ kind }),
        };
      },
    });
    res.json(jsonResponse);
  })
);

adminRouter.post(
  '/admin/upload/complete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as UploadCompleteBody;
    const trackId = String(body.trackId ?? '').trim();
    const title = String(body.title ?? '').trim();
    const artist = String(body.artist ?? '').trim();
    const description = String(body.description ?? '').trim();
    const tags = splitTags(body.tags);

    if (!trackId || !isUuidLike(trackId)) {
      res.status(400).json({ error: 'valid trackId is required' });
      return;
    }
    if (!title || !artist) {
      res.status(400).json({ error: 'title and artist are required' });
      return;
    }
    if (!body.audio) {
      res.status(400).json({ error: 'audio blob metadata is required' });
      return;
    }

    let audio: UploadedBlobRef | null = null;
    let cover: UploadedBlobRef | undefined;

    try {
      audio = await verifyBlobUpload('audio', body.audio);
      ensureExpectedPath('audio', audio.pathname);
      if (body.cover) {
        cover = await verifyBlobUpload('image', body.cover);
        ensureExpectedPath('image', cover.pathname);
      }

      const track = await addTrack({
        id: trackId,
        title,
        artist,
        description,
        tags,
        audio,
        ...(cover ? { cover } : {}),
      });
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (audio) await deleteBlobIfPresent(audio.pathname);
      if (cover) await deleteBlobIfPresent(cover.pathname);
      const err = error as Error & { code?: string };
      if (isValidationError(error) && err.code === 'UPLOAD_VALIDATION_FAILED') {
        res.status(400).json({ error: err.message });
        return;
      }
      throw error;
    }
  })
);

adminRouter.post(
  '/admin/upload',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error:
        'Legacy multipart upload is retired. Use browser-direct Vercel Blob upload from /admin and finish with /api/admin/upload/complete.',
    });
  })
);

adminRouter.post(
  '/admin/tracks/:id/cover',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const body = (req.body ?? {}) as CoverUpdateBody;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    if (!body.image) {
      res.status(400).json({ error: 'image blob metadata is required' });
      return;
    }

    let image: UploadedBlobRef | null = null;
    try {
      image = await verifyBlobUpload('image', body.image);
      ensureExpectedPath('image', image.pathname);
      const { track, oldCoverPath } = await updateTrackCoverById(id, image);
      if (oldCoverPath && oldCoverPath !== image.pathname) {
        await deleteBlobIfPresent(oldCoverPath);
      }
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (image) await deleteBlobIfPresent(image.pathname);
      const err = error as Error & { code?: string };
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      if (isValidationError(error) && err.code === 'UPLOAD_VALIDATION_FAILED') {
        res.status(400).json({ error: err.message });
        return;
      }
      throw error;
    }
  })
);

adminRouter.delete(
  '/admin/tracks/:id/cover',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    try {
      const { track, oldCoverPath } = await updateTrackCoverById(id, null);
      await deleteBlobIfPresent(oldCoverPath);
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      throw error;
    }
  })
);

adminRouter.delete(
  '/admin/tracks/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const keepFiles =
      req.query.keepFiles === '1' ||
      req.query.keepFiles === 'true' ||
      String(req.query.keepFiles ?? '').toLowerCase() === 'yes';

    let removed;
    try {
      removed = await removeTrackById(id);
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      throw error;
    }

    const fileDeleteWarnings: string[] = [];
    if (!keepFiles) {
      const audioDeleted = await deleteBlobIfPresent(removed.audioPath);
      if (!audioDeleted) fileDeleteWarnings.push('audio');
      const coverDeleted = await deleteBlobIfPresent(removed.coverPath);
      if (!coverDeleted) fileDeleteWarnings.push('cover');
    }

    res.json({
      ok: true,
      id: removed.id,
      ...(fileDeleteWarnings.length > 0 ? { fileDeleteWarnings } : {}),
    });
  })
);
