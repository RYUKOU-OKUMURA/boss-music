import { Router } from 'express';
import { getDrive, getDriveFolderId } from '../services/driveClient';
import { readCachedCatalog, readCatalog } from '../services/catalog';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const tracksRouter = Router();

tracksRouter.get(
  '/tracks',
  asyncHandler(async (_req, res) => {
    try {
      const cached = await readCachedCatalog();
      if (cached) {
        const tracks = [...cached.catalog.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        res.json({
          version: cached.catalog.version,
          updatedAt: cached.catalog.updatedAt,
          tracks: tracks.map(toPublicTrack),
        });
        return;
      }

      const folderId = getDriveFolderId();
      const drive = await getDrive();
      const { catalog } = await readCatalog(drive, folderId);
      const tracks = [...catalog.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({
        version: catalog.version,
        updatedAt: catalog.updatedAt,
        tracks: tracks.map(toPublicTrack),
      });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === 'NOT_CONNECTED' || err.code === 'PERSISTENT_STORAGE_REQUIRED') {
        res.status(503).json({ error: err.message, tracks: [] });
        return;
      }
      throw e;
    }
  })
);
