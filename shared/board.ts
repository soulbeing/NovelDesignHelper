import { z } from 'zod';

export const kinds = ['plot', 'character', 'world', 'note'] as const;
export type Kind = (typeof kinds)[number];
export const kindInfo: Record<Kind, { label: string; subtitle: string; placeholder: string }> = {
  plot: { label: '情节', subtitle: '让故事向前走', placeholder: '发生了什么？谁做出了选择，又付出了什么代价？' },
  character: { label: '人物', subtitle: '每个人都有所渴望', placeholder: '他想要什么？害怕什么？哪些矛盾推动着他？' },
  world: { label: '设定', subtitle: '故事发生的世界', placeholder: '记录地点、规则、时代背景，或一个重要的物件。' },
  note: { label: '备注', subtitle: '留住一闪而过的灵感', placeholder: '伏笔、对白、待解决的问题，或任何灵感……' },
};
const id = z.string().min(1).max(100);
const finite = z.number().finite();
export const boardSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1).max(120),
  premise: z.string().max(10000),
  nodes: z.array(z.object({
    id,
    type: z.literal('story'),
    position: z.strictObject({ x: finite, y: finite }),
    data: z.strictObject({
      kind: z.enum(kinds),
      title: z.string().max(200),
      content: z.string().max(20000),
      act: z.string().max(100),
    }),
  }).strict()).max(1500),
  edges: z.array(z.object({
    id,
    source: id,
    target: id,
    label: z.string().max(200).optional(),
  }).strict()).max(5000),
  extensions: z.record(z.string(), z.json()).optional(),
}).strict().superRefine((board, ctx) => {
  const ids = new Set(board.nodes.map((node) => node.id));
  if (ids.size !== board.nodes.length || new Set(board.edges.map((edge) => edge.id)).size !== board.edges.length) {
    ctx.addIssue({ code: 'custom', message: '卡片或连线 ID 重复' });
  }
  for (const edge of board.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) ctx.addIssue({ code: 'custom', message: '连线引用了不存在的卡片' });
  }
});
export type Board = z.infer<typeof boardSchema>;
export type StoryData = Board['nodes'][number]['data'];

export function createExample(): Board {
  return {
    version: 1,
    title: '雾港来信',
    premise: '一位修复旧书的女孩收到来自失踪父亲的信，在一座逐渐遗忘过去的港城里，寻找记忆与真相。',
    nodes: [
      { id: 'world-1', type: 'story', position: { x: 50, y: 40 }, data: { kind: 'world', title: '一座会遗忘的城市', act: '世界规则', content: '每逢大雾，雾港的人们就会失去一段记忆。唯有写在纸上的文字能够留下。' } },
      { id: 'character-1', type: 'story', position: { x: 50, y: 310 }, data: { kind: 'character', title: '林照 · 旧书修复师', act: '主角', content: '渴望：找回父亲。\n恐惧：最后连自己也忘记他。\n秘密：她能读到被擦去的文字。' } },
      { id: 'plot-1', type: 'story', position: { x: 400, y: 70 }, data: { kind: 'plot', title: '一封不该存在的信', act: '第一幕 · 开端', content: '书页夹层里，林照发现一封父亲的来信。邮戳却是明天。\n信上只有一句话：不要相信灯塔。' } },
      { id: 'plot-2', type: 'story', position: { x: 750, y: 70 }, data: { kind: 'plot', title: '灯塔下的交易', act: '第二幕 · 发展', content: '守塔人愿意交出父亲的下落，条件是林照帮他修复一本没有文字的航海日志。' } },
      { id: 'plot-3', type: 'story', position: { x: 1100, y: 70 }, data: { kind: 'plot', title: '被藏起来的真相', act: '第三幕 · 转折', content: '日志里的航线通向城市的记忆。父亲的失踪，可能是一场主动选择。\n林照必须决定：找回一个人，还是唤醒整座城。' } },
      { id: 'note-1', type: 'story', position: { x: 750, y: 350 }, data: { kind: 'note', title: '一个待回收的伏笔', act: '灵感备忘', content: '开篇出现的蓝色邮票，可以在结尾成为辨认真信的线索。\n想一想：守塔人为什么害怕晴天？' } },
    ],
    edges: [
      { id: 'e1', source: 'plot-1', target: 'plot-2', label: '追寻线索' },
      { id: 'e2', source: 'plot-2', target: 'plot-3', label: '揭开秘密' },
      { id: 'e3', source: 'character-1', target: 'plot-1', label: '卷入事件' },
      { id: 'e4', source: 'world-1', target: 'plot-1', label: '背景' },
    ],
  };
}

export function toMarkdown(board: Board): string {
  const lines = [`# ${board.title}`, '', '## 故事核心', '', board.premise || '（尚未填写）', '', '## 设计元素', ''];
  for (const node of board.nodes) {
    lines.push(`### ${node.data.title || '未命名'} [${node.id}]`, `类型：${kindInfo[node.data.kind].label}`, `阶段 / 身份：${node.data.act || '未指定'}`, '', node.data.content || '（尚未填写）', '');
  }
  lines.push('## 结构与关系', '');
  const titles = new Map(board.nodes.map((node) => [node.id, node.data.title || '未命名']));
  for (const edge of board.edges) lines.push(`- ${titles.get(edge.source)} [${edge.source}] → ${titles.get(edge.target)} [${edge.target}]：${edge.label || '关联'}`);
  lines.push('', '## 给 AI 的写作要求', '', '请依据上面的情节、人物、设定和关系设计小说。箭头表示所标注的关系，不一定是时间顺序。允许分支和循环。先整理情节因果与伏笔回收，指出缺失或矛盾的信息，待作者确认后再按章节写作。不要把尚未确定的内容当作既定事实。', '');
  return lines.join('\n');
}
