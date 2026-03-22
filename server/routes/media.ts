import { Router } from 'express';
import { google } from 'googleapis';
import { getOAuth2ClientForDrive } from '../services/driveClient';
import { applyGoogleHeaders } from '../utils/mediaHeaders';
import { asyncHandler } from '../utils/asyncHandler';

export const mediaRouter = Router();

mediaRouter.get(
  '/media/audio/:fileId',
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const range = req.headers.range;
    try {
      const auth = await getOAuth2ClientForDrive();
      const drive = google.drive({ version: 'v3', auth });
      const gRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        {
          responseType: 'stream',
          headers: range ? { Range: range } : undefined,
        }
      );
      const stream = gRes.data as NodeJS.ReadableStream;
      applyGoogleHeaders(res, gRes.headers as Record<string, unknown>, gRes.status ?? 200);
      stream.on('error', (err) => {
        console.error('Drive stream error', err);
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      stream.pipe(res);
    } catch (e: unknown) {
      const err = e as Error & { code?: string; response?: { status?: number; data?: unknown } };
      console.error('media audio', err);
      if (err.code === 'NOT_CONNECTED') {
        res.status(503).json({ error: 'Drive not configured' });
        return;
      }
      res.status(err.response?.status ?? 500).json({ error: err.message });
    }
  })
);

mediaRouter.get(
  '/media/image/:fileId',
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const range = req.headers.range;
    try {
      const auth = await getOAuth2ClientForDrive();
      const drive = google.drive({ version: 'v3', auth });
      const gRes = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        {
          responseType: 'stream',
          headers: range ? { Range: range } : undefined,
        }
      );
      const stream = gRes.data as NodeJS.ReadableStream;
      applyGoogleHeaders(res, gRes.headers as Record<string, unknown>, gRes.status ?? 200);
      stream.on('error', (err) => {
        console.error('Drive stream error', err);
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      stream.pipe(res);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === 'NOT_CONNECTED') {
        res.status(503).json({ error: 'Drive not configured' });
        return;
      }
      res.status(500).json({ error: (e as Error).message });
    }
  })
);
