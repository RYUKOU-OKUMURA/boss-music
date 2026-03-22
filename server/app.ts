import path from 'path';
import express, { Request, Response, NextFunction, type Application } from 'express';
import cookieParser from 'cookie-parser';
import { tracksRouter } from './routes/tracks';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { mediaRouter } from './routes/media';
import { healthRouter } from './routes/health';

function mountApiRoutes(app: Application) {
  app.use(cookieParser());
  app.use(express.json());

  app.use('/api', tracksRouter);
  app.use('/api', authRouter);
  app.use('/api', adminRouter);
  app.use('/api', mediaRouter);
  app.use('/api', healthRouter);
}

function mountErrorHandler(app: Application) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });
}

/** Express API のみ（Vercel Serverless）。静的ファイルは含めない。 */
export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);

  mountApiRoutes(app);
  mountErrorHandler(app);

  return app;
}

/** ローカル or 単一プロセス本番: API + dist 静的 + SPA フォールバック */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  mountApiRoutes(app);

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

  mountErrorHandler(app);

  return app;
}
