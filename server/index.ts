import path from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const dataDirectory = path.resolve(process.env.DATA_DIR || 'data');
createApp(dataDirectory).listen(port, host, () => {
  console.log(`Story board server: http://localhost:${port}`);
});
