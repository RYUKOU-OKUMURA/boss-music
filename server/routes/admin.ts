import crypto from 'crypto';
import { Readable } from 'stream';
import { Router } from 'express';
import { loadRefreshToken } from '../services/tokenStore';
import { getDrive, getDriveFolderId } from '../services/driveClient';
import { addTrackAndSave, type TrackRow } from '../services/catalog';
import { requireAdmin } from '../middleware/adminAuth';
import { upload } from '../utils/upload';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const adminRouter = Router();

adminRouter.get(
  '/admin/drive-status',
  asyncHandler(async (_req, res) => {
    const rt = await loadRefreshToken();
    res.json({ connected: Boolean(rt) });
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
