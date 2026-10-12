import { githubSchema, readDocument, type GitHubBinding } from '../shared/project.js';
import { StorageError } from './projectStore.js';

export class GitHubClient {
  constructor(private token: string, private requestFetch: typeof fetch = fetch) {}
  private base(binding: Pick<GitHubBinding, 'owner' | 'repo'>) {
    return `/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}`;
  }
  private async request(route: string, method = 'GET', body?: unknown, accept = 'application/vnd.github+json') {
    let response: Response;
    try {
      response = await this.requestFetch(`https://api.github.com${route}`, { method, redirect: 'error',
        signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${this.token}`, Accept: accept,
          'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new StorageError('GitHub 网络请求失败或超时，本地内容已保留；可重试同步', 502); }
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: 'GitHub Token 无效或已过期，请重新连接', 403: 'GitHub 权限不足、分支受保护或达到限流，请检查后重试',
        404: 'GitHub 仓库、分支或文件不存在，或 Token 没有访问权限',
        409: 'GitHub 远端发生冲突，或仓库尚未初始化，请检查后重试',
        422: 'GitHub 拒绝提交，请检查写入权限、分支保护和文件状态',
      };
      // Never propagate GitHub's body: it may echo credentials or private content.
      throw new StorageError(messages[response.status] ?? 'GitHub 服务暂不可用，本地内容已保留', response.status === 404 ? 404 : response.status === 409 ? 409 : 502);
    }
    return response;
  }
  async repository(owner: string, repo: string) {
    const result = await (await this.request(this.base({ owner, repo }))).json();
    if (typeof result.default_branch !== 'string' || typeof result.private !== 'boolean') throw new StorageError('GitHub 仓库信息无效', 502);
    if (result.permissions?.push === false) throw new StorageError('Token 对该仓库没有写入权限');
    return { defaultBranch: result.default_branch as string, private: result.private as boolean };
  }
  async verify(binding: GitHubBinding) {
    githubSchema.parse(binding);
    const repo = await this.repository(binding.owner, binding.repo);
    // An empty repository must be initialized on GitHub first; do not silently create a branch.
    await this.request(`${this.base(binding)}/branches/${encodeURIComponent(binding.branch)}`);
    return repo;
  }
  private contentsRoute(binding: GitHubBinding, ref = binding.branch) {
    return `${this.base(binding)}/contents/${binding.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  }
  async file(binding: GitHubBinding, ref = binding.branch): Promise<{ sha: string; text: string } | null> {
    let response: Response;
    try { response = await this.request(this.contentsRoute(binding, ref), 'GET', undefined, 'application/vnd.github.object+json'); }
    catch (e) { if (e instanceof StorageError && e.status === 404) return null; throw e; }
    const file = await response.json();
    if (file.type !== 'file' || typeof file.sha !== 'string' || file.size > 2 * 1024 * 1024) throw new StorageError('远端不是有效的小说文件，或超过 2 MB');
    // The object endpoint omits content over 1 MB; use raw with the same immutable blob/commit reference.
    const blob = file.encoding === 'base64' ? file
      : await (await this.request(`${this.base(binding)}/git/blobs/${encodeURIComponent(file.sha)}`)).json();
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new StorageError('GitHub 文件内容无效', 502);
    const text = Buffer.from(blob.content, 'base64').toString('utf8');
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new StorageError('远端小说超过 2 MB');
    return { sha: file.sha, text };
  }
  async put(binding: GitHubBinding, text: string, message: string, sha: string | null) {
    const route = this.contentsRoute(binding).split('?')[0];
    const result = await (await this.request(route, 'PUT', { message, content: Buffer.from(text).toString('base64'),
      branch: binding.branch, ...(sha ? { sha } : {}) })).json();
    if (typeof result.content?.sha !== 'string' || typeof result.commit?.sha !== 'string') throw new StorageError('GitHub 提交响应无效，请重试同步', 502);
    return { blobSha: result.content.sha as string, commitSha: result.commit.sha as string };
  }
  async history(binding: GitHubBinding, page = 1) {
    const result = await (await this.request(`${this.base(binding)}/commits?sha=${encodeURIComponent(binding.branch)}&path=${encodeURIComponent(binding.path)}&per_page=20&page=${page}`)).json();
    if (!Array.isArray(result)) throw new StorageError('GitHub 历史响应无效', 502);
    return result.map((item) => ({ sha: item.sha as string, message: item.commit.message as string,
      date: item.commit.committer?.date as string, author: item.commit.author?.name as string }));
  }
  async document(binding: GitHubBinding, projectId: string, ref = binding.branch) {
    const file = await this.file(binding, ref);
    if (!file) throw new StorageError('远端版本文件不存在', 404);
    return { file, document: readDocument(JSON.parse(file.text), projectId) };
  }
}
