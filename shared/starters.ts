import { boardSchema, type Board, type Kind } from './board.js';

export const starters = [
  { id: 'blank', title: '空白灵感板', description: '从一个念头开始，自由记录。' },
  { id: 'short', title: '短篇故事', description: '目标、阻碍、选择与结局。' },
  { id: 'novel', title: '长篇小说', description: '人物、世界、主线与支线。' },
  { id: 'relations', title: '人物关系', description: '诉求、秘密与关系冲突。' },
  { id: 'mystery', title: '悬疑推理', description: '真相、线索、误导与揭露。' },
] as const;
const cards: Record<string, [Kind, string, string][]> = {
  blank: [],
  short: [['character', '主角', '想要什么？为什么现在必须行动？'], ['plot', '目标', '主角试图改变什么？'], ['plot', '阻碍', '谁阻止了主角？代价是什么？'], ['plot', '关键选择', '主角必须放弃什么？'], ['plot', '结局', '选择带来了什么变化？']],
  novel: [['character', '主要人物', '渴望、恐惧、秘密与成长。'], ['world', '世界规则', '时代、地点、限制与代价。'], ['plot', '主线起点', '打破日常的事件是什么？'], ['plot', '主线升级', '冲突如何逐渐升级？'], ['plot', '主线收束', '最终选择与结果。'], ['plot', '支线', '支线如何影响主线？']],
  relations: [['character', '人物 A', '诉求、秘密、对 B 的期待。'], ['character', '人物 B', '诉求、秘密、对 A 的误解。'], ['character', '人物 C', '谁与他结盟？谁与他冲突？'], ['note', '关系转折', '什么事件会改变彼此的立场？']],
  mystery: [['note', '真相', '作者知道的真实经过。'], ['character', '调查者', '调查动机与盲点。'], ['plot', '第一条线索', '它指向什么？'], ['plot', '误导', '什么合理解释掩盖了真相？'], ['plot', '揭露', '哪条证据推翻了旧解释？'], ['note', '伏笔回收', '重读时哪些细节会有新含义？']],
};
export function createStarter(template: string, title: string): Board {
  if (!(template in cards)) throw new Error('未知起始模板');
  const nodes = cards[template].map(([kind, name, content], i) => ({ id: `starter-${i}`, type: 'story' as const,
    position: { x: (i % 3) * 350, y: Math.floor(i / 3) * 320 }, data: { kind, title: name, content, act: '' } }));
  const plots = nodes.filter((n) => n.data.kind === 'plot');
  const edges = plots.slice(1).map((n, i) => ({ id: `starter-edge-${i}`, source: plots[i].id, target: n.id, label: '推动' }));
  if (template === 'relations') edges.push({ id: 'relationship', source: nodes[0].id, target: nodes[1].id, label: '待定义的关系' });
  return boardSchema.parse({ version: 1, title, premise: '', nodes, edges });
}
