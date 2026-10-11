import assert from 'node:assert/strict';
import test from 'node:test';
import { boardSchema, createExample, toMarkdown } from '../shared/board.js';
import { appendProposal, proposalToBoard } from '../shared/ai.js';

test('example and backup roundtrip preserve nodes, connections, and positions', () => {
  const example = createExample();
  assert.deepEqual(boardSchema.parse(JSON.parse(JSON.stringify(example))), example);
});
test('invalid imported connections and duplicate IDs are rejected', () => {
  const example = createExample();
  assert.equal(boardSchema.safeParse({ ...example, nodes: [...example.nodes, example.nodes[0]] }).success, false);
  assert.equal(boardSchema.safeParse({ ...example, edges: [{ id: 'bad', source: 'missing', target: 'plot-1' }] }).success, false);
});
test('AI export includes full details and labeled directional relationships', () => {
  const board = createExample();
  const output = toMarkdown(board);
  for (const node of board.nodes) { assert.ok(output.includes(node.data.title)); assert.ok(output.includes(node.data.content)); }
  assert.ok(output.includes('一封不该存在的信 [plot-1] → 灯塔下的交易 [plot-2]：追寻线索'));
});
const proposal = {
  title: '新的支线', premise: '寻找一封旧信',
  nodes: [
    { id: 'plot-1', kind: 'plot' as const, title: '发现', content: '发现线索', act: '起点' },
    { id: 'plot-2', kind: 'plot' as const, title: '追寻', content: '追寻线索', act: '发展' },
  ],
  edges: [{ source: 'plot-1', target: 'plot-2', label: '推动' }],
};
test('AI proposals become editable cards and append safely with new IDs', () => {
  const current = createExample();
  const generated = proposalToBoard(proposal);
  let index = 0;
  const appended = appendProposal(current, generated, () => `fresh-${index++}`);
  assert.equal(appended.nodes.length, current.nodes.length + 2);
  assert.equal(appended.title, current.title);
  assert.deepEqual(appended.nodes.slice(0, current.nodes.length), current.nodes);
  const appendedEdge = appended.edges.at(-1)!;
  assert.equal(appendedEdge.source, 'fresh-0');
  assert.equal(appendedEdge.target, 'fresh-1');
  assert.ok(appended.nodes.at(-1)!.position.y > Math.max(...current.nodes.map((node) => node.position.y)));
});
test('AI proposal referencing missing nodes cannot be applied', () => {
  assert.throws(() => proposalToBoard({ ...proposal, edges: [{ source: 'missing', target: 'plot-1', label: 'bad' }] }));
});
