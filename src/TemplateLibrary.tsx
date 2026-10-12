import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, GitBranch, Plus, Search, Users, X } from 'lucide-react';
import { createTemplateBoard, filterPlotTemplates, plotTemplates, templateCategories, templateScopes, type PlotTemplate, type TemplateScope } from '../shared/templates';
import type { Board } from '../shared/board';

export default function TemplateLibrary({ board, onClose, onInsert }: { board: Board; onClose: () => void; onInsert: (fragment: Board) => void }) {
  const [scope, setScope] = useState<TemplateScope>('chapter');
  const [category, setCategory] = useState<string>('全部');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLElement>(null);
  const visible = filterPlotTemplates(scope, category, query);
  const template = visible.find((item) => item.id === selectedId) || visible[0];
  const preview = useMemo(() => template ? createTemplateBoard(template, names) : null, [template, names]);
  const categories = templateCategories.filter((item) => plotTemplates.some((candidate) => candidate.scope === scope && candidate.category === item));
  const selectTemplate = (item: PlotTemplate) => { setSelectedId(item.id); setNames({}); };
  const canInsert = !!preview && board.nodes.length + preview.nodes.length <= 1500 && board.edges.length + preview.edges.length <= 5000;
  return <div className="modal-backdrop" onClick={onClose} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <section ref={dialog} className="template-library" role="dialog" aria-modal="true" aria-labelledby="template-library-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <header className="template-library-header"><div><span className="template-eyebrow"><GitBranch size={14} />STORY PATTERNS</span><h2 id="template-library-title">剧情模板</h2><p>{templateScopes[scope].description}</p></div><button className="icon-button" aria-label="关闭剧情模板" onClick={onClose}><X size={20} /></button></header>
      <div className="template-scopes" role="group" aria-label="套路作用范围">{(['chapter', 'arc'] as const).map((item) => <button key={item} aria-label={templateScopes[item].label} aria-pressed={scope === item} className={scope === item ? 'active' : ''} onClick={() => { setScope(item); setCategory('全部'); setQuery(''); setSelectedId(''); setNames({}); }}><span>{templateScopes[item].label}<b>{plotTemplates.filter((candidate) => candidate.scope === item).length}</b></span><small>{item === 'chapter' ? '单场景 · 对话、行为与小转折' : '多章节 · 铺垫、升级与回收'}</small></button>)}</div>
      <div className="template-categories" role="group" aria-label="套路类型">{['全部', ...categories].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => { setCategory(item); setSelectedId(''); setNames({}); }}>{item}</button>)}</div>
      <div className="template-library-body">
        <aside className="template-picker"><label className="search-field"><Search size={14} /><input autoFocus aria-label="搜索剧情模板" placeholder="搜索套路、冲突或关系…" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setNames({}); }} /></label><div className="template-list">{visible.map((item) => <button key={item.id} aria-pressed={item.id === template?.id} className={item.id === template?.id ? 'active' : ''} onClick={() => selectTemplate(item)}><span className="template-list-category">{item.category} · {item.roles.length} 个角色位</span><strong>{item.name}</strong><p>{item.description}</p><span className="template-list-count"><BookOpen size={12} />{item.beats.length} 个{scope === 'chapter' ? '节拍' : '阶段'}<ArrowRight size={13} /></span></button>)}{!visible.length && <p className="empty-list">没有匹配的模板，试试其他关键词。</p>}</div></aside>
        {template && preview ? <div className="template-detail" key={template.id}>
          <div className="template-detail-title"><span>{templateScopes[template.scope].label} · {template.category}</span><h3>{template.name}</h3><p>{template.description}</p></div>
          <section className="template-roles"><h4><Users size={15} />角色占位 <small>可先填名字，也可以插入后编辑</small></h4><div className="template-role-grid">{template.roles.map((role) => <label key={role.id}><span>{role.name}</span><input aria-label={`角色名称：${role.name}`} maxLength={60} placeholder={`${role.name}（待命名）`} value={names[role.id] || ''} onChange={(event) => setNames((previous) => ({ ...previous, [role.id]: event.target.value }))} /><small>{role.description}</small></label>)}</div></section>
          <section className="template-relationships"><h4><Users size={15} />人物关系 <small>也会生成画布连线</small></h4>{template.relationships.map((relation, index) => <p key={index}><strong>{names[relation.source]?.trim() || template.roles.find((role) => role.id === relation.source)?.name}</strong><ArrowRight size={12} /><strong>{names[relation.target]?.trim() || template.roles.find((role) => role.id === relation.target)?.name}</strong><span>{relation.label}</span></p>)}</section>
          <section className="template-beats"><h4><GitBranch size={15} />{scope === 'chapter' ? '对话 / 动作节拍' : '事件流程'} <small>{scope === 'chapter' ? '同一场景内，每个节拍一张卡' : '插入后每个阶段是一张情节卡'}</small></h4><ol>{preview.nodes.filter((node) => node.data.kind === 'plot').map((node, index) => <li key={node.id}><span className="template-step-number">{index + 1}</span><div><h5>{template.beats[index].title}</h5><p>{node.data.content}</p><span className="template-participants">参与：{template.beats[index].participants.map((roleId) => names[roleId]?.trim() || template.roles.find((role) => role.id === roleId)?.name).join('、')}</span></div></li>)}</ol></section>
          <section className="template-variation"><h4>变体与取舍</h4><p>{template.twist}</p></section>
        </div> : <div className="template-detail template-no-results"><Search size={26} /><h3>没有匹配的{templateScopes[scope].label}</h3><p>换个关键词或类型，也可以切换作用范围。</p></div>}
      </div>
      <footer className="template-library-footer"><div><strong>{preview ? `${preview.nodes.length} 张卡片 · ${preview.edges.length} 条关系` : '请选择一个模板'}</strong><span>{!preview ? '无匹配结果，暂不可插入。' : canInsert ? '追加到现有画布，保留原内容；支持一次撤销。' : '当前画布容量不足，请先减少元素或关系。'}</span></div><button className="primary-button" disabled={!canInsert} onClick={() => { if (preview) onInsert(preview); }}><Plus size={16} />插入画布</button></footer>
    </section>
  </div>;
}
