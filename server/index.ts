import { config as loadEnv } from 'dotenv';

// Vite と同様: .env のあと .env.local で上書き（README の .env.local だけでもサーバーが読める）
loadEnv();
loadEnv({ path: '.env.local', override: true });

import { createApp } from './app';

const PORT = Number(process.env.API_PORT) || 8787;
const app = createApp();

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
