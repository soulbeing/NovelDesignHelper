import express from 'express';
import path from 'node:path';
import { boardSchema } from '../shared/board.js';
import { registerAI } from './ai.js';
import { registerProjects } from './projects.js';
import { StorageError } from './projectStore.js';
import { ZodError } from 'zod';

export function createApp(dataDirectory: string, upstreamFetch: typeof fetch = fetch, githubFetch: typeof fetch = fetch) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  registerAI(app, upstreamFetch);
  const projects = registerProjects(app, dataDirectory, githubFetch);
  app.get('/api/board', async (_req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      // Retain the v1 API shape without maintaining a second, divergent copy of the story.
      res.json((await projects.get('legacy-board')).document.board);
    } catch (error) { next(error); }
  });
  app.put('/api/board', async (req, res, next) => {
    const result = boardSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: '故事板格式无效', details: result.error.issues }); return; }
    try {
      await projects.change('legacy-board', (state) => { state.document.board = result.data; state.revision++; });
      res.json({ saved: true });
    }
    catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof StorageError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ZodError) { res.status(400).json({ error: '数据格式、版本或字段不受支持，原数据已保留', details: error.issues }); return; }
    const status = (error as { status?: number }).status;
    console.error('Request failed with status:', status || 500);
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? '故事板超过 2 MB 限制' : status === 400 ? '请求格式无效' : '保存或读取失败，请重试。' });
  });
  return app;
}
