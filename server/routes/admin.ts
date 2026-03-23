import crypto from 'crypto';
import { Readable } from 'stream';
import { Router } from 'express';
import { loadRefreshToken } from '../services/tokenStore';
import { getConnectedDriveUser, getDrive, getDriveFolderId } from '../services/driveClient';
import { addTrackAndSave, type TrackRow } from '../services/catalog';
import { deleteDriveFileIfPresent, verifyDriveUpload } from '../services/driveUploads';
import { getPersistenceStatus, isVercelRuntime } from '../services/runtimeEnv';
import { requireAdmin } from '../middleware/adminAuth';
import { upload } from '../utils/upload';
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
    if (!audioFileId || !imageFileId) {
      res.status(400).json({ error: 'audioFileId and imageFileId are required' });
      return;
    }

    const drive = await getDrive();
    const folderId = getDriveFolderId();
    let verifiedAudio: { fileId: string } | null = null;
    let verifiedImage: { fileId: string } | null = null;

    try {
      verifiedAudio = await verifyDriveUpload(drive, audioFileId, 'audio', folderId);
      verifiedImage = await verifyDriveUpload(drive, imageFileId, 'image', folderId);

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
        driveCoverFileId: verifiedImage.fileId,
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
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    if (isVercelRuntime()) {
      res.status(410).json({
        error: 'Use browser-direct Drive upload and /api/admin/upload/complete in Vercel production.',
      });
      return;
    }

    const files = req.files as { audio?: Express.Multer.File[]; image?: Express.Multer.File[] };
    const audio = files?.audio?.[0];
    const image = files?.image?.[0];
    if (!audio || !image) {
      res.status(400).json({ error: 'audio and image files are required' });
      return;
    }

    const title = String(req.body.title ?? '').trim();
    const artist = String(req.body.artist ?? '').trim();
    if (!title || !artist) {
      res.status(400).json({ error: 'title and artist are required' });
      return;
    }

    const description = String(req.body.description ?? '').trim();
    const tagsRaw = String(req.body.tags ?? '').trim();
    const tags = tagsRaw
      ? tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const drive = await getDrive();
    const folderId = getDriveFolderId();

    const audioName = `audio_${Date.now()}_${audio.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const imageName = `cover_${Date.now()}_${image.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const audioStream = Readable.from(audio.buffer);
    const imageStream = Readable.from(image.buffer);

    const [audioRes, imageRes] = await Promise.all([
      drive.files.create({
        requestBody: {
          name: audioName,
          parents: [folderId],
        },
        media: {
          mimeType: audio.mimetype || 'audio/mpeg',
          body: audioStream,
        },
        fields: 'id',
        supportsAllDrives: true,
      }),
      drive.files.create({
        requestBody: {
          name: imageName,
          parents: [folderId],
        },
        media: {
          mimeType: image.mimetype || 'image/jpeg',
          body: imageStream,
        },
        fields: 'id',
        supportsAllDrives: true,
      }),
    ]);

    const audioFileId = audioRes.data.id;
    const coverFileId = imageRes.data.id;
    if (!audioFileId || !coverFileId) {
      res.status(500).json({ error: 'Drive did not return file ids' });
      return;
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
      driveAudioFileId: audioFileId,
      driveCoverFileId: coverFileId,
    };

    await addTrackAndSave(drive, folderId, track);

    res.json({ track: toPublicTrack(track) });
  })
);
