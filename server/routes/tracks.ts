import { Router } from 'express';
import { listTracks } from '../services/tracksDb';
import { asyncHandler } from '../utils/asyncHandler';
import { toPublicTrack } from '../utils/trackPublic';

export const tracksRouter = Router();

tracksRouter.get(
  '/tracks',
  asyncHandler(async (_req, res) => {
    try {
      const tracks = await listTracks();
      res.json({
        version: 1,
        updatedAt: new Date().toISOString(),
        tracks: tracks.map(toPublicTrack),
      });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === 'DB_NOT_CONFIGURED') {
        res.status(503).json({ error: err.message, tracks: [] });
        return;
      }
      throw e;
    }
  })
);
