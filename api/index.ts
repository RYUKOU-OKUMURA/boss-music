/**
 * Vercel Serverless: Express を default export（serverless-http は ESM で壊れやすい）
 * @see https://vercel.com/docs/frameworks/backend/express
 */
import { createApiApp } from '../server/app';

export default createApiApp();
