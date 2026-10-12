import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { createExample } from '../shared/board.js';

test('API persists valid boards, rejects corrupt updates, and returns JSON 404', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'novel-board-test-'));
  const server = createApp(directory).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const example = await (await fetch(`${base}/api/board`)).json();
    assert.equal(example.title, '雾港来信');
    const updated = { ...example, title: '测试保存' };
    const put = (value: unknown) => fetch(`${base}/api/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal((await put(updated)).status, 200);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'projects', 'legacy-board.json'), 'utf8')).document.board.title, '测试保存');
    assert.equal((await put({ title: 'broken' })).status, 400);
    assert.equal((await (await fetch(`${base}/api/board`)).json()).title, '测试保存');
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('AI proxy sends transient key and board, validates proposals and sanitizes upstream errors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'novel-ai-test-'));
  let captured: Record<string, any> | null = null;
  let behavior: 'ok' | 'invalid' | 'key-error' | 'incomplete' = 'ok';
  const upstream = (async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer sk-test-only-not-a-real-key');
    captured = JSON.parse(options?.body as string);
    if (behavior === 'key-error') return Response.json({ error: { message: 'secret sk-test-only-not-a-real-key' } }, { status: 401 });
    if (behavior === 'incomplete') return Response.json({ status: 'incomplete', output: [] });
    const proposal = { title: '提案', premise: '故事', nodes: [{ id: 'new1', kind: 'plot', title: '情节', content: '内容', act: '第一幕' }], edges: behavior === 'invalid' ? [{ source: 'missing', target: 'new1', label: '错误' }] : [] };
    return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ reply: '已生成结构', proposal }) }] }] });
  }) as typeof fetch;
  const server = createApp(directory, upstream).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/chat`;
  const request = { apiKey: 'sk-test-only-not-a-real-key', model: 'gpt-5-mini', mode: 'generate', board: createExample(), messages: [{ role: 'user', content: '生成一个结构图' }] };
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const response = await post(request);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).proposal.nodes[0].title, '情节');
    assert.equal(captured!.store, false);
    assert.equal(captured!.text.format.strict, true);
    assert.ok(captured!.input[0].content.includes('雾港来信'));
    assert.equal(JSON.stringify(captured).includes(request.apiKey), false);
    assert.equal((await (await post({ ...request, mode: 'chat' })).json()).proposal, null);
    behavior = 'invalid'; assert.equal((await post(request)).status, 502);
    behavior = 'key-error';
    const failure = await post(request);
    assert.equal(failure.status, 401);
    assert.equal((await failure.text()).includes(request.apiKey), false);
    behavior = 'incomplete'; assert.equal((await post(request)).status, 502);
    assert.equal((await post({ ...request, apiKey: '' })).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
