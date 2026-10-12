import assert from 'node:assert/strict';
import test from 'node:test';
import { boardSchema, createExample, toMarkdown } from '../shared/board.js';
import { appendProposal } from '../shared/ai.js';
import { createTemplateBoard, filterPlotTemplates, plotTemplates, templateScopes } from '../shared/templates.js';

test('all templates provide valid, connected, editable roles and sequential events', () => {
  assert.equal(new Set(plotTemplates.map((template) => template.id)).size, plotTemplates.length);
  for (const template of plotTemplates) {
    const board = createTemplateBoard(template);
    assert.ok(boardSchema.safeParse(board).success, template.name);
    assert.equal(board.nodes.filter((node) => node.data.kind === 'character').length, template.roles.length);
    assert.equal(board.nodes.filter((node) => node.data.kind === 'plot').length, template.beats.length);
    assert.ok(template.roles.length >= (template.scope === 'chapter' ? 2 : 3), template.name);
    const sequenceLabel = template.scope === 'chapter' ? '引出下一节拍' : '推动下一阶段';
    assert.equal(board.edges.filter((edge) => edge.label === sequenceLabel).length, template.beats.length - 1);
    for (const role of template.roles) assert.ok(board.edges.some((edge) => edge.source === `role-${role.id}` || edge.target === `role-${role.id}`), `${template.name}: ${role.id} has no relationship`);
    for (const relation of template.relationships) assert.ok(board.edges.some((edge) => edge.source === `role-${relation.source}` && edge.target === `role-${relation.target}` && edge.label === relation.label));
    assert.equal(JSON.stringify(board).includes('{{'), false);
    for (const node of board.nodes.filter((node) => node.data.kind === 'plot')) assert.ok(node.data.content.includes('待补：'));
  }
});
test('original long arcs are preserved and both scopes have expandable collections', () => {
  const originalIds = ['borrowed-blade', 'three-way-prize', 'reluctant-alliance', 'hidden-traitor', 'manufactured-misunderstanding', 'identity-reveal', 'public-comeback', 'trial-treasure'];
  for (const id of originalIds) assert.ok(plotTemplates.some((item) => item.id === id && item.scope === 'arc'));
  const chapters = filterPlotTemplates('chapter');
  const arcs = filterPlotTemplates('arc');
  assert.ok(chapters.length >= 14);
  assert.ok(arcs.length > originalIds.length);
  assert.ok(chapters.every((item) => item.beats.length <= 4));
  assert.ok(chapters.some((item) => item.category === '对话交锋'));
  assert.ok(chapters.some((item) => item.category === '行为互动'));
  assert.ok(chapters.some((item) => item.category === '场景转折'));
});
test('scope, category and keyword search combine without returning the other scope', () => {
  const result = filterPlotTemplates('chapter', '行为互动', ' 嘴硬 ');
  assert.deepEqual(result.map((item) => item.id), ['hard-words-soft-hands']);
  assert.equal(filterPlotTemplates('arc', '全部', '嘴硬').length, 0);
  assert.equal(filterPlotTemplates('chapter', '多人博弈').length, 0);
  assert.equal(filterPlotTemplates('chapter', '全部', '不存在的模板').length, 0);
  assert.ok(filterPlotTemplates('arc', '多人博弈').every((item) => item.category === '多人博弈' && item.scope === 'arc'));
});
test('chapter patterns retain dialogue and action cues and scope in saved and exported cards', () => {
  for (const template of filterPlotTemplates('chapter')) {
    const names = Object.fromEntries(template.roles.map((role, index) => [role.id, `人物${index + 1}`]));
    const board = createTemplateBoard(template, names);
    const beats = board.nodes.filter((node) => node.data.kind === 'plot');
    assert.ok(beats.every((node) => node.data.act.includes('章内套路')));
    assert.ok(beats.some((node) => /句式示例：|动作示例：/.test(node.data.content)), template.name);
    const exported = toMarkdown(boardSchema.parse(JSON.parse(JSON.stringify(board))));
    assert.ok(exported.includes('作用范围：章内套路'));
    assert.ok(exported.includes('人物1'));
    assert.ok(exported.includes('引出下一节拍'));
  }
  const arc = createTemplateBoard(filterPlotTemplates('arc')[0]);
  assert.ok(toMarkdown(arc).includes(templateScopes.arc.label));
});
test('custom role names resolve in cards, event details, guide, and AI export', () => {
  const template = plotTemplates[0];
  const board = createTemplateBoard(template, { hero: '  林照  ', rival: '老秦', schemer: '阿秋' });
  assert.equal(board.nodes[0].data.title, '林照');
  const content = toMarkdown(board);
  assert.ok(content.includes('林照与老秦'));
  assert.ok(content.includes('阿秋制造'));
  assert.ok(content.includes('主角 → 林照'));
  assert.equal(content.includes('（待命名）'), false);
  assert.equal(content.includes('{{'), false);
});
test('blank role names keep meaningful placeholders', () => {
  const board = createTemplateBoard(plotTemplates[0], { hero: '   ' });
  assert.equal(board.nodes[0].data.title, '主角（待命名）');
  assert.ok(board.nodes.some((node) => node.data.content.includes('主角（待命名）')));
});
test('repeated insertion keeps existing story and uses disjoint IDs and positions', () => {
  const original = createExample();
  const fragment = createTemplateBoard(plotTemplates[0]);
  let index = 0;
  const newId = () => `template-instance-${index++}`;
  const first = appendProposal(original, fragment, newId);
  const second = appendProposal(first, fragment, newId);
  assert.deepEqual(second.nodes.slice(0, original.nodes.length), original.nodes);
  assert.deepEqual(second.edges.slice(0, original.edges.length), original.edges);
  assert.equal(second.title, original.title);
  assert.equal(second.premise, original.premise);
  assert.equal(second.nodes.length, original.nodes.length + fragment.nodes.length * 2);
  assert.equal(new Set(second.nodes.map((node) => node.id)).size, second.nodes.length);
  const firstNodes = first.nodes.slice(original.nodes.length);
  const secondNodes = second.nodes.slice(first.nodes.length);
  assert.ok(Math.min(...secondNodes.map((node) => node.position.y)) > Math.max(...firstNodes.map((node) => node.position.y)));
  const secondIds = new Set(secondNodes.map((node) => node.id));
  for (const edge of second.edges.slice(first.edges.length)) assert.ok(secondIds.has(edge.source) && secondIds.has(edge.target));
  assert.deepEqual(boardSchema.parse(JSON.parse(JSON.stringify(second))), second);
});
