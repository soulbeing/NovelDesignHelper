import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { BookOpen, Lightbulb, MapPin, UserRound } from 'lucide-react';
import { kindInfo, type Kind, type StoryData } from '../shared/board';

export const kindIcons = { plot: BookOpen, character: UserRound, world: MapPin, note: Lightbulb };
export type StoryNodeType = Node<StoryData, 'story'>;
export const StoryNode = memo(function StoryNode({ data, selected }: NodeProps<StoryNodeType>) {
  const Icon = kindIcons[data.kind as Kind];
  return <article className={`story-card ${data.kind} ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} aria-label="接收连线" />
    <div className="card-meta"><span><Icon size={13} />{kindInfo[data.kind].label}</span><span className="card-act">{data.act}</span></div>
    <h3>{data.title || '未命名'}</h3>
    <p>{data.content || kindInfo[data.kind].placeholder}</p>
    <div className="card-footer"><span>{data.kind === 'plot' ? 'STORY BEAT' : data.kind === 'character' ? 'CHARACTER' : data.kind === 'world' ? 'WORLD BUILDING' : 'IDEA & NOTE'}</span><span className="card-dot" /></div>
    <Handle type="source" position={Position.Right} aria-label="发起连线" />
  </article>;
});
