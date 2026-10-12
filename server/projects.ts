import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readDocument, projectInfo, projectIdSchema, githubSchema, serializeDocument, type ProjectState } from '../shared/project.js';
import { createStarter, starters } from '../shared/starters.js';
import { ProjectStore, StorageError } from './projectStore.js';
import { GitHubClient } from './github.js';

const credential = z.string().trim().min(10).max(500);
const sha = z.string().regex(/^[a-f0-9]{40,64}$/);
const bindingRequest = z.strictObject({ github: githubSchema, token: credential });
const idOf = (req: Request) => String(req.params.id);

export function registerProjects(app: Express, directory: string, githubFetch: typeof fetch = fetch) {
  const store = new ProjectStore(directory);
  // Credentials live only in this server process and are never persisted.
  const clients = new Map<string, GitHubClient>();
  const syncing = new Map<string, Promise<void>>();
  const syncErrors = new Map<string, string>();
  const info = (s: ProjectState) => ({ ...projectInfo(s, clients.has(s.document.projectId)),
    syncError: syncErrors.get(s.document.projectId) ?? '', syncing: syncing.has(s.document.projectId) });
  const route = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); } catch (e) { next(e); }
  };
  const clientFor = (id: string) => {
    const client = clients.get(id);
    if (!client) throw new StorageError('请连接 GitHub；重启服务器后需重新输入 Token');
    return client;
  };
  async function sync(id: string): Promise<void> {
    const running = syncing.get(id);
    if (running) return running;
    const operation = (async () => {
      const client = clientFor(id);
      let state = await store.get(id);
      if (!state.github) throw new StorageError('尚未配置 GitHub 仓库');
      const lastPending = state.checkpoints.filter((c) => !c.commitSha).at(-1);
      if ((lastPending ? serializeDocument(lastPending.document) : state.syncedDocument) !== serializeDocument(state.document)) {
        state = await store.change(id, (s) => { store.checkpoint(s, '自动保存'); });
      }
      // Capture this batch; edits made while requests are in flight remain dirty for the next batch.
      const pending = state.checkpoints.filter((c) => !c.commitSha);
      for (const point of pending) {
        state = await store.get(id);
        const binding = state.github!;
        const text = serializeDocument(point.document);
        const remote = await client.file(binding);
        const marker = `[story-weave:${point.id}]`;
        let committed: { blobSha: string; commitSha: string };
        // Recover a PUT that succeeded remotely but timed out (or succeeded before a local process crash).
        const latest = remote && remote.sha !== state.remoteSha ? (await client.history(binding))[0] : null;
        if (remote && latest?.message.includes(marker)) {
          if (remote.text !== text) throw new StorageError('远端版本标识与内容不一致，已停止同步', 409);
          committed = { blobSha: remote.sha, commitSha: latest.sha };
        } else {
          if ((remote?.sha ?? null) !== state.remoteSha) throw new StorageError('远端小说已有修改，已停止上传；请下载远端副本或打开为独立项目后处理', 409);
          committed = await client.put(binding, text, `${point.message}\n\n${marker}`, state.remoteSha);
        }
        await store.change(id, (s) => {
          const saved = s.checkpoints.find((c) => c.id === point.id);
          if (!saved) throw new StorageError('本地版本队列已变化', 409);
          saved.commitSha = committed.commitSha;
          s.remoteSha = committed.blobSha; s.syncedDocument = text; s.lastSyncedAt = new Date().toISOString();
          // Retain all pending versions and the most recent 30 published local copies.
          const published = s.checkpoints.filter((c) => c.commitSha).slice(-30);
          s.checkpoints = s.checkpoints.filter((c) => !c.commitSha || published.includes(c));
        });
      }
      syncErrors.delete(id);
    })();
    syncing.set(id, operation);
    try { await operation; }
    catch (e) { syncErrors.set(id, e instanceof StorageError ? e.message : '同步失败，本地版本已保留'); throw e; }
    finally { syncing.delete(id); }
  }

  app.get('/api/projects', route(async (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json((await store.list()).map(info)); }));
  app.post('/api/github/repository', route(async (req, res) => {
    const input = z.strictObject({ owner: z.string().regex(/^[\w.-]+$/), repo: z.string().regex(/^[\w.-]+$/), token: credential }).parse(req.body);
    res.json(await new GitHubClient(input.token, githubFetch).repository(input.owner, input.repo));
  }));
  app.post('/api/projects', route(async (req, res) => {
    const input = z.strictObject({ title: z.string().trim().min(1).max(120), template: z.enum(starters.map((s) => s.id)), github: githubSchema,
      autoSync: z.boolean().optional(), projectId: projectIdSchema.optional() }).parse(req.body);
    const document = { format: 'story-weave' as const, version: 2 as const, projectId: input.projectId ?? randomUUID(), board: createStarter(input.template, input.title) };
    await store.create(document);
    const state = await store.change(document.projectId, (s) => { s.github = input.github; s.autoSync = input.autoSync ?? true; });
    res.status(201).json({ project: info(state), document: state.document });
  }));
  app.post('/api/projects/import-remote', route(async (req, res) => {
    const input = bindingRequest.parse(req.body);
    const client = new GitHubClient(input.token, githubFetch);
    await client.verify(input.github);
    const loaded = await client.document(input.github, randomUUID());
    // Remote imports can be opened independently for conflict resolution; bind only if not already bound locally.
    const states = await store.list();
    const duplicate = states.find((s) => s.github && (s.remoteSha || clients.has(s.document.projectId)) && JSON.stringify(s.github) === JSON.stringify(input.github));
    if (duplicate) throw new StorageError(`该远端已绑定项目「${duplicate.document.board.title}」，请使用远端副本预览，避免双重同步`, 409);
    const document = loaded.document;
    await store.create(document);
    const state = await store.change(document.projectId, (s) => {
      s.github = input.github; s.remoteSha = loaded.file.sha;
      s.syncedDocument = loaded.file.text; s.lastSyncedAt = new Date().toISOString();
    });
    clients.set(document.projectId, client);
    res.status(201).json({ project: info(state), document: state.document });
  }));
  app.get('/api/projects/:id', route(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); const state = await store.get(idOf(req));
    res.json({ project: info(state), document: state.document });
  }));
  app.put('/api/projects/:id', route(async (req, res) => {
    const id = idOf(req);
    const input = z.strictObject({ document: z.unknown(), revision: z.number().int().nonnegative() }).parse(req.body);
    const document = readDocument(input.document, id);
    if (document.projectId !== id) throw new StorageError('项目身份不匹配');
    const state = await store.change(id, (s) => {
      if (s.revision !== input.revision) {
        // An identical retry after a lost response is safe; other edits still conflict.
        if (serializeDocument(s.document) === serializeDocument(document)) return;
        throw new StorageError('本地项目已被其他页面修改，请重新打开并保留草稿', 409);
      }
      s.document = document; s.revision++;
    });
    res.json({ project: info(state), document: state.document });
  }));
  app.post('/api/projects/:id/connect', route(async (req, res) => {
    const id = idOf(req); const input = bindingRequest.parse(req.body);
    const client = new GitHubClient(input.token, githubFetch);
    const repo = await client.verify(input.github);
    const remote = await client.file(input.github);
    const local = await store.get(id);
    const pending = local.checkpoints.find((c) => !c.commitSha);
    const recoveredFirstCommit = !local.remoteSha && remote && pending &&
      remote.text === serializeDocument(pending.document) && (await client.history(input.github))[0]?.message.includes(`[story-weave:${pending.id}]`);
    const state = await store.change(id, (s) => {
      if (s.github && JSON.stringify(s.github) !== JSON.stringify(input.github)) throw new StorageError('不能改绑已有项目；请创建新项目或打开远端作品');
      if (!s.remoteSha && remote && !recoveredFirstCommit) throw new StorageError('远端路径已有文件，请在新建面板打开已有作品，或换用空路径', 409);
      s.github = input.github;
    });
    clients.set(id, client);
    syncErrors.delete(id);
    res.json({ project: info(state), ...repo });
  }));
  app.post('/api/projects/:id/disconnect', route(async (req, res) => { clients.delete(idOf(req)); res.json({ disconnected: true }); }));
  app.put('/api/projects/:id/auto-sync', route(async (req, res) => {
    const input = z.strictObject({ enabled: z.boolean() }).parse(req.body);
    res.json(info(await store.change(idOf(req), (s) => { s.autoSync = input.enabled; })));
  }));
  app.post('/api/projects/:id/checkpoints', route(async (req, res) => {
    const input = z.strictObject({ message: z.string().trim().min(1).max(200) }).parse(req.body);
    const state = await store.change(idOf(req), (s) => { store.checkpoint(s, input.message); });
    res.status(201).json(info(state));
  }));
  app.post('/api/projects/:id/sync', route(async (req, res) => { await sync(idOf(req)); res.json(info(await store.get(idOf(req)))); }));
  app.get('/api/projects/:id/checkpoints', route(async (req, res) => {
    const state = await store.get(idOf(req));
    res.json([...state.checkpoints].reverse().map(({ document, ...point }) => ({ ...point, title: document.board.title })));
  }));
  app.get('/api/projects/:id/checkpoints/:point', route(async (req, res) => {
    const state = await store.get(idOf(req)); const point = state.checkpoints.find((c) => c.id === req.params.point);
    if (!point) throw new StorageError('本地版本不存在', 404);
    res.json(point.document);
  }));
  app.get('/api/projects/:id/history', route(async (req, res) => {
    const state = await store.get(idOf(req)); if (!state.github) throw new StorageError('尚未配置 GitHub');
    const page = z.coerce.number().int().min(1).max(10000).parse(req.query.page ?? 1);
    res.json(await clientFor(idOf(req)).history(state.github, page));
  }));
  app.get('/api/projects/:id/remote', route(async (req, res) => {
    const state = await store.get(idOf(req)); if (!state.github) throw new StorageError('尚未配置 GitHub');
    const loaded = await clientFor(idOf(req)).document(state.github, idOf(req)); res.json(loaded.document);
  }));
  app.get('/api/projects/:id/history/:sha', route(async (req, res) => {
    const state = await store.get(idOf(req)); if (!state.github) throw new StorageError('尚未配置 GitHub');
    const loaded = await clientFor(idOf(req)).document(state.github, idOf(req), sha.parse(req.params.sha)); res.json(loaded.document);
  }));
  app.post('/api/projects/:id/restore', route(async (req, res) => {
    const id = idOf(req);
    const input = z.strictObject({ document: z.unknown(), revision: z.number().int().nonnegative(), source: z.string().min(1).max(100) }).parse(req.body);
    const document = readDocument(input.document, id);
    document.projectId = id;
    const state = await store.change(id, (s) => {
      if (s.revision !== input.revision) throw new StorageError('当前草稿已变化，请重新打开预览后再恢复', 409);
      store.checkpoint(s, '恢复前的草稿');
      s.document = document; s.revision++;
      store.checkpoint(s, `恢复版本 ${input.source}`);
    });
    res.json({ project: info(state), document: state.document });
  }));
  return store;
}
