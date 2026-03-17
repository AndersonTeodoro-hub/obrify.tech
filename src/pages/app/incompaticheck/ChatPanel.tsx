import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { MessageSquare, Mic, Send, X, Loader2, HardHat, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Finding, ChatMessage } from './types';
import { renderMarkdown } from './helpers';

const AgentPanel = lazy(() => import('./AgentPanel'));

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  findings: Finding[];
  obraName?: string;
  chatMessages: ChatMessage[];
  agentThinking: boolean;
  sendUserMessage: (content: string) => Promise<string | undefined>;
}

type TabType = 'chat' | 'voice';

const QUICK_PROMPTS = [
  { label: '📏 Cotas', prompt: 'Verifica as cotas dos projetos e identifica divergências' },
  { label: '💥 Colisões', prompt: 'Quais são as colisões entre redes e estrutura?' },
  { label: '📋 Relatório', prompt: 'Prepara um resumo do relatório técnico' },
  { label: '📐 Normas', prompt: 'Quais normas portuguesas se aplicam?' },
  { label: '🧱 Materiais', prompt: 'Analisa os materiais especificados' },
  { label: '📊 Resumo', prompt: 'Faz um resumo da análise de incompatibilidades' },
];

export default function ChatPanel({
  isOpen,
  onClose,
  findings,
  obraName,
  chatMessages,
  agentThinking,
  sendUserMessage,
}: ChatPanelProps) {
  const [tab, setTab] = useState<TabType>('chat');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && tab === 'chat') {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [chatMessages.length, isOpen, tab]);

  // Focus input when opening chat tab
  useEffect(() => {
    if (isOpen && tab === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, tab]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      await sendUserMessage(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, sendUserMessage]);

  const handleQuickPrompt = useCallback(async (prompt: string) => {
    if (sending) return;
    setSending(true);
    try {
      await sendUserMessage(prompt);
    } finally {
      setSending(false);
    }
  }, [sending, sendUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] z-50 flex flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <HardHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Engº Marcos</p>
            <p className="text-[10px] text-muted-foreground">Engenheiro Sénior · Fiscalização</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'chat'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setTab('voice')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'voice'
              ? 'text-orange-500 border-b-2 border-orange-500 bg-orange-500/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Voz
        </button>
      </div>

      {/* Content */}
      {tab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Welcome message if no messages */}
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 flex items-center justify-center">
                  <HardHat className="w-7 h-7 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Olá, sou o Eng. Marcos</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                    Posso ajudar com análise de incompatibilidades, cotas, normas portuguesas e materiais.
                    {obraName && <span className="block mt-1 text-primary">Obra: {obraName}</span>}
                  </p>
                </div>

                {/* Quick prompts */}
                <div className="grid grid-cols-2 gap-1.5 w-full max-w-[300px]">
                  {QUICK_PROMPTS.map(qp => (
                    <button
                      key={qp.label}
                      onClick={() => handleQuickPrompt(qp.prompt)}
                      disabled={sending}
                      className="px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-[11px] font-medium text-muted-foreground hover:text-foreground text-left disabled:opacity-50"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {chatMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'agent' ? (
                    <div
                      className="prose prose-xs max-w-none [&_strong]:font-semibold [&_br]:mb-1"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    msg.content
                  )}
                  <p className={`text-[9px] mt-1.5 ${
                    msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                  }`}>
                    {new Date(msg.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {(agentThinking || sending) && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">A analisar...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts bar (show after first message) */}
          {chatMessages.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/20 flex gap-1.5 overflow-x-auto scrollbar-hide">
              {QUICK_PROMPTS.slice(0, 4).map(qp => (
                <button
                  key={qp.label}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  disabled={sending}
                  className="px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted transition-colors text-[10px] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="p-3 border-t border-border bg-background">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre a obra..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[38px] max-h-[100px]"
                style={{ height: 'auto' }}
                onInput={e => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
                }}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="h-[38px] w-[38px] rounded-lg flex-shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Voice tab */
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          }>
            <AgentPanel findings={findings} obraName={obraName} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/* ========== FAB Button (Floating Action Button) ========== */
export function ChatFAB({ onClick, hasMessages }: { onClick: () => void; hasMessages?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30 hover:scale-105 transition-all flex items-center justify-center group"
      aria-label="Abrir chat do Engº Marcos"
    >
      <HardHat className="w-6 h-6 group-hover:scale-110 transition-transform" />
      {hasMessages && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold flex items-center justify-center text-primary-foreground">
          !
        </span>
      )}
    </button>
  );
}
