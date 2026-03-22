import { Router } from 'express';
import { getDrive, getDriveFolderId } from '../services/driveClient';
import { readCatalog } from '../services/catalog';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const tracksRouter = Router();

tracksRouter.get(
  '/tracks',
  asyncHandler(async (_req, res) => {
    try {
      const drive = await getDrive();
      const folderId = getDriveFolderId();
      const { catalog } = await readCatalog(drive, folderId);
      const tracks = [...catalog.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({
        version: catalog.version,
        updatedAt: catalog.updatedAt,
        tracks: tracks.map(toPublicTrack),
      });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === 'NOT_CONNECTED') {
        res.status(503).json({ error: 'Drive not configured', tracks: [] });
        return;
      }
      throw e;
    }
  })
);
