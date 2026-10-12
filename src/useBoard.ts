import { useCallback, useEffect, useRef, useState } from 'react';
import { type Board } from '../shared/board';
import { readDocument, type StoryDocument, type ProjectInfo } from '../shared/project';

export type LiveProject = ProjectInfo & { syncError: string; syncing: boolean };
export async function projectRequest<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '请求失败');
  return value as T;
}
type Loaded = { document: StoryDocument; project: LiveProject };
type Status = 'loading' | 'saved' | 'saving' | 'offline';

// App mounts one editor per project ID, isolating history and callbacks.
export function useBoard(projectId: string) {
  const backupKey = `novel-design-helper:backup:project:${projectId}`;
  const [board, setBoard] = useState<Board | null>(null);
  const [project, setProject] = useState<LiveProject | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<StoryDocument | null>(null);
  const [revision, setRevision] = useState(0);
  const current = useRef<StoryDocument | null>(null);
  const serverRevision = useRef(0);
  const localRevision = useRef(0);
  const persisted = useRef(0);
  const queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const undoStack = useRef<StoryDocument[]>([]);
  const redoStack = useRef<StoryDocument[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let draft: { document: StoryDocument; pending: boolean; revision: number } | null = null;
    try {
      let stored = JSON.parse(localStorage.getItem(backupKey) || 'null');
      if (!stored && projectId === 'legacy-board') {
        const old = JSON.parse(localStorage.getItem('novel-design-helper:backup:v1') || 'null');
        if (old) stored = { document: old.board, pending: old.pending, revision: 0 };
      }
      if (stored) draft = { document: readDocument(stored.document, projectId), pending: stored.pending === true, revision: stored.revision ?? 0 };
      if (draft?.document.projectId !== projectId) draft = null;
    } catch { /* Invalid backups must not replace a valid server document. */ }
    void (async () => {
      try {
        const loaded = await projectRequest<Loaded>(`/api/projects/${projectId}`);
        if (cancelled) return;
        const document = readDocument(loaded.document, projectId);
        current.current = document; serverRevision.current = loaded.project.revision;
        setBoard(document.board); setProject(loaded.project); setStatus('saved');
        if (draft?.pending && JSON.stringify(draft.document) !== JSON.stringify(document)) setRecovery(draft.document);
        else {
          try { localStorage.setItem(backupKey, JSON.stringify({ document, pending: false, revision: loaded.project.revision })); }
          catch { setError('浏览器本机备份不可用，请及时导出 JSON。'); }
        }
      } catch (e) {
        if (cancelled) return;
        if (draft) { current.current = draft.document; serverRevision.current = draft.revision; setBoard(draft.document.board); }
        setStatus('offline');
        setError(`${e instanceof Error ? e.message : '读取失败'}${draft ? '。已打开本机草稿，服务器恢复前请保留导出备份。' : ''}`);
      }
    })();
    return () => { cancelled = true; mounted.current = false; };
  }, [backupKey, projectId]);

  const backup = useCallback((document: StoryDocument, pending: boolean) => {
    try { localStorage.setItem(backupKey, JSON.stringify({ document, pending, revision: serverRevision.current })); }
    catch { if (mounted.current) setError('浏览器备份空间不足，请及时导出 JSON。'); }
  }, [backupKey]);
  const flush = useCallback(async () => {
    const snapshot = current.current;
    const version = localRevision.current;
    if (!snapshot) return;
    const operation = queue.current.then(async () => {
      if (version <= persisted.current) return;
      if (mounted.current) setStatus('saving');
      try {
        const loaded = await projectRequest<Loaded>(`/api/projects/${projectId}`, 'PUT', { document: snapshot, revision: serverRevision.current });
        serverRevision.current = loaded.project.revision; persisted.current = version;
        if (mounted.current) setProject(loaded.project);
        if (version === localRevision.current) {
          backup(snapshot, false);
          if (mounted.current) { setStatus('saved'); setError(''); }
        }
      } catch (e) {
        if (mounted.current) { setStatus('offline'); setError(e instanceof Error ? e.message : '本地服务器保存失败'); }
        throw e;
      }
    });
    queue.current = operation.catch(() => {});
    await operation;
  }, [backup, projectId]);
  useEffect(() => {
    if (!board || revision === 0) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [board, revision, flush]);

  const install = useCallback((next: Board) => {
    if (!current.current) return;
    current.current = { ...current.current, board: next };
    localRevision.current++; setRevision(localRevision.current); setBoard(next); setStatus('saving');
    backup(current.current, true);
  }, [backup]);
  const checkpoint = useCallback(() => {
    if (!current.current) return;
    undoStack.current = [...undoStack.current.slice(-79), current.current]; redoStack.current = [];
    setHistoryTick((n) => n + 1);
  }, []);
  const update = useCallback((change: (previous: Board) => Board, record = true) => {
    if (!current.current) return;
    const next = change(current.current.board);
    if (JSON.stringify(next) === JSON.stringify(current.current.board)) return;
    if (record) checkpoint(); install(next);
  }, [checkpoint, install]);
  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous || !current.current) return;
    redoStack.current.push(current.current); current.current = previous; install(previous.board); setHistoryTick((n) => n + 1);
  }, [install]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next || !current.current) return;
    undoStack.current.push(current.current); current.current = next; install(next.board); setHistoryTick((n) => n + 1);
  }, [install]);
  const refreshProject = useCallback(async () => {
    const loaded = await projectRequest<Loaded>(`/api/projects/${projectId}`);
    if (mounted.current) setProject(loaded.project);
  }, [projectId]);
  const synchronize = useCallback(async () => {
    await flush();
    try { await projectRequest(`/api/projects/${projectId}/sync`, 'POST'); }
    finally { await refreshProject(); }
  }, [flush, projectId, refreshProject]);
  useEffect(() => {
    if (!project?.connected || !project.autoSync) return;
    const timer = setInterval(() => { void synchronize().catch(() => {}); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [project?.connected, project?.autoSync, synchronize]);
  const restore = useCallback(async (document: StoryDocument, source: string) => {
    await flush();
    const loaded = await projectRequest<Loaded>(`/api/projects/${projectId}/restore`, 'POST', { document, source, revision: serverRevision.current });
    current.current = loaded.document; serverRevision.current = loaded.project.revision;
    persisted.current = ++localRevision.current; setRevision(localRevision.current);
    undoStack.current = []; redoStack.current = []; setHistoryTick((n) => n + 1);
    setBoard(loaded.document.board); setProject(loaded.project); setStatus('saved'); backup(loaded.document, false);
  }, [flush, projectId, backup]);
  const retry = useCallback(() => {
    if (current.current) { localRevision.current++; void flush().catch(() => {}); }
    else window.location.reload();
  }, [flush]);
  const importDocument = useCallback((document: StoryDocument) => {
    checkpoint(); current.current = { ...document, projectId }; install(document.board);
  }, [checkpoint, install, projectId]);
  return { board, project, status, error, recovery, setRecovery, update, checkpoint, undo, redo, retry,
    flush, synchronize, restore, refreshProject, importDocument, getDocument: () => current.current,
    canUndo: historyTick >= 0 && undoStack.current.length > 0, canRedo: historyTick >= 0 && redoStack.current.length > 0 };
}
