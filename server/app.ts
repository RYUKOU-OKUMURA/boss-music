import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { tracksRouter } from './routes/tracks';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { mediaRouter } from './routes/media';
import { healthRouter } from './routes/health';

export function createApp() {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  app.use('/api', tracksRouter);
  app.use('/api', authRouter);
  app.use('/api', adminRouter);
  app.use('/api', mediaRouter);
  app.use('/api', healthRouter);

  if (process.env.NODE_ENV === 'production') {
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(dist, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  return app;
}
