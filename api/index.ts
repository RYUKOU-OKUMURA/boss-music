import serverless from 'serverless-http';
import { createApiApp } from '../server/app';

const app = createApiApp();
export default serverless(app);
