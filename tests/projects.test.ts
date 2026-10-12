import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { ProjectStore } from '../server/projectStore.js';
import { readDocument, serializeDocument } from '../shared/project.js';
import { createStarter, starters } from '../shared/starters.js';
import { MockGitHub } from './mockGitHub.js';

const fixtureText = await readFile(new URL('./fixtures/board-v1.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureText);
const token = 'github-test-token-only';
const github = { owner: 'author', repo: 'stories', branch: 'writing', path: 'projects/test/story.json' };
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'story-project-test-'));
  const remote = new MockGitHub();
  let server = createApp(directory, fetch, remote.fetch).listen(0, '127.0.0.1'); await once(server, 'listening');
  let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(route: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  async function close() { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
  async function restart() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createApp(directory, fetch, remote.fetch).listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  return { directory, remote, request, close, restart };
}
async function create(ctx: Awaited<ReturnType<typeof setup>>, title = '测试作品') {
  const result = await ctx.request('/api/projects', 'POST', { title, template: 'short', github });
  assert.equal(result.status, 201); return result.body;
}

test('immutable v1 fixture migrates without semantic loss; extensions survive; unknown/future data is rejected', () => {
  const doc = readDocument(fixture, 'test-project');
  assert.deepEqual(doc.board, fixture);
  assert.deepEqual(readDocument(JSON.parse(serializeDocument(doc)), doc.projectId), doc);
  const extended = { ...doc, extensions: { authorSettings: { language: '中文', tags: ['未完成'] } }, board: { ...doc.board, extensions: { theme: 'forest' } } };
  assert.deepEqual(readDocument(JSON.parse(serializeDocument(extended)), doc.projectId), extended);
  assert.throws(() => readDocument({ ...fixture, version: 99 }, 'test-project'));
  assert.throws(() => readDocument({ ...fixture, secretNewField: 'must not disappear' }, 'test-project'));
  assert.throws(() => readDocument({ ...fixture, nodes: [{ ...fixture.nodes[0], data: { ...fixture.nodes[0].data, unknown: 'text' } }] }, 'test-project'));
  assert.deepEqual(readDocument(doc, 'different-id'), doc, 'current documents retain identity');
});

test('all five starter templates are valid independent editable boards', () => {
  for (const starter of starters) {
    const first = readDocument(createStarter(starter.id, starter.title), 'first');
    const second = readDocument(createStarter(starter.id, starter.title), 'second');
    assert.notEqual(first.projectId, second.projectId); assert.equal(first.board.title, starter.title);
    if (starter.id === 'blank') assert.equal(first.board.nodes.length, 0);
  }
});

test('legacy disk migration is repeatable, preserves original bytes, rejects corrupt input without creating a fallback', async () => {
  const ctx = await setup();
  try {
    await writeFile(path.join(ctx.directory, 'board.json'), fixtureText);
    const first = await ctx.request('/api/projects/legacy-board'); assert.equal(first.status, 200); assert.deepEqual(first.body.document.board, fixture);
    const restarted = new ProjectStore(ctx.directory);
    assert.deepEqual((await restarted.get('legacy-board')).document, first.body.document);
    assert.equal(await readFile(path.join(ctx.directory, 'board.json'), 'utf8'), fixtureText);
    assert.equal((await readdir(path.join(ctx.directory, 'projects'))).filter((s) => s.endsWith('.json')).length, 1);
  } finally { await ctx.close(); }
  const corrupt = await setup();
  try {
    await writeFile(path.join(corrupt.directory, 'board.json'), '{broken');
    assert.equal((await corrupt.request('/api/projects')).status, 500);
    assert.equal(await readFile(path.join(corrupt.directory, 'board.json'), 'utf8'), '{broken');
    assert.equal((await readdir(path.join(corrupt.directory, 'projects'))).length, 0);
  } finally { await corrupt.close(); }
});

test('project saves isolate identity, preserve a previous copy, and reject stale or invalid writes without overwrite', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx, 'A'); const b = await create(ctx, 'B');
    const route = `/api/projects/${a.project.id}`;
    const changed = { ...a.document, board: { ...a.document.board, title: 'A 修改' } };
    assert.equal((await ctx.request(route, 'PUT', { document: changed, revision: 0 })).status, 200);
    assert.equal((await ctx.request(route, 'PUT', { document: changed, revision: 0 })).status, 200, 'identical retry after a lost response is safe');
    const stateFile = path.join(ctx.directory, 'projects', `${a.project.id}.json`);
    assert.equal(JSON.parse(await readFile(`${stateFile}.bak`, 'utf8')).document.board.title, 'A');
    const bytes = await readFile(stateFile, 'utf8');
    assert.equal((await ctx.request(route, 'PUT', { document: a.document, revision: 0 })).status, 409);
    assert.equal((await ctx.request(route, 'PUT', { document: b.document, revision: 1 })).status, 400);
    assert.equal((await ctx.request(route, 'PUT', { document: { ...changed, version: 99 }, revision: 1 })).status, 400);
    assert.equal(await readFile(stateFile, 'utf8'), bytes);
    assert.equal((await ctx.request(`/api/projects/${b.project.id}`)).body.document.board.title, 'B');
    const stored = JSON.parse(bytes); stored.document.version = 99; await writeFile(stateFile, JSON.stringify(stored));
    const corruptedBytes = await readFile(stateFile, 'utf8');
    assert.equal((await ctx.request(route, 'PUT', { document: changed, revision: 1 })).status, 400);
    assert.equal(await readFile(stateFile, 'utf8'), corruptedBytes);
  } finally { await ctx.close(); }
});

test('GitHub commits survive timeout retry without duplicates; preview is read-only and restore keeps current draft', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    assert.equal((await ctx.request(`${root}/connect`, 'POST', { github, token })).status, 200);
    ctx.remote.timeoutAfterPut = true;
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 502);
    assert.equal(ctx.remote.puts, 1);
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 200);
    assert.equal(ctx.remote.puts, 1, 'successful remote PUT is recognized rather than repeated');
    const firstCommit = ctx.remote.commits[0].sha;
    const changed = { ...a.document, board: { ...a.document.board, title: '改写后的作品' } };
    assert.equal((await ctx.request(root, 'PUT', { document: changed, revision: 0 })).status, 200);
    await ctx.request(`${root}/checkpoints`, 'POST', { message: '改写动机' }); await ctx.request(`${root}/sync`, 'POST');
    const stateFile = path.join(ctx.directory, 'projects', `${a.project.id}.json`);
    const beforePreview = await readFile(stateFile, 'utf8');
    const preview = await ctx.request(`${root}/history/${firstCommit}`); assert.equal(preview.status, 200); assert.deepEqual(preview.body, a.document);
    assert.equal(await readFile(stateFile, 'utf8'), beforePreview);
    const restored = await ctx.request(`${root}/restore`, 'POST', { document: preview.body, source: firstCommit, revision: 1 });
    assert.equal(restored.status, 200); assert.equal(restored.body.document.board.title, a.document.board.title);
    const local = (await ctx.request(`${root}/checkpoints`)).body;
    const retained = local.find((v: { message: string }) => v.message === '恢复前的草稿');
    assert.equal((await ctx.request(`${root}/checkpoints/${retained.id}`)).body.board.title, '改写后的作品');
    const oldCount = ctx.remote.commits.length;
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 200); assert.equal(ctx.remote.commits.length, oldCount + 2);
    assert.ok(ctx.remote.commits.some((c) => c.sha === firstCommit));
    assert.equal((await ctx.request(`${root}/history?page=2`)).body.length, 0);
    assert.equal((await readFile(stateFile, 'utf8')).includes(token), false);
  } finally { await ctx.close(); }
});

test('remote conflict and authentication failure preserve local queue and never leak credentials', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    await ctx.request(`${root}/connect`, 'POST', { github, token }); await ctx.request(`${root}/sync`, 'POST');
    await ctx.request(`${root}/checkpoints`, 'POST', { message: '离线版本一' }); await ctx.request(`${root}/checkpoints`, 'POST', { message: '离线版本二' });
    ctx.remote.fail = 401;
    const failed = await ctx.request(`${root}/sync`, 'POST'); assert.equal(failed.status, 502); assert.equal(JSON.stringify(failed.body).includes(token), false);
    assert.equal((await ctx.request(root)).body.project.pending, 2);
    ctx.remote.fail = 0;
    const remoteDoc = { ...a.document, board: { ...a.document.board, title: '其他设备修改' } };
    ctx.remote.setFile(github.path, serializeDocument(remoteDoc));
    const before = ctx.remote.puts;
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 409); assert.equal(ctx.remote.puts, before);
    assert.equal((await ctx.request(root)).body.document.board.title, a.document.board.title);
    assert.equal((await ctx.request(`${root}/remote`)).body.board.title, '其他设备修改');
    const disk = await new ProjectStore(ctx.directory).get(a.project.id); assert.equal(disk.checkpoints.filter((c) => !c.commitSha).length, 2);
    await ctx.request(`${root}/disconnect`, 'POST'); assert.equal((await ctx.request(root)).body.project.connected, false);
  } finally { await ctx.close(); }
});

test('edits during an upload stay dirty and do not alter the committed snapshot', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    await ctx.request(`${root}/connect`, 'POST', { github, token });
    let release!: () => void; let started!: () => void;
    const gate = new Promise<void>((r) => { release = r; }); const ready = new Promise<void>((r) => { started = r; });
    ctx.remote.beforePut = async () => { started(); await gate; };
    const uploading = ctx.request(`${root}/sync`, 'POST'); await ready;
    const changed = { ...a.document, board: { ...a.document.board, title: '上传期间的新内容' } };
    assert.equal((await ctx.request(root, 'PUT', { document: changed, revision: 0 })).status, 200);
    release(); assert.equal((await uploading).status, 200);
    const current = (await ctx.request(root)).body;
    assert.equal(current.project.dirty, true); assert.equal(current.document.board.title, '上传期间的新内容');
    assert.equal(JSON.parse(ctx.remote.files.get(github.path)!.text).board.title, a.document.board.title);
    ctx.remote.beforePut = null; await ctx.request(`${root}/sync`, 'POST');
    assert.equal((await ctx.request(root)).body.project.dirty, false);
  } finally { await ctx.close(); }
});

test('remote path collision is not overwritten; remote open preserves extensions and project identity', async () => {
  const ctx = await setup();
  try {
    const existing = { ...readDocument(fixture, 'remote-project'), extensions: { custom: { value: 42 } } };
    ctx.remote.setFile(github.path, serializeDocument(existing));
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    assert.equal((await ctx.request(`${root}/connect`, 'POST', { github, token })).status, 409);
    assert.equal(ctx.remote.puts, 0);
    // A new installation can open the remote document; this installation already has the path bound.
    const other = { ...github, path: 'projects/remote/story.json' }; ctx.remote.setFile(other.path, serializeDocument(existing));
    const opened = await ctx.request('/api/projects/import-remote', 'POST', { github: other, token });
    assert.equal(opened.status, 201); assert.deepEqual(opened.body.document, existing);
    assert.equal(opened.body.project.dirty, false);
    assert.equal((await ctx.request('/api/projects/import-remote', 'POST', { github: other, token })).status, 409);
  } finally { await ctx.close(); }
});

test('restart clears tokens but preserves pending versions and recognizes an initial commit with a lost response', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    await ctx.request(`${root}/connect`, 'POST', { github, token });
    ctx.remote.timeoutAfterPut = true;
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 502);
    await ctx.request(`${root}/checkpoints`, 'POST', { message: '离线命名版本' });
    await ctx.restart();
    const state = (await ctx.request(root)).body;
    assert.equal(state.project.connected, false); assert.equal(state.project.pending, 2);
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 400);
    assert.equal((await ctx.request(`${root}/connect`, 'POST', { github, token })).status, 200);
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 200);
    assert.equal(ctx.remote.puts, 2, 'only the second pending checkpoint creates a new PUT');
    assert.equal((await ctx.request(root)).body.project.pending, 0);
  } finally { await ctx.close(); }
});

test('sync publishes ordered named checkpoints followed by the latest draft, and skips unchanged content', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    await ctx.request(`${root}/connect`, 'POST', { github, token }); await ctx.request(`${root}/sync`, 'POST');
    await ctx.request(`${root}/checkpoints`, 'POST', { message: '版本一' });
    const second = { ...a.document, board: { ...a.document.board, title: '版本二' } };
    await ctx.request(root, 'PUT', { document: second, revision: 0 }); await ctx.request(`${root}/checkpoints`, 'POST', { message: '版本二' });
    const third = { ...second, board: { ...second.board, title: '最新草稿' } };
    await ctx.request(root, 'PUT', { document: third, revision: 1 });
    const before = ctx.remote.puts; await ctx.request(`${root}/sync`, 'POST');
    assert.equal(ctx.remote.puts, before + 3);
    assert.deepEqual(ctx.remote.commits.slice(0, 3).map((c) => c.message.split('\n')[0]), ['自动保存', '版本二', '版本一']);
    assert.equal(JSON.parse(ctx.remote.files.get(github.path)!.text).board.title, '最新草稿');
    await ctx.request(`${root}/sync`, 'POST'); assert.equal(ctx.remote.puts, before + 3);
    assert.equal((await ctx.request(root)).body.project.dirty, false);
  } finally { await ctx.close(); }
});

test('GitHub permission/rate errors and future remote documents cannot modify local writing', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    await ctx.request(`${root}/connect`, 'POST', { github, token }); await ctx.request(`${root}/checkpoints`, 'POST', { message: '保留内容' });
    for (const status of [403, 429, 503]) {
      ctx.remote.fail = status;
      assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 502);
      assert.equal((await ctx.request(root)).body.project.pending, 1);
    }
    ctx.remote.fail = 0;
    ctx.remote.setFile(github.path, JSON.stringify({ ...a.document, version: 99 }));
    const before = await readFile(path.join(ctx.directory, 'projects', `${a.project.id}.json`), 'utf8');
    assert.equal((await ctx.request(`${root}/remote`)).status, 400);
    assert.equal(await readFile(path.join(ctx.directory, 'projects', `${a.project.id}.json`), 'utf8'), before);
    assert.equal(ctx.remote.puts, 0);
    assert.equal((await ctx.request('/api/projects', 'POST', { title: '错误路径', template: 'blank', github: { ...github, path: '../outside.json' } })).status, 400);
  } finally { await ctx.close(); }
});

test('GitHub files between 1 and 2 MB are read through their immutable blob SHA', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    const board = { ...a.document.board, nodes: Array.from({ length: 60 }, (_, i) => ({ ...a.document.board.nodes[0], id: `big-${i}`, data: { ...a.document.board.nodes[0].data, content: 'x'.repeat(20000) } })), edges: [] };
    const document = { ...a.document, board };
    await ctx.request(root, 'PUT', { document, revision: 0 }); await ctx.request(`${root}/connect`, 'POST', { github, token });
    assert.equal((await ctx.request(`${root}/sync`, 'POST')).status, 200);
    const remote = await ctx.request(`${root}/remote`); assert.equal(remote.status, 200); assert.deepEqual(remote.body, document);
  } finally { await ctx.close(); }
});

test('interrupted temporary files and failed replacement leave the last valid project readable', async () => {
  const ctx = await setup();
  try {
    const a = await create(ctx); const root = `/api/projects/${a.project.id}`;
    const file = path.join(ctx.directory, 'projects', `${a.project.id}.json`);
    const original = await readFile(file, 'utf8');
    await writeFile(`${file}.tmp`, '{interrupted'); await ctx.restart();
    assert.deepEqual((await ctx.request(root)).body.document, a.document);
    await rm(`${file}.tmp`); await mkdir(`${file}.tmp`);
    const changed = { ...a.document, board: { ...a.document.board, title: '不会成功写入' } };
    assert.equal((await ctx.request(root, 'PUT', { document: changed, revision: 0 })).status, 500);
    assert.equal(await readFile(file, 'utf8'), original);
    assert.equal(await readFile(`${file}.bak`, 'utf8'), original);
    assert.deepEqual((await ctx.request(root)).body.document, a.document);
  } finally { await ctx.close(); }
});
