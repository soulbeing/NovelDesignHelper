import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, GitBranch, KeyRound, LoaderCircle, MessageCircle, Plus, Send, Settings2, Sparkles, Square, X } from 'lucide-react';
import { aiOutputSchema, appendProposal, proposalToBoard, type AIOutput, type ChatMessage } from '../shared/ai';
import { kindInfo, type Board } from '../shared/board';
import { createId } from './id';

type Message = ChatMessage & { id: string; proposal?: AIOutput['proposal']; applied?: boolean };
export default function ChatPanel({ board, onApply, onClose }: { board: Board; onApply: (next: Board) => void; onClose: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-5-mini');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'generate'>('chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const messageArea = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { messageArea.current?.scrollTo({ top: messageArea.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  const send = async () => {
    if (!input.trim() || busy) return;
    if (!apiKey.trim() || !model.trim()) { setSettingsOpen(true); setError('先填入自己的 OpenAI API Key 和模型名称。'); return; }
    const userMessage: Message = { role: 'user', content: input.trim(), id: createId() };
    const next = [...messages, userMessage];
    setMessages(next); setInput(''); setError(''); setBusy(true);
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal, body: JSON.stringify({ apiKey: apiKey.trim(), model: model.trim(), mode, board, messages: next.slice(-24).map(({ role, content }) => ({ role, content })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '请求失败');
      const output = aiOutputSchema.parse(result);
      setMessages((previous) => [...previous, { role: 'assistant', content: output.reply, proposal: output.proposal, id: createId() }]);
    } catch (failure) {
      setInput(userMessage.content);
      setMessages((previous) => previous.filter((message) => message.id !== userMessage.id));
      setError(request.signal.aborted ? '已停止生成。' : failure instanceof Error ? failure.message : '连接失败，请重试。');
    } finally { setBusy(false); controller.current = null; }
  };
  const apply = (message: Message, append: boolean) => {
    if (!message.proposal) return;
    try {
      const generated = proposalToBoard(message.proposal);
      if (!append && !window.confirm('用此提案替换整个故事板？应用后可以撤销。')) return;
      onApply(append ? appendProposal(board, generated, createId) : generated);
      setMessages((previous) => previous.map((item) => item.id === message.id ? { ...item, applied: true } : item));
      setError('');
    } catch { setError('提案无法应用：结构无效或超过故事板容量。当前故事板已保留。'); }
  };
  return <aside className="chat-panel">
    <div className="chat-header"><span><Sparkles size={18} />故事搭档<small>AI</small></span><div><button className="icon-button" aria-label="API 设置" onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /></button><button className="icon-button" aria-label="关闭 AI 面板" onClick={onClose}><X size={18} /></button></div></div>
    {settingsOpen && <div className="chat-settings"><label><KeyRound size={13} />OpenAI API Key<input aria-label="OpenAI API Key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label><label>模型<input aria-label="OpenAI 模型" spellCheck={false} value={model} onChange={(event) => setModel(event.target.value)} /></label><p>Key 仅保存在本页面内存，刷新后清除。通过当前 Node 服务器调用 OpenAI；聊天与当前故事板将发送给 OpenAI，按 API 用量计费。</p><button disabled={!apiKey.trim()} onClick={() => setSettingsOpen(false)}><Check size={14} />完成设置</button></div>}
    <div className="chat-context"><span className="status-dot" />已关联「{board.title}」· {board.nodes.length} 个元素</div>
    <div className="chat-messages" ref={messageArea}>
      {!messages.length && <div className="chat-welcome"><div><Sparkles size={25} /></div><h2>一起想一想，故事的下一步。</h2><p>我可以帮你推敲人物、检查因果，<br />或把一个念头展开成可编辑的结构。</p><button onClick={() => { setInput('请检查当前故事的情节因果，找出三处最值得深化的冲突。'); setMode('chat'); }}><MessageCircle size={14} />帮我梳理情节因果<ArrowRight size={13} /></button><button onClick={() => { setInput('根据当前故事，设计一条围绕主角秘密的支线，生成 5 个情节节点和相关人物。'); setMode('generate'); }}><GitBranchIcon />为主角生成一条支线<ArrowRight size={13} /></button><button onClick={() => { setInput('请基于当前故事设计完整的三幕结构，生成情节、人物与伏笔关系。'); setMode('generate'); }}><Sparkles size={14} />生成三幕故事结构<ArrowRight size={13} /></button></div>}
      {messages.map((message) => <div key={message.id} className={`chat-message ${message.role}`}><span className="message-role">{message.role === 'user' ? '你' : '故事搭档'}</span><div className="message-content">{message.content}</div>{message.proposal && <section className="proposal-card"><div className="proposal-title"><Sparkles size={15} /><strong>{message.proposal.title}</strong></div><p>{message.proposal.nodes.length} 个元素 · {message.proposal.edges.length} 条关系</p><details><summary>预览生成结构 <ChevronDown size={13} /></summary><p className="proposal-premise">{message.proposal.premise}</p>{message.proposal.nodes.map((node) => <div key={node.id} className="proposal-node"><span>{kindInfo[node.kind].label}</span><strong>{node.title}</strong><p>{node.content}</p></div>)}{message.proposal.edges.map((edge, index) => <div className="proposal-edge" key={index}>{message.proposal!.nodes.find((node) => node.id === edge.source)?.title} → {message.proposal!.nodes.find((node) => node.id === edge.target)?.title}：{edge.label}</div>)}</details><div className="proposal-actions"><button disabled={message.applied} className="primary-button" onClick={() => apply(message, true)}>{message.applied ? <Check size={14} /> : <Plus size={14} />}{message.applied ? '已应用' : '添加到画布'}</button><button disabled={message.applied} onClick={() => apply(message, false)}>替换整个故事板</button></div></section>}</div>)}
      {busy && <div className="chat-thinking"><LoaderCircle size={15} className="spinning" />{mode === 'generate' ? '正在编织故事结构…' : '正在思考你的故事…'}</div>}
    </div>
    {error && <div className="chat-error" role="alert">{error}</div>}
    <div className="chat-composer"><div className="chat-modes"><button className={mode === 'chat' ? 'active' : ''} disabled={busy} onClick={() => setMode('chat')}><MessageCircle size={13} />讨论故事</button><button className={mode === 'generate' ? 'active' : ''} disabled={busy} onClick={() => setMode('generate')}><Sparkles size={13} />生成结构</button></div><textarea aria-label="给 AI 的消息" placeholder={mode === 'generate' ? '描述你想生成的情节结构…' : '聊聊你的人物、冲突，或一个新想法…'} value={input} disabled={busy} maxLength={30000} onChange={(event) => setInput(event.target.value)} rows={3} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><div className="composer-footer"><span>Ctrl / ⌘ Enter 发送</span>{busy ? <button className="send-button" aria-label="停止生成" onClick={() => controller.current?.abort()}><Square size={15} /></button> : <button className="send-button" aria-label="发送消息" disabled={!input.trim()} onClick={() => void send()}><Send size={16} /></button>}</div></div>
  </aside>;
}
function GitBranchIcon() { return <GitBranch size={14} />; }
