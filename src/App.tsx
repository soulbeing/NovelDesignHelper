import { useCallback, useEffect, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, MarkerType, useReactFlow, type Connection, type NodeChange, type Edge } from '@xyflow/react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, FileJson, Focus, GitBranch, LayoutGrid, LoaderCircle, Menu, Plus, Redo2, Search, Sparkles, Trash2, Undo2, Upload, X } from 'lucide-react';
import { kindInfo, kinds, toMarkdown, type Board, type Kind } from '../shared/board';
import { readDocument, serializeDocument } from '../shared/project';
import { StoryNode, kindIcons, type StoryNodeType } from './StoryNode';
import { useBoard } from './useBoard';
import ChatPanel from './ChatPanel';
import { createId } from './id';
import TemplateLibrary from './TemplateLibrary';
import { appendProposal } from '../shared/ai';
import ProjectPanel from './ProjectPanel';

const nodeTypes = { story: StoryNode };
const colors: Record<Kind, string> = { plot: '#739681', character: '#b99d76', world: '#8e9fba', note: '#bda85a' };
const connectionStyle = { stroke: '#a4b0a7', strokeWidth: 1.5 };
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [projectId, setProjectId] = useState(() => {
    try { const saved = localStorage.getItem('novel-design-helper:active-project'); return saved && /^[a-zA-Z0-9_-]{1,80}$/.test(saved) ? saved : 'legacy-board'; }
    catch { return 'legacy-board'; }
  });
  return <BoardEditor key={projectId} projectId={projectId} onSelect={(id) => {
    try { localStorage.setItem('novel-design-helper:active-project', id); } catch { /* Selection can still work without browser storage. */ }
    setProjectId(id);
  }} />;
}

function BoardEditor({ projectId, onSelect }: { projectId: string; onSelect: (id: string) => void }) {
  const { board, project, status, error, recovery, setRecovery, update, checkpoint, undo, redo, retry, canUndo, canRedo,
    flush, synchronize, restore, refreshProject, getDocument, importDocument } = useBoard(projectId);
  const flow = useReactFlow<StoryNodeType>();
  const [selected, setSelected] = useState<{ type: 'node' | 'edge'; id: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const editingNode = board?.nodes.find((node) => selected?.type === 'node' && node.id === selected.id);
  const editingEdge = board?.edges.find((edge) => selected?.type === 'edge' && edge.id === selected.id);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const removeSelected = useCallback(() => {
    if (!selected) return;
    update((previous) => ({ ...previous,
      nodes: previous.nodes.filter((node) => !(selected.type === 'node' && node.id === selected.id)),
      edges: previous.edges.filter((edge) => selected.type === 'edge' ? edge.id !== selected.id : edge.source !== selected.id && edge.target !== selected.id),
    }));
    setSelected(null);
  }, [selected, update]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (templatesOpen || projectsOpen) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
      if (event.key === 'Escape') { setSelected(null); setExportOpen(false); setHelp(false); setTemplatesOpen(false); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [undo, redo, removeSelected, templatesOpen, projectsOpen]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (status === 'saving' || status === 'offline') event.preventDefault(); };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [status]);

  const addNode = (kind: Kind) => {
    if (!board || board.nodes.length >= 1500) { setNotice('最多支持 1500 张卡片，请拆分故事板。'); return; }
    const rect = document.querySelector('.canvas')!.getBoundingClientRect();
    const position = flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 120, y: rect.top + rect.height / 2 - 90 });
    const id = createId();
    update((previous) => ({ ...previous, nodes: [...previous.nodes, { id, type: 'story', position, data: { kind, title: `新的${kindInfo[kind].label}`, content: '', act: '' } }] }));
    setSelected({ type: 'node', id });
    setChatOpen(false);
    setSidebarOpen(false);
  };
  const onNodesChange = useCallback((changes: NodeChange<StoryNodeType>[]) => {
    const positions = changes.filter((change) => change.type === 'position');
    if (!positions.length) return;
    update((previous) => ({ ...previous, nodes: previous.nodes.map((node) => {
      const change = positions.find((item) => item.id === node.id);
      return change?.position ? { ...node, position: change.position } : node;
    }) }), false);
  }, [update]);
  const insertTemplate = (fragment: Board) => {
    if (!board) return;
    try {
      const next = appendProposal(board, fragment, createId);
      const inserted = next.nodes.slice(board.nodes.length);
      update(() => next);
      setTemplatesOpen(false); setSidebarOpen(false); setChatOpen(false); setSelected(null);
      setNotice(`已插入「${fragment.title}」，点击人物与情节卡补充细节。`);
      setTimeout(() => void flow.fitView({ nodes: inserted, padding: 0.18, duration: 400 }), 100);
    } catch { setNotice('插入失败：画布容量不足或模板结构无效，当前内容已保留。'); }
  };
  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (board?.edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) { setNotice('这两张卡片已有相同方向的连线。'); return; }
    if (board && board.edges.length >= 5000) { setNotice('已达到 5000 条连线上限。'); return; }
    const id = createId();
    update((previous) => ({ ...previous, edges: [...previous.edges, { id, source: connection.source!, target: connection.target!, label: '推动' }] }));
    setSelected({ type: 'edge', id });
  };
  const importBoard = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice('文件超过 2 MB 限制。'); return; }
    try {
      const imported = readDocument(JSON.parse(await file.text()), projectId);
      if (!window.confirm('导入将替换当前故事板。可通过撤销恢复；建议先导出 JSON 备份。继续导入？')) return;
      importDocument(imported); setSelected(null); setNotice('故事板已导入');
      setTimeout(() => void flow.fitView({ padding: 0.2, duration: 350 }), 100);
    } catch { setNotice('导入失败：请选择本应用导出的有效 JSON 故事板。'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  };
  const focusNode = (node: Board['nodes'][number]) => {
    setSelected({ type: 'node', id: node.id });
    setChatOpen(false);
    setSidebarOpen(false);
    void flow.setCenter(node.position.x + 130, node.position.y + 100, { zoom: 1, duration: 400 });
  };
  const exportFile = (format: 'md' | 'json') => {
    if (!board) return;
    const name = board.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    download(`${name}.${format}`, format === 'md' ? toMarkdown(board) : serializeDocument(getDocument()!), format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json');
    setExportOpen(false); setNotice(format === 'md' ? '已导出 AI 可读的故事蓝图' : '已导出完整故事板备份');
  };

  if (!board) return <div className="loading-screen"><div className="brand-symbol"><GitBranch /></div><h1>故事织场</h1><p>{error || '正在展开你的故事……'}</p>{status === 'loading' ? <LoaderCircle className="spinning" /> : <><button className="primary-button" onClick={retry}>重新连接</button><button onClick={() => onSelect('legacy-board')}>打开原故事板</button></>}</div>;
  const visibleNodes = board.nodes.filter((node) => (filter === 'all' || node.data.kind === filter) && `${node.data.title} ${node.data.content}`.toLowerCase().includes(query.toLowerCase()));
  const displayNodes: StoryNodeType[] = board.nodes.map((node) => ({ ...node, selected: selected?.type === 'node' && selected.id === node.id }));
  const displayEdges: Edge[] = board.edges.map((edge) => ({ ...edge, type: 'smoothstep', selected: selected?.type === 'edge' && selected.id === edge.id, style: connectionStyle, markerEnd: { type: MarkerType.ArrowClosed, color: connectionStyle.stroke }, labelStyle: { fill: '#68786f', fontSize: 11 }, labelBgStyle: { fill: '#f7f7f2', fillOpacity: 0.95 }, labelBgPadding: [7, 4] }));

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-symbol"><GitBranch size={21} /></div><span>故事织场<small>STORY WEAVE</small></span></div>
      <div className="header-divider" />
      <div className="project-heading"><span className="breadcrumb">我的故事 / 故事板</span><input aria-label="故事名称" maxLength={120} value={board.title} onChange={(event) => update((previous) => ({ ...previous, title: event.target.value.trim() ? event.target.value : '未命名故事' }))} /></div>
      <div className={`save-status ${status}`} title={error || '修改后自动保存到本机服务器'}>{status === 'saved' ? <Check size={14} /> : status === 'saving' ? <LoaderCircle size={14} className="spinning" /> : <span className="status-dot" />}<span>{status === 'saved' ? '本地已保存' : status === 'saving' ? '本地保存中' : '本地未保存'}</span></div>
      <button className="project-toggle" onClick={() => setProjectsOpen(true)} title={project?.syncError || '项目、GitHub 同步与版本历史'}><GitBranch size={16} /><span>{project?.syncing ? '上传中' : project?.syncError ? '同步需处理' : project?.connected ? project.dirty || status !== 'saved' ? '等待上传' : 'GitHub 已同步' : '项目与版本'}</span></button>
      <button aria-label="AI 搭档" className={`ai-toggle ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}><Sparkles size={16} /><span>AI 搭档</span></button>
      <div className="export-wrap"><button className="primary-button" onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={16} /><span>导出故事</span><ChevronDown size={14} /></button>{exportOpen && <><button className="menu-backdrop" aria-label="关闭导出菜单" onClick={() => setExportOpen(false)} /><div className="export-menu"><button onClick={() => exportFile('md')}><Sparkles size={17} /><span>AI 写作蓝图<small>Markdown · 情节、细节与关系</small></span></button><button onClick={() => exportFile('json')}><FileJson size={17} /><span>故事板备份<small>JSON · 保留全部位置与连线</small></span></button></div></>}</div>
    </header>
    <div className="workspace">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="关闭侧栏" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="workspace-label"><span>写作工作台</span><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="关闭侧栏"><X size={18} /></button><span className="version desktop-only">V0.1</span></div>
        <button className="nav-active" onClick={() => { setSidebarOpen(false); void flow.fitView({ padding: 0.18, duration: 400 }); }}><LayoutGrid size={17} />故事画布<span>{board.nodes.length}</span></button>
        <details className="premise-editor"><summary>故事核心 <ChevronDown size={12} /></summary><textarea aria-label="故事核心" rows={3} maxLength={10000} placeholder="用一句话描述你的故事…" value={board.premise} onChange={(event) => update((previous) => ({ ...previous, premise: event.target.value }))} /></details>
        <div className="sidebar-section-title">添加到画布 <Plus size={14} /></div>
        <div className="add-list">{kinds.map((kind) => { const Icon = kindIcons[kind]; return <button key={kind} onClick={() => addNode(kind)}><span className={`kind-icon ${kind}`}><Icon size={17} /></span><span>{kindInfo[kind].label}<small>{kindInfo[kind].subtitle}</small></span><Plus size={14} className="add-plus" /></button>; })}</div>
        <button className="template-launch" onClick={() => setTemplatesOpen(true)}><BookOpen size={17} /><span>剧情模板<small>章内小节拍 · 跨章大结构</small></span><ArrowRight size={14} /></button>
        <div className="sidebar-section-title">故事元素 <span>{board.nodes.length}</span></div>
        <label className="search-field"><Search size={15} /><input aria-label="搜索故事元素" placeholder="寻找一段情节、一个人物…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="filter-tabs">{(['all', ...kinds] as const).map((kind) => <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>{kind === 'all' ? '全部' : kindInfo[kind].label}</button>)}</div>
        <div className="element-list">{visibleNodes.map((node) => <button key={node.id} className={editingNode?.id === node.id ? 'active' : ''} onClick={() => focusNode(node)}><span className="element-dot" style={{ background: colors[node.data.kind] }} /><span>{node.data.title || '未命名'}</span><ArrowRight size={12} /></button>)}{!visibleNodes.length && <p className="empty-list">还没有匹配的元素</p>}</div>
        <div className="sidebar-bottom"><div className="small-note"><Sparkles size={17} /><p>每一个好故事，<br />都从一个小小的「如果」开始。</p></div><button className="import-button" onClick={() => importInput.current?.click()}><Upload size={15} />导入故事板</button></div>
      </aside>
      <main className="canvas">
        <div className="canvas-heading"><button className="icon-button mobile-only" aria-label="打开侧栏" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div><h1>把灵感，织成故事。</h1><p>在这里，看见情节之间的联系。</p></div><span className="canvas-tag">无限画布</span></div>
        <ReactFlow<StoryNodeType> nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeDragStart={checkpoint} onNodeClick={(_event, node) => { setSelected({ type: 'node', id: node.id }); setChatOpen(false); }} onEdgeClick={(_event, edge) => { setSelected({ type: 'edge', id: edge.id }); setChatOpen(false); }} onPaneClick={() => setSelected(null)} onConnect={onConnect} fitView fitViewOptions={{ padding: 0.22 }} minZoom={0.15} maxZoom={2} deleteKeyCode={null} connectionLineStyle={connectionStyle} connectOnClick nodesConnectable panOnScroll selectionOnDrag={false} proOptions={{ hideAttribution: false }}>
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d5dbd2" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={(node) => colors[node.data.kind as Kind]} maskColor="rgba(239,241,233,.65)" pannable zoomable />
        </ReactFlow>
        {!board.nodes.length && <div className="empty-canvas"><GitBranch size={38} /><h2>给故事一个起点</h2><p>添加第一个情节，再慢慢长出它的世界。</p><button className="primary-button" onClick={() => addNode('plot')}><Plus size={16} />添加情节</button></div>}
        <div className="canvas-toolbar"><button className="tool-button" onClick={() => addNode('plot')} title="添加情节"><Plus size={19} /><span>情节</span></button><span className="tool-divider" /><button className="icon-button" aria-label="撤销" title="撤销 · Ctrl/⌘ Z" disabled={!canUndo} onClick={undo}><Undo2 size={18} /></button><button className="icon-button" aria-label="重做" title="重做 · Ctrl/⌘ Shift Z" disabled={!canRedo} onClick={redo}><Redo2 size={18} /></button><span className="tool-divider" /><button className="icon-button" aria-label="显示全部画布" title="显示全部" onClick={() => void flow.fitView({ padding: 0.2, duration: 400 })}><Focus size={19} /></button></div>
        <button className="help-button" onClick={() => setHelp(true)}>画布使用指南 <span>?</span></button>
      </main>
      {!chatOpen && selected && (editingNode || editingEdge) && <aside className="inspector">
        <div className="inspector-heading"><span>{editingNode ? '打磨故事元素' : '编辑情节关系'}</span><button className="icon-button" aria-label="关闭编辑面板" onClick={() => setSelected(null)}><X size={18} /></button></div>
        {editingNode ? <><span className={`inspector-kind ${editingNode.data.kind}`}>{kindInfo[editingNode.data.kind].label}</span><label>标题<input autoFocus maxLength={200} value={editingNode.data.title} onChange={(event) => update((previous) => ({ ...previous, nodes: previous.nodes.map((node) => node.id === editingNode.id ? { ...node, data: { ...node.data, title: event.target.value } } : node) }))} /></label><label>类型<select value={editingNode.data.kind} onChange={(event) => update((previous) => ({ ...previous, nodes: previous.nodes.map((node) => node.id === editingNode.id ? { ...node, data: { ...node.data, kind: event.target.value as Kind } } : node) }))}>{kinds.map((kind) => <option key={kind} value={kind}>{kindInfo[kind].label}</option>)}</select></label><label>阶段 / 身份<input maxLength={100} placeholder="如：第二幕、主角、世界规则" value={editingNode.data.act} onChange={(event) => update((previous) => ({ ...previous, nodes: previous.nodes.map((node) => node.id === editingNode.id ? { ...node, data: { ...node.data, act: event.target.value } } : node) }))} /></label><label className="content-label">内容<textarea maxLength={20000} rows={10} placeholder={kindInfo[editingNode.data.kind].placeholder} value={editingNode.data.content} onChange={(event) => update((previous) => ({ ...previous, nodes: previous.nodes.map((node) => node.id === editingNode.id ? { ...node, data: { ...node.data, content: event.target.value } } : node) }))} /></label><p className="inspector-tip">写下动机、冲突和结果。细节越清楚，AI 越能理解你的故事。</p></> : editingEdge && <><div className="relation-preview"><span>{board.nodes.find((node) => node.id === editingEdge.source)?.data.title}</span><ArrowDownToLine size={18} /><span>{board.nodes.find((node) => node.id === editingEdge.target)?.data.title}</span></div><label>关系说明<input maxLength={200} placeholder="如：导致、伏笔、支线、人物关系" value={editingEdge.label || ''} onChange={(event) => update((previous) => ({ ...previous, edges: previous.edges.map((edge) => edge.id === editingEdge.id ? { ...edge, label: event.target.value } : edge) }))} /></label><p className="inspector-tip">箭头从起点指向终点，关系说明会随故事一起导出。</p></>}
        <button className="delete-button" onClick={removeSelected}><Trash2 size={15} />删除{editingNode ? '元素' : '关系'}</button>
      </aside>}
      <div className={`chat-container ${chatOpen ? 'open' : ''}`}><ChatPanel board={board} onClose={() => setChatOpen(false)} onApply={(next) => { update(() => next); setSelected(null); setNotice('AI 结构已加入故事板，可继续编辑或撤销。'); setTimeout(() => void flow.fitView({ padding: 0.2, duration: 400 }), 150); }} /></div>
    </div>
    <footer className="statusbar"><span><span className="status-dot" />{board.nodes.filter((node) => node.data.kind === 'plot').length} 个情节 · {board.nodes.filter((node) => node.data.kind === 'character').length} 位人物 · {board.edges.length} 条关系</span><span>拖动画布移动视野 · 滚轮缩放 · 点击卡片编辑</span><span>让故事有迹可循</span></footer>
    {error && <div className="error-banner"><span>{error}</span><button onClick={retry}>重试</button></div>}
    {recovery && <div className="recovery-banner"><span>发现本机尚未保存到服务器的草稿。</span><button onClick={() => { importDocument(recovery); setRecovery(null); setNotice('已恢复本机草稿，可撤销回到服务器版本。'); }}>恢复草稿</button><button onClick={() => { download('本机未同步草稿.json', serializeDocument(recovery), 'application/json'); }}>下载备份</button><button aria-label="暂时忽略草稿" onClick={() => setRecovery(null)}><X size={15} /></button></div>}
    {notice && <div role="status" className="toast"><Check size={17} />{notice}</div>}
    <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(event) => void importBoard(event.target.files?.[0])} />
    {templatesOpen && <TemplateLibrary board={board} onClose={() => setTemplatesOpen(false)} onInsert={insertTemplate} />}
    {projectsOpen && <ProjectPanel project={project} projectId={projectId} flush={flush} refresh={refreshProject} sync={synchronize} restore={restore} onSelect={(id) => { setProjectsOpen(false); onSelect(id); }} onClose={() => setProjectsOpen(false)} />}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="画布使用指南" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭指南" onClick={() => setHelp(false)}><X size={18} /></button><GitBranch size={28} /><h2>从一个念头，到一整个故事</h2><p>① 从左侧添加情节、人物、设定或备注。</p><p>② 拖动卡片安排结构，点击卡片编辑细节。</p><p>③ 从右侧圆点拖到另一张卡片的左侧圆点建立关系。触摸屏也可以依次点击两个圆点。</p><p>④ 点击连线写下因果、伏笔或人物关系。</p><p>⑤ 导出 Markdown，将故事蓝图交给 AI。导出 JSON 用于备份或迁移。</p><p>手机和 iPad：单指拖动画布，双指缩放；点左上角菜单添加元素。建议 iPad 横屏创作。</p><button className="primary-button" onClick={() => setHelp(false)}>开始编织 <ArrowRight size={16} /></button></section></div>}
  </div>;
}
