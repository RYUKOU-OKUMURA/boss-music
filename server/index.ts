import 'dotenv/config';
import { createApp } from './app';

const PORT = Number(process.env.API_PORT) || 8787;
const app = createApp();

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
