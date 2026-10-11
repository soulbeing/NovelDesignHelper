import { z } from 'zod';
import { boardSchema, kinds, type Board } from './board';

export const chatMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(30000) });
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export const aiRequestSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
  model: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._:-]+$/),
  mode: z.enum(['chat', 'generate']),
  messages: z.array(chatMessageSchema).min(1).max(24),
  board: boardSchema,
});
const proposalSchema = z.object({
  title: z.string().min(1).max(120),
  premise: z.string().max(10000),
  nodes: z.array(z.object({ id: z.string().min(1).max(100), kind: z.enum(kinds), title: z.string().max(200), content: z.string().max(20000), act: z.string().max(100) })).min(1).max(60),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().max(200) })).max(180),
});
export const aiOutputSchema = z.object({ reply: z.string().min(1).max(30000), proposal: proposalSchema.nullable() });
export type AIOutput = z.infer<typeof aiOutputSchema>;

// Only use the supported strict JSON Schema subset. Validate semantic limits separately with Zod.
const string = { type: 'string' };
function object(properties: Record<string, unknown>) { return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }; }
export const aiJsonSchema = object({
  reply: string,
  proposal: { anyOf: [object({
    title: string, premise: string,
    nodes: { type: 'array', items: object({ id: string, kind: { type: 'string', enum: [...kinds] }, title: string, content: string, act: string }) },
    edges: { type: 'array', items: object({ source: string, target: string, label: string }) },
  }), { type: 'null' }] },
});

export function proposalToBoard(proposal: NonNullable<AIOutput['proposal']>): Board {
  const plotCount = proposal.nodes.filter((node) => node.kind === 'plot').length;
  let plotIndex = 0;
  let otherIndex = 0;
  const rows = Math.ceil(plotCount / 4);
  return boardSchema.parse({
    version: 1, title: proposal.title, premise: proposal.premise,
    nodes: proposal.nodes.map(({ id, ...data }) => {
      const index = data.kind === 'plot' ? plotIndex++ : otherIndex++;
      const yOffset = data.kind === 'plot' ? 0 : Math.max(rows, 1) * 300;
      return { id, type: 'story', data, position: { x: (index % 4) * 350 + 50, y: Math.floor(index / 4) * 300 + yOffset + 100 } };
    }),
    edges: proposal.edges.map((edge, index) => ({ id: `ai-edge-${index}`, ...edge })),
  });
}

export function appendProposal(current: Board, generated: Board, newId: () => string): Board {
  const ids = new Map(generated.nodes.map((node) => [node.id, newId()]));
  const offset = current.nodes.length ? Math.max(...current.nodes.map((node) => node.position.y)) + 350 : 0;
  return boardSchema.parse({ ...current,
    nodes: [...current.nodes, ...generated.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, position: { x: node.position.x, y: node.position.y + offset } }))],
    edges: [...current.edges, ...generated.edges.map((edge) => ({ ...edge, id: newId(), source: ids.get(edge.source)!, target: ids.get(edge.target)! }))],
  });
}
