import { useCallback, useEffect, useRef, useState } from 'react';
import { boardSchema, type Board } from '../shared/board';

const backupKey = 'novel-design-helper:backup:v1';
type Status = 'loading' | 'saved' | 'saving' | 'offline';
export function useBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<Board | null>(null);
  const [revision, setRevision] = useState(0);
  const current = useRef<Board | null>(null);
  const latestRevision = useRef(0);
  const queue = useRef(Promise.resolve());
  const undoStack = useRef<Board[]>([]);
  const redoStack = useRef<Board[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let backup: { board: Board; pending: boolean } | null = null;
    try {
      const stored = JSON.parse(localStorage.getItem(backupKey) || 'null');
      if (stored) backup = { board: boardSchema.parse(stored.board), pending: stored.pending === true };
    } catch { /* An invalid backup must not prevent loading the server copy. */ }
    void (async () => {
      try {
        const response = await fetch('/api/board', { signal: controller.signal });
        if (!response.ok) throw new Error('读取服务器失败');
        const loaded = boardSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        current.current = loaded;
        setBoard(loaded);
        setStatus('saved');
        if (backup?.pending && JSON.stringify(backup.board) !== JSON.stringify(loaded)) setRecovery(backup.board);
      } catch {
        if (controller.signal.aborted) return;
        if (backup) { current.current = backup.board; setBoard(backup.board); }
        setStatus('offline');
        setError(backup ? '服务器不可用，已打开本机备份。修改会保存在本机，请连接服务器后重试。' : '无法读取故事板，请确认 Node 服务器运行后重试。');
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!board || revision === 0) return;
    const snapshot = boardSchema.parse(board);
    try { localStorage.setItem(backupKey, JSON.stringify({ board: snapshot, pending: true })); }
    catch { setError('本机备份不可用，请及时导出 JSON 备份。'); }
    setStatus('saving');
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        try {
          const response = await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
          if (!response.ok) throw new Error('保存失败');
          if (revision === latestRevision.current) {
            setStatus('saved');
            setError('');
            try { localStorage.setItem(backupKey, JSON.stringify({ board: snapshot, pending: false })); }
            catch { setError('服务器已保存，但本机备份不可用。'); }
          }
        } catch {
          if (revision === latestRevision.current) {
            setStatus('offline');
            setError('尚未保存到服务器。请重试，或导出 JSON 保留当前内容。');
          }
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [board, revision]);

  const install = useCallback((next: Board) => {
    current.current = next;
    setBoard(next);
    latestRevision.current += 1;
    setRevision(latestRevision.current);
  }, []);
  const checkpoint = useCallback(() => {
    if (current.current) {
      undoStack.current = [...undoStack.current.slice(-79), current.current];
      redoStack.current = [];
      setHistoryTick((n) => n + 1);
    }
  }, []);
  const update = useCallback((change: (previous: Board) => Board, record = true) => {
    if (!current.current) return;
    const next = change(current.current);
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    if (record) checkpoint();
    install(next);
  }, [checkpoint, install]);
  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous || !current.current) return;
    redoStack.current.push(current.current);
    install(previous);
    setHistoryTick((n) => n + 1);
  }, [install]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next || !current.current) return;
    undoStack.current.push(current.current);
    install(next);
    setHistoryTick((n) => n + 1);
  }, [install]);
  const retry = useCallback(() => {
    if (current.current) install(current.current);
    else window.location.reload();
  }, [install]);
  return { board, status, error, recovery, setRecovery, update, checkpoint, undo, redo, retry,
    canUndo: historyTick >= 0 && undoStack.current.length > 0,
    canRedo: historyTick >= 0 && redoStack.current.length > 0 };
}
