import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export class MockGitHub {
  files = new Map<string, { sha: string; text: string }>();
  commits: { sha: string; path: string; text: string; message: string }[] = [];
  fail = 0;
  timeoutAfterPut = false;
  beforePut: (() => Promise<void>) | null = null;
  puts = 0;
  private key(url: URL) { return decodeURIComponent(url.pathname.split('/contents/')[1]); }
  setFile(path: string, text: string, message = '外部修改') {
    const sha = createHash('sha1').update(text).digest('hex');
    const commitSha = createHash('sha1').update(`${text}:${this.commits.length}`).digest('hex');
    this.files.set(path, { sha, text }); this.commits.unshift({ sha: commitSha, text, path, message });
    return { blobSha: sha, commitSha };
  }
  fetch = (async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer github-test-token-only');
    if (this.fail) return Response.json({ message: 'github-test-token-only must never be echoed' }, { status: this.fail });
    if (/\/repos\/[^/]+\/[^/]+$/.test(url.pathname)) return Response.json({ private: true, default_branch: 'writing', permissions: { push: true } });
    if (url.pathname.includes('/branches/')) return Response.json({ name: 'writing' });
    if (url.pathname.endsWith('/commits')) {
      const page = Number(url.searchParams.get('page') || 1);
      const list = this.commits.filter((c) => c.path === url.searchParams.get('path')).slice((page - 1) * 20, page * 20);
      return Response.json(list.map((c) => ({ sha: c.sha, commit: { message: c.message, committer: { date: '2026-10-12T12:00:00Z' }, author: { name: '测试作者' } } })));
    }
    if (url.pathname.includes('/git/blobs/')) {
      const blob = [...this.files.values()].find((f) => f.sha === url.pathname.split('/').at(-1));
      return blob ? Response.json({ encoding: 'base64', content: Buffer.from(blob.text).toString('base64') }) : Response.json({}, { status: 404 });
    }
    if (url.pathname.includes('/contents/')) {
      const path = this.key(url);
      if (options?.method === 'PUT') {
        if (this.beforePut) await this.beforePut();
        const body = JSON.parse(String(options.body));
        if ((body.sha ?? null) !== (this.files.get(path)?.sha ?? null)) return Response.json({}, { status: 409 });
        this.puts++;
        const text = Buffer.from(body.content, 'base64').toString('utf8');
        assert.equal(text.includes('github-test-token-only'), false);
        const committed = this.setFile(path, text, body.message);
        if (this.timeoutAfterPut) { this.timeoutAfterPut = false; throw new Error('network timeout after commit'); }
        return Response.json({ content: { sha: committed.blobSha }, commit: { sha: committed.commitSha } });
      }
      const ref = url.searchParams.get('ref');
      const history = this.commits.find((c) => c.sha === ref && c.path === path);
      const file = history ? { sha: createHash('sha1').update(history.text).digest('hex'), text: history.text } : this.files.get(path);
      if (!file) return Response.json({}, { status: 404 });
      const large = Buffer.byteLength(file.text) > 1024 * 1024;
      return Response.json({ type: 'file', sha: file.sha, size: Buffer.byteLength(file.text), encoding: large ? 'none' : 'base64', content: large ? '' : Buffer.from(file.text).toString('base64') });
    }
    throw new Error(`Unmocked GitHub route: ${url.pathname}`);
  }) as typeof fetch;
}
