import express from 'express';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { boardSchema, createExample } from '../shared/board.js';
import { registerAI } from './ai.js';

export function createApp(dataDirectory: string, upstreamFetch: typeof fetch = fetch) {
  const app = express();
  const file = path.join(dataDirectory, 'board.json');
  let writes: Promise<void> = Promise.resolve();
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  registerAI(app, upstreamFetch);
  app.get('/api/board', async (_req, res, next) => {
    try {
      await writes;
      let board;
      try { board = boardSchema.parse(JSON.parse(await readFile(file, 'utf8'))); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        board = createExample();
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json(board);
    } catch (error) { next(error); }
  });
  app.put('/api/board', async (req, res, next) => {
    const result = boardSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: '故事板格式无效', details: result.error.issues }); return; }
    // Serialize writes and replace atomically so interrupted writes leave the previous board intact.
    const operation = writes.then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(result.data, null, 2), 'utf8');
      await rename(`${file}.tmp`, file);
    });
    writes = operation.catch(() => {});
    try { await operation; res.json({ saved: true }); }
    catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (error as { status?: number }).status;
    console.error('Request failed with status:', status || 500);
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? '故事板超过 2 MB 限制' : status === 400 ? '请求格式无效' : '保存或读取失败，请重试。' });
  });
  return app;
}
