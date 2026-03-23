import crypto from 'crypto';
import { Router } from 'express';
import { loadRefreshToken } from '../services/tokenStore';
import { getConnectedDriveUser, getDrive, getDriveFolderId } from '../services/driveClient';
import {
  addTrackAndSave,
  readCatalog,
  removeTrackById,
  updateTrackCoverById,
  type TrackRow,
} from '../services/catalog';
import { deleteDriveFileIfPresent, verifyDriveUpload } from '../services/driveUploads';
import { getPersistenceStatus } from '../services/runtimeEnv';
import { requireAdmin } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const adminRouter = Router();

interface UploadCompleteBody {
  title?: string;
  artist?: string;
  description?: string;
  tags?: string[] | string;
  audioFileId?: string;
  imageFileId?: string;
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

function isValidationError(error: unknown): error is Error & { code?: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isTrackNotFound(error: unknown): boolean {
  return isValidationError(error) && error.code === 'TRACK_NOT_FOUND';
}

interface CoverUpdateBody {
  imageFileId?: string;
}

adminRouter.get(
  '/admin/drive-status',
  asyncHandler(async (_req, res) => {
    const persistence = getPersistenceStatus();
    if (!persistence.configOk) {
      res.json({
        connected: false,
        storage: persistence.storage,
        configOk: false,
        reason: persistence.reason,
      });
      return;
    }

    const rt = await loadRefreshToken();
    res.json({
      connected: Boolean(rt),
      storage: persistence.storage,
      configOk: true,
    });
  })
);

adminRouter.post(
  '/admin/google-upload-config',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      res.status(500).json({ error: 'GOOGLE_CLIENT_ID is required' });
      return;
    }
    const folderId = getDriveFolderId();
    const user = await getConnectedDriveUser();
    res.json({
      clientId,
      folderId,
      connectedUser: user,
    });
  })
);

adminRouter.post(
  '/admin/upload/complete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as UploadCompleteBody;
    const title = String(body.title ?? '').trim();
    const artist = String(body.artist ?? '').trim();
    const description = String(body.description ?? '').trim();
    const audioFileId = String(body.audioFileId ?? '').trim();
    const imageFileId = String(body.imageFileId ?? '').trim();
    const tags = splitTags(body.tags);

    if (!title || !artist) {
      res.status(400).json({ error: 'title and artist are required' });
      return;
    }
    if (!audioFileId) {
      res.status(400).json({ error: 'audioFileId is required' });
      return;
    }

    const drive = await getDrive();
    const folderId = getDriveFolderId();
    let verifiedAudio: { fileId: string } | null = null;
    let verifiedImage: { fileId: string } | null = null;

    try {
      verifiedAudio = await verifyDriveUpload(drive, audioFileId, 'audio', folderId);
      if (imageFileId) {
        verifiedImage = await verifyDriveUpload(drive, imageFileId, 'image', folderId);
      }

      const track: TrackRow = {
        id: crypto.randomUUID(),
        title,
        artist,
        description,
        createdAt: new Date().toISOString().split('T')[0],
        tags,
        playable: true,
        order: -1,
        driveAudioFileId: verifiedAudio.fileId,
        ...(verifiedImage ? { driveCoverFileId: verifiedImage.fileId } : {}),
      };

      await addTrackAndSave(drive, folderId, track);
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (verifiedAudio) {
        await deleteDriveFileIfPresent(drive, verifiedAudio.fileId);
      }
      if (verifiedImage) {
        await deleteDriveFileIfPresent(drive, verifiedImage.fileId);
      }

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
        'Legacy multipart upload is retired. Use browser-direct Google Drive upload from /admin and finish with /api/admin/upload/complete.',
    });
  })
);

adminRouter.post(
  '/admin/tracks/:id/cover',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const body = (req.body ?? {}) as CoverUpdateBody;
    const imageFileId = String(body.imageFileId ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    if (!imageFileId) {
      res.status(400).json({ error: 'imageFileId is required' });
      return;
    }

    const drive = await getDrive();
    const folderId = getDriveFolderId();

    let verifiedImage: { fileId: string } | null = null;
    try {
      verifiedImage = await verifyDriveUpload(drive, imageFileId, 'image', folderId);
    } catch (error) {
      const err = error as Error & { code?: string };
      if (isValidationError(error) && err.code === 'UPLOAD_VALIDATION_FAILED') {
        res.status(400).json({ error: err.message });
        return;
      }
      throw error;
    }

    try {
      const { catalog } = await readCatalog(drive, folderId);
      const existing = catalog.tracks.find((t) => t.id === id);
      if (!existing) {
        await deleteDriveFileIfPresent(drive, verifiedImage.fileId);
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      const oldCoverId = existing.driveCoverFileId;

      await updateTrackCoverById(drive, folderId, id, verifiedImage.fileId);

      if (oldCoverId && oldCoverId !== verifiedImage.fileId) {
        await deleteDriveFileIfPresent(drive, oldCoverId);
      }

      const { catalog: after } = await readCatalog(drive, folderId);
      const updated = after.tracks.find((t) => t.id === id);
      res.json({ track: updated ? toPublicTrack(updated) : null });
    } catch (error) {
      if (isTrackNotFound(error)) {
        await deleteDriveFileIfPresent(drive, verifiedImage.fileId);
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      await deleteDriveFileIfPresent(drive, verifiedImage.fileId);
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

    const drive = await getDrive();
    const folderId = getDriveFolderId();

    let oldCoverId: string | undefined;
    try {
      const { catalog } = await readCatalog(drive, folderId);
      const existing = catalog.tracks.find((t) => t.id === id);
      if (!existing) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      oldCoverId = existing.driveCoverFileId;
      await updateTrackCoverById(drive, folderId, id, undefined);
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      throw error;
    }

    if (oldCoverId) {
      await deleteDriveFileIfPresent(drive, oldCoverId);
    }

    const { catalog } = await readCatalog(drive, folderId);
    const updated = catalog.tracks.find((t) => t.id === id);
    res.json({ track: updated ? toPublicTrack(updated) : null });
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

    const drive = await getDrive();
    const folderId = getDriveFolderId();

    let removed: TrackRow;
    try {
      const result = await removeTrackById(drive, folderId, id);
      removed = result.removed;
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }
      throw error;
    }

    const fileDeleteErrors: string[] = [];
    if (!keepFiles) {
      try {
        await drive.files.delete({ fileId: removed.driveAudioFileId, supportsAllDrives: true });
      } catch (e) {
        console.error('Failed to delete audio file after track removal', e);
        fileDeleteErrors.push('audio');
      }
      if (removed.driveCoverFileId) {
        try {
          await drive.files.delete({ fileId: removed.driveCoverFileId, supportsAllDrives: true });
        } catch (e) {
          console.error('Failed to delete cover file after track removal', e);
          fileDeleteErrors.push('cover');
        }
      }
    }

    res.json({
      ok: true,
      id: removed.id,
      ...(fileDeleteErrors.length > 0 ? { fileDeleteWarnings: fileDeleteErrors } : {}),
    });
  })
);
