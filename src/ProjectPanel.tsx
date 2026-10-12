import { useEffect, useState } from 'react';
import { X, GitBranch, Plus, Check, LoaderCircle } from 'lucide-react';
import { starters } from '../shared/starters';
import { type StoryDocument, type GitHubBinding } from '../shared/project';
import { projectRequest, type LiveProject } from './useBoard';
import { createId } from './id';

type Version = { id: string; message: string; createdAt: string; commitSha: string | null };
type Commit = { sha: string; message: string; date: string; author: string };
type Props = {
  project: LiveProject | null; projectId: string; flush: () => Promise<void>;
  refresh: () => Promise<void>; sync: () => Promise<void>;
  restore: (document: StoryDocument, source: string) => Promise<void>;
  onSelect: (id: string) => void; onClose: () => void;
};
function bindingFrom(repository: string, branch: string, path: string): GitHubBinding {
  const text = repository.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(text);
  if (!match) throw new Error('请输入 https://github.com/用户名/仓库 或 用户名/仓库');
  if (!branch.trim()) throw new Error('请验证仓库以取得默认分支，或填写分支名');
  return { owner: match[1], repo: match[2], branch: branch.trim(), path: path.trim() };
}
function download(document: StoryDocument, name = '远端小说副本.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
  const a = window.document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProjectPanel(props: Props) {
  const [tab, setTab] = useState<'projects' | 'connect' | 'history'>('projects');
  const [projects, setProjects] = useState<LiveProject[]>([]);
  const [newId] = useState(createId);
  const [repository, setRepository] = useState(props.project?.github ? `${props.project.github.owner}/${props.project.github.repo}` : '');
  const [branch, setBranch] = useState(props.project?.github?.branch ?? '');
  const [path, setPath] = useState(`projects/${newId}/story.json`);
  const [token, setToken] = useState('');
  const [visibility, setVisibility] = useState<boolean | null>(null);
  const [title, setTitle] = useState('新的故事');
  const [template, setTemplate] = useState('blank');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [preview, setPreview] = useState<{ document: StoryDocument; source: string; restorable: boolean } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const prefix = `/api/projects/${props.projectId}`;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，内容已保留'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let cancelled = false;
    void projectRequest<LiveProject[]>('/api/projects').then((list) => { if (!cancelled) setProjects(list); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const verify = async () => {
    const binding = bindingFrom(repository, branch || 'placeholder', path);
    const repo = await projectRequest<{ defaultBranch: string; private: boolean }>('/api/github/repository', 'POST', { owner: binding.owner, repo: binding.repo, token });
    if (!branch) setBranch(repo.defaultBranch); setVisibility(repo.private);
  };
  const loadHistory = async (nextPage = 1) => {
    await props.flush();
    setVersions(await projectRequest<Version[]>(`${prefix}/checkpoints`));
    if (props.project?.connected) {
      const list = await projectRequest<Commit[]>(`${prefix}/history?page=${nextPage}`);
      setCommits((previous) => nextPage === 1 ? list : [...previous, ...list]); setMore(list.length === 20); setPage(nextPage);
    } else { setCommits([]); setMore(false); }
  };
  const connectionForm = <>
    <label>GitHub 小说仓库<input aria-label="GitHub 小说仓库" placeholder="用户名/小说仓库" value={repository} onChange={(e) => { setRepository(e.target.value); setVisibility(null); }} /></label>
    <label>GitHub Token<input aria-label="GitHub Token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} /></label>
    <p>推荐 private 仓库；如果选择 public，上传的小说及历史会公开。Token 请仅授权小说仓库的 Contents 读写权限；仅保存在当前 Node 运行会话，重启后需重新输入。</p>
    <button disabled={busy || !token || !repository} onClick={() => void run(verify)}><Check size={14} />验证仓库 / 取得默认分支</button>
    {visibility !== null && <p className={visibility ? '' : 'public-repository'}>{visibility ? '这是 private 仓库。' : '这是 public 仓库，上传的小说及历史将公开。请确认这是你的选择。'}</p>}
    <label>分支<input aria-label="GitHub 分支" placeholder="验证后取得默认分支" value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
    <label>作品文件路径<input aria-label="作品文件路径" value={path} onChange={(e) => setPath(e.target.value)} /></label>
    <p>使用已初始化的仓库和已有分支；空仓库请先在 GitHub 创建 README。断网时可填写分支，先创建本地待连接作品。</p>
  </>;
  return <div className="modal-backdrop"><section className="project-panel" role="dialog" aria-modal="true" aria-label="项目与版本">
    <header><div><span className="template-eyebrow"><GitBranch size={15} />项目与版本</span><h2>让故事有迹可循</h2></div><button className="icon-button" aria-label="关闭项目与版本" disabled={busy} onClick={props.onClose}><X size={18} /></button></header>
    <nav>{(['projects', 'connect', 'history'] as const).map((t) => <button disabled={busy} key={t} className={tab === t ? 'active' : ''} onClick={() => {
      setTab(t); setPreview(null); if (t === 'history') void run(() => loadHistory());
      if (t === 'projects') setPath(`projects/${newId}/story.json`);
      if (t === 'connect') { setPath(props.project?.github?.path ?? `projects/${props.projectId}/story.json`); }
    }}>{t === 'projects' ? '打开 / 新建' : t === 'connect' ? 'GitHub 同步' : '版本历史'}</button>)}</nav>
    <div className="project-panel-body">
      {error && <p role="alert" className="project-error">{error}</p>}
      {created && <button className="primary-button" disabled={busy} onClick={() => void run(async () => { await props.flush(); props.onSelect(created); })}>打开已创建的本地作品</button>}
      {tab === 'projects' && <><h3>本地项目</h3><div className="project-list">{projects.map((p) => <button disabled={busy} key={p.id} onClick={() => void run(async () => { await props.flush(); props.onSelect(p.id); })}><strong>{p.title}</strong><small>{p.id === props.projectId ? '当前项目 · ' : ''}{p.github ? `${p.github.owner}/${p.github.repo}` : '尚未绑定 GitHub'}</small></button>)}</div>
        <h3>创建作品</h3><label>作品名称<input aria-label="新作品名称" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>起始模板<select aria-label="起始模板" value={template} onChange={(e) => setTemplate(e.target.value)}>{starters.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.description}</option>)}</select></label>
        {connectionForm}
        <div className="project-actions"><button className="primary-button" disabled={busy || !!created || !title.trim() || !token || !repository} onClick={() => void run(async () => {
          await props.flush(); const github = bindingFrom(repository, branch, path === `projects/${props.projectId}/story.json` ? `projects/${newId}/story.json` : path);
          const result = await projectRequest<{ project: LiveProject }>('/api/projects', 'POST', { title, template, projectId: newId, github });
          setCreated(result.project.id);
          await projectRequest(`/api/projects/${result.project.id}/connect`, 'POST', { github, token });
          await projectRequest(`/api/projects/${result.project.id}/sync`, 'POST');
          props.onSelect(result.project.id);
        })}><Plus size={15} />创建并连接</button>
        <button disabled={busy || !token} onClick={() => void run(async () => {
          await props.flush(); const github = bindingFrom(repository, branch, path);
          const result = await projectRequest<{ project: LiveProject }>('/api/projects/import-remote', 'POST', { github, token }); props.onSelect(result.project.id);
        })}>打开仓库里的作品</button></div>
      </>}
      {tab === 'connect' && <>{connectionForm}<div className="project-actions">
        <button className="primary-button" disabled={busy || !token} onClick={() => void run(async () => {
          await props.flush(); const github = bindingFrom(repository, branch, path);
          const repo = await projectRequest<{ private: boolean }>(`${prefix}/connect`, 'POST', { github, token }); setVisibility(repo.private);
          setToken(''); await props.sync(); await props.refresh();
        })}>连接并同步</button>
        <button disabled={busy || !props.project?.connected} onClick={() => void run(props.sync)}>立即同步</button>
        <button disabled={busy || !props.project?.connected} onClick={() => void run(async () => { await projectRequest(`${prefix}/disconnect`, 'POST'); await props.refresh(); })}>清除会话 Token</button>
      </div><label className="project-checkbox"><input type="checkbox" checked={props.project?.autoSync ?? true} disabled={busy} onChange={(e) => { const enabled = e.target.checked; void run(async () => { await projectRequest(`${prefix}/auto-sync`, 'PUT', { enabled }); await props.refresh(); }); }} />每五分钟自动同步有变化的内容</label>
        <p>{props.project?.lastSyncedAt ? `上次同步：${new Date(props.project.lastSyncedAt).toLocaleString()}` : '尚未完成首次 GitHub 同步'} · {props.project?.pending ?? 0} 个版本待上传</p>
        {props.project?.syncError && <p className="project-error">{props.project.syncError}</p>}
        <button disabled={busy || !props.project?.connected} onClick={() => void run(async () => { setPreview({ document: await projectRequest<StoryDocument>(`${prefix}/remote`), source: '远端副本', restorable: false }); })}>查看远端副本（处理冲突）</button>
        <p>远端有修改时停止上传。可下载双方 JSON 保留内容；第一版不自动合并，也不强制覆盖远端。</p>
      </>}
      {tab === 'history' && <><label>版本说明<input aria-label="版本说明" maxLength={200} placeholder="例如：改写人物动机" value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <div className="project-actions"><button className="primary-button" disabled={busy} onClick={() => void run(async () => {
          await props.flush(); await projectRequest(`${prefix}/checkpoints`, 'POST', { message: message.trim() || '保存版本' }); setMessage('');
          await props.refresh(); await loadHistory();
          if (props.project?.connected) { try { await props.sync(); } finally { await loadHistory(); } }
        })}>保存版本</button><button disabled={busy} onClick={() => void run(() => loadHistory())}>刷新历史</button></div>
        <h3>本地版本</h3><p>未上传版本永久保留；已上传版本保留最近 30 份本地副本，完整历史在 GitHub。</p>
        <div className="project-list">{versions.map((v) => <button disabled={busy} key={v.id} onClick={() => void run(async () => { setPreview({ document: await projectRequest<StoryDocument>(`${prefix}/checkpoints/${v.id}`), source: v.id, restorable: true }); })}><strong>{v.message}</strong><small>{new Date(v.createdAt).toLocaleString()} · {v.commitSha ? '已上传' : '待上传'}</small></button>)}</div>
        <h3>GitHub 历史</h3>{!props.project?.connected && <p>连接 GitHub 后可浏览完整历史。本地版本随时可预览与恢复。</p>}
        <div className="project-list">{commits.map((c) => <button disabled={busy} key={c.sha} onClick={() => void run(async () => { setPreview({ document: await projectRequest<StoryDocument>(`${prefix}/history/${c.sha}`), source: c.sha, restorable: true }); })}><strong>{c.message.split('\n')[0]}</strong><small>{new Date(c.date).toLocaleString()} · {c.sha.slice(0, 8)}</small></button>)}</div>
        {more && <button disabled={busy} onClick={() => void run(() => loadHistory(page + 1))}>加载更早版本</button>}
      </>}
      {preview && <section className="version-preview"><h3>只读预览 · {preview.document.board.title}</h3><p>{preview.document.board.premise}</p><small>{preview.document.board.nodes.length} 张卡片 · {preview.document.board.edges.length} 条关系</small>
        <div className="project-actions"><button disabled={busy} onClick={() => download(preview.document)}>下载 JSON 副本</button>{preview.restorable && <button className="primary-button" disabled={busy} onClick={() => void run(async () => {
          await props.restore(preview.document, preview.source); setPreview(null); await loadHistory();
          if (props.project?.connected) { try { await props.sync(); } finally { await loadHistory(); } }
        })}>恢复为新版本（保留当前草稿）</button>}</div>
        {preview.document.board.nodes.map((n) => <article key={n.id}><strong>{n.data.title}</strong><p>{n.data.content}</p></article>)}
        <h4>关系</h4>{preview.document.board.edges.map((e) => <p key={e.id}>{e.source} → {e.target}：{e.label ?? '关联'}</p>)}
      </section>}
    </div>{busy && <div className="project-busy" role="status"><LoaderCircle className="spinning" size={15} />处理中，本地内容会保留</div>}
  </section></div>;
}
