/**
 * Vercel は Express アプリを default export すればサーバーレス化する（公式: Express on Vercel）。
 * serverless-http は AWS Lambda 向けで、Vercel の (req, res) では 500 になることがあるため使わない。
 */
import { createApiApp } from '../server/app';

const app = createApiApp();
export default app;
