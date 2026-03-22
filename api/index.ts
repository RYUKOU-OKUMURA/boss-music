/**
 * Vercel の api/ は Lambda 風ハンドラ向け。Express は serverless-http で包む。
 * ESM では `import serverless from 'serverless-http'` が壊れるため createRequire で CJS 読込。
 */
import { createRequire } from 'module';
import type { Application } from 'express';
import { createApiApp } from '../server/app';

const require = createRequire(import.meta.url);
const serverless = require('serverless-http') as (app: Application) => (
  req: unknown,
  res: unknown
) => void | Promise<void>;

const app = createApiApp();
export default serverless(app);
