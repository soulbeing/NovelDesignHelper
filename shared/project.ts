import { z } from 'zod';
import { boardSchema, type Board } from './board.js';

export const projectIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const documentSchema = z.strictObject({
  format: z.literal('story-weave'), version: z.literal(2), projectId: projectIdSchema,
  board: boardSchema, extensions: z.record(z.string(), z.json()).optional(),
});
export type StoryDocument = z.infer<typeof documentSchema>;

// v1 was a bare Board. Identity is supplied by its destination, never inferred from its title.
export function readDocument(value: unknown, projectId: string): StoryDocument {
  if (value && typeof value === 'object' && 'version' in value && value.version === 1) {
    return documentSchema.parse({ format: 'story-weave', version: 2, projectId, board: boardSchema.parse(value) });
  }
  return documentSchema.parse(value);
}
export function readBoard(value: unknown): Board {
  return readDocument(value, 'imported-board').board;
}
export function serializeDocument(document: StoryDocument): string {
  return JSON.stringify(documentSchema.parse(document), null, 2) + '\n';
}

const segment = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/).refine((s) => s !== '.' && s !== '..');
export const githubSchema = z.strictObject({
  owner: segment, repo: segment,
  branch: z.string().min(1).max(200).refine((s) => !/[\s~^:?*\[\\]/.test(s) && !s.includes('..') && !s.includes('@{') && !s.startsWith('/') && !s.endsWith('/') && !s.endsWith('.') && !s.endsWith('.lock')),
  path: z.string().min(1).max(300).refine((s) => s.endsWith('.json') && s.split('/').every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== '.' && p !== '..') && !s.startsWith('.github/')),
});
export type GitHubBinding = z.infer<typeof githubSchema>;
export const checkpointSchema = z.strictObject({
  id: projectIdSchema, message: z.string().min(1).max(200), createdAt: z.string(),
  document: documentSchema, commitSha: z.string().nullable(),
});
export const stateSchema = z.strictObject({
  version: z.literal(1), document: documentSchema, revision: z.number().int().nonnegative(),
  github: githubSchema.nullable(), autoSync: z.boolean(),
  remoteSha: z.string().nullable(), lastSyncedAt: z.string().nullable(),
  syncedDocument: z.string().nullable(), checkpoints: z.array(checkpointSchema),
});
export type ProjectState = z.infer<typeof stateSchema>;
export type ProjectInfo = {
  id: string; title: string; revision: number; github: GitHubBinding | null; autoSync: boolean;
  pending: number; dirty: boolean; lastSyncedAt: string | null; connected: boolean;
};
export function projectInfo(state: ProjectState, connected = false): ProjectInfo {
  return { id: state.document.projectId, title: state.document.board.title, revision: state.revision,
    github: state.github, autoSync: state.autoSync, pending: state.checkpoints.filter((c) => !c.commitSha).length,
    dirty: state.syncedDocument !== serializeDocument(state.document), lastSyncedAt: state.lastSyncedAt, connected };
}
