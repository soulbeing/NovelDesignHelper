import { mkdir, readFile, writeFile, rename, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createExample } from '../shared/board.js';
import { documentSchema, projectIdSchema, readDocument, stateSchema, type StoryDocument, type ProjectState } from '../shared/project.js';

export class StorageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export class ProjectStore {
  private queues = new Map<string, Promise<unknown>>();
  private initialization: Promise<void> | undefined;
  constructor(private directory: string) {}
  private file(id: string) { return path.join(this.directory, 'projects', `${projectIdSchema.parse(id)}.json`); }
  private async atomic(file: string, text: string) {
    await mkdir(path.dirname(file), { recursive: true });
    try { await copyFile(file, `${file}.bak`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    await writeFile(`${file}.tmp`, text, 'utf8');
    await rename(`${file}.tmp`, file);
  }
  async initialize() {
    this.initialization ??= (async () => {
      await mkdir(path.join(this.directory, 'projects'), { recursive: true });
      // A stable destination makes migration idempotent even if the process stops after writing it.
      const migrated = this.file('legacy-board');
      try { stateSchema.parse(JSON.parse(await readFile(migrated, 'utf8'))); return; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      let raw: unknown;
      try { raw = JSON.parse(await readFile(path.join(this.directory, 'board.json'), 'utf8')); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; raw = createExample(); }
      const document = readDocument(raw, 'legacy-board');
      document.projectId = 'legacy-board';
      await this.atomic(migrated, JSON.stringify(this.initialState(document), null, 2));
      // board.json is deliberately retained unchanged as the original migration backup.
    })();
    try { await this.initialization; } catch (e) { this.initialization = undefined; throw e; }
  }
  initialState(document: StoryDocument): ProjectState {
    return { version: 1, document: documentSchema.parse(document), revision: 0, github: null, autoSync: true,
      remoteSha: null, lastSyncedAt: null, syncedDocument: null, checkpoints: [] };
  }
  async get(id: string) {
    await this.initialize();
    try {
      const state = stateSchema.parse(JSON.parse(await readFile(this.file(id), 'utf8')));
      if (state.document.projectId !== id) throw new StorageError('项目文件身份不匹配，原文件已保留');
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageError('项目不存在', 404);
      throw e;
    }
  }
  async list() {
    await this.initialize();
    const files = (await readdir(path.join(this.directory, 'projects'))).filter((f) => f.endsWith('.json'));
    return Promise.all(files.map((f) => this.get(f.slice(0, -5))));
  }
  async create(document: StoryDocument) {
    await this.initialize();
    return this.lock(document.projectId, async () => {
      try { await readFile(this.file(document.projectId)); throw new StorageError('此项目已存在，请打开已有项目', 409); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      const state = this.initialState(document);
      await this.atomic(this.file(document.projectId), JSON.stringify(state, null, 2));
      return state;
    });
  }
  async change(id: string, change: (state: ProjectState) => void | Promise<void>) {
    return this.lock(id, async () => {
      const state = await this.get(id);
      const before = JSON.stringify(state);
      await change(state);
      const valid = stateSchema.parse(state);
      if (valid.document.projectId !== id) throw new StorageError('不能改变项目身份');
      if (JSON.stringify(valid) === before) return valid;
      await this.atomic(this.file(id), JSON.stringify(valid, null, 2));
      return valid;
    });
  }
  private async lock<T>(id: string, work: () => Promise<T>): Promise<T> {
    projectIdSchema.parse(id);
    const operation = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(work);
    this.queues.set(id, operation);
    try { return await operation; }
    finally { if (this.queues.get(id) === operation) this.queues.delete(id); }
  }
  checkpoint(state: ProjectState, message: string, document = state.document) {
    const point = { id: randomUUID(), message, createdAt: new Date().toISOString(), document: structuredClone(document), commitSha: null };
    state.checkpoints.push(point);
    return point;
  }
}
