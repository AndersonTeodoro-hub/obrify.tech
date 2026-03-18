import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Mic, Send, X, Loader2, Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'react-router-dom';
import { useEngSilvaContext } from '@/hooks/use-eng-silva-context';

interface EngSilvaPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVoiceCall: () => void;
  /** Legacy prop — context now comes from useEngSilvaContext */
  incompaticheckContext?: any;
}

interface LocalMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

const QUICK_PROMPTS_INCOMPATICHECK = [
  { label: '📏 Cotas', prompt: 'Verifica as cotas dos projetos e identifica divergências' },
  { label: '💥 Colisões', prompt: 'Quais são as colisões entre redes e estrutura?' },
  { label: '📝 PDE', prompt: 'O que achas do último parecer PDE? Concordas com o veredito?' },
  { label: '📐 Normas', prompt: 'Quais normas portuguesas se aplicam a esta obra?' },
  { label: '🧱 Materiais', prompt: 'Analisa os materiais especificados nos projetos' },
  { label: '📊 Resumo', prompt: 'Faz um resumo completo da análise de incompatibilidades e dos pareceres PDE' },
];

const QUICK_PROMPTS_GENERAL = [
  { label: '📐 Normas PT', prompt: 'Quais são as principais normas e eurocódigos aplicáveis em Portugal?' },
  { label: '🏗️ Fiscalização', prompt: 'Quais são os pontos críticos de uma fiscalização de obra?' },
  { label: '📝 Relatório', prompt: 'Ajuda-me a estruturar um relatório de fiscalização' },
  { label: '🧱 Materiais', prompt: 'Quais ensaios de betão são obrigatórios em obra?' },
  { label: '⚠️ NCs', prompt: 'Como classificar uma não-conformidade em obra?' },
  { label: '📋 Checklist', prompt: 'Que itens verificar numa inspeção de estrutura de betão?' },
];

/** Build a rich context string from IncompatiCheck data for the agent */
function buildObraContext(ctx: NonNullable<ReturnType<typeof useEngSilvaContext>['context']>): string {
  const parts: string[] = [];

  if (ctx.obraName) parts.push(`Obra actual: "${ctx.obraName}".`);

  // Projects
  if (ctx.projects && ctx.projects.length > 0) {
    parts.push(`Projectos carregados (${ctx.projects.length}): ${ctx.projects.map(p => `${p.name} (${p.type})`).join(', ')}.`);
  }

  // Findings
  if (ctx.findings && ctx.findings.length > 0) {
    parts.push(`\nIncompatibilidades detectadas (${ctx.findings.length}):`);
    for (const f of ctx.findings) {
      const sev = f.severity === 'critical' ? 'CRÍTICA' : f.severity === 'warning' ? 'ALERTA' : 'INFO';
      parts.push(`- [${sev}] ${f.title}: ${f.description}${f.location ? ` (Local: ${f.location})` : ''}`);
    }
  }

  // PDE Analyses
  if (ctx.pdeAnalyses && ctx.pdeAnalyses.length > 0) {
    parts.push(`\nPareceres PDE (${ctx.pdeAnalyses.length}):`);
    for (const pde of ctx.pdeAnalyses) {
      const verdict = pde.verdict === 'approved' ? 'APROVADO' : pde.verdict === 'approved_with_reservations' ? 'APROVADO COM RESERVAS' : pde.verdict === 'rejected' ? 'REJEITADO' : 'PENDENTE';
      parts.push(`\n--- PARECER: ${verdict} ---`);
      if (pde.ai_analysis?.summary) parts.push(`Resumo: ${pde.ai_analysis.summary}`);

      if (pde.ai_analysis?.findings_addressed?.length) {
        parts.push('Incompatibilidades abordadas:');
        for (const fa of pde.ai_analysis.findings_addressed) {
          parts.push(`  ${fa.resolved ? '✓' : '✗'} ${fa.finding_title}: ${fa.comment}`);
        }
      }

      if (pde.ai_analysis?.new_issues?.length) {
        parts.push('Novos problemas:');
        for (const ni of pde.ai_analysis.new_issues) {
          parts.push(`  [${ni.severity.toUpperCase()}] ${ni.title}: ${ni.description}`);
        }
      }

      if (pde.ai_analysis?.technical_notes?.length) {
        parts.push('Notas técnicas: ' + pde.ai_analysis.technical_notes.join(' | '));
      }

      if (pde.ai_analysis?.recommendation) {
        parts.push(`Recomendação: ${pde.ai_analysis.recommendation}`);
      }
    }
  }

  return parts.join('\n');
}

export function EngSilvaPanel({
  isOpen,
  onClose,
  onStartVoiceCall,
}: EngSilvaPanelProps) {
  const { user } = useAuth();
  const location = useLocation();
  const { context: silvaContext } = useEngSilvaContext();
  const isIncompatiCheck = location.pathname.includes('/incompaticheck');
  const hasContext = isIncompatiCheck && silvaContext;

  // General chat state (used outside IncompatiCheck)
  const [generalMessages, setGeneralMessages] = useState<LocalMessage[]>([]);
  const [generalThinking, setGeneralThinking] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Determine which messages to display
  const messages: LocalMessage[] = hasContext
    ? silvaContext.chatMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }))
    : generalMessages;

  const isThinking = hasContext ? silvaContext.agentThinking : generalThinking;
  const quickPrompts = isIncompatiCheck ? QUICK_PROMPTS_INCOMPATICHECK : QUICK_PROMPTS_GENERAL;

  const getPageLabel = () => {
    if (isIncompatiCheck) return silvaContext?.obraName || 'IncompatiCheck';
    if (location.pathname.includes('/captures')) return 'Capturas';
    if (location.pathname.includes('/inspections')) return 'Fiscalizações';
    if (location.pathname.includes('/non-conformities')) return 'Não-Conformidades';
    if (location.pathname.includes('/reports')) return 'Relatórios';
    if (location.pathname.includes('/material-approvals')) return 'Aprovação de Materiais';
    return 'Obrify';
  };

  // Auto-scroll
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages.length, isOpen]);

  // Focus input
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // General chat send (outside IncompatiCheck or when IncompatiCheck context is available)
  const sendGeneralMessage = useCallback(async (content: string) => {
    const userMsg: LocalMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setGeneralMessages(prev => [...prev, userMsg]);
    setGeneralThinking(true);

    try {
      const recentMessages = generalMessages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
      recentMessages.push({ role: 'user', content });

      const { data, error } = await supabase.functions.invoke('incompaticheck-agent', {
        body: {
          messages: recentMessages,
          findings: [],
          obraName: undefined,
          pageContext: getPageLabel(),
        },
      });

      const reply = data?.reply || data?.error || 'Desculpe, não consegui processar. Tente novamente.';
      const agentMsg: LocalMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: reply,
        timestamp: new Date().toISOString(),
      };
      setGeneralMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      const errMsg: LocalMessage = {
        id: `err-${Date.now()}`,
        role: 'agent',
        content: 'Erro de comunicação. Tente novamente.',
        timestamp: new Date().toISOString(),
      };
      setGeneralMessages(prev => [...prev, errMsg]);
    } finally {
      setGeneralThinking(false);
    }
  }, [generalMessages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      if (hasContext && silvaContext.sendUserMessage) {
        await silvaContext.sendUserMessage(text);
      } else {
        await sendGeneralMessage(text);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, hasContext, silvaContext, sendGeneralMessage]);

  const handleQuickPrompt = useCallback(async (prompt: string) => {
    if (sending) return;
    setSending(true);
    try {
      if (hasContext && silvaContext.sendUserMessage) {
        await silvaContext.sendUserMessage(prompt);
      } else {
        await sendGeneralMessage(prompt);
      }
    } finally {
      setSending(false);
    }
  }, [sending, hasContext, silvaContext, sendGeneralMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] z-50 flex flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ background: 'rgba(212,168,73,0.05)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #D4A849, #C4933A)' }}>
            🔬
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Eng. Silva</p>
            <p className="text-[10px] text-muted-foreground">
              {getPageLabel()}
              {hasContext && silvaContext.findings && silvaContext.findings.length > 0 && (
                <span className="ml-1 text-primary">· {silvaContext.findings.length} findings</span>
              )}
              {hasContext && silvaContext.pdeAnalyses && silvaContext.pdeAnalyses.length > 0 && (
                <span className="ml-1 text-amber-500">· {silvaContext.pdeAnalyses.length} PDE</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { onClose(); onStartVoiceCall(); }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Ligar por voz"
          >
            <Phone className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {/* Welcome */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
              style={{ background: 'rgba(212,168,73,0.1)', border: '2px solid rgba(212,168,73,0.2)' }}>
              🔬
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Eng. Silva</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                {hasContext
                  ? `Estou a par da obra "${silvaContext.obraName}". Conheço as ${silvaContext.findings?.length || 0} incompatibilidades detectadas e ${silvaContext.pdeAnalyses?.length || 0} parecer(es) PDE. Pergunte-me o que quiser.`
                  : 'Engenheiro civil sénior com experiência em fiscalização de obras em Portugal. Posso ajudar com normas, incompatibilidades, materiais e pareceres técnicos.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[300px]">
              {quickPrompts.map(qp => (
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

        {/* Messages */}
        {messages.map(msg => (
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
                  dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                />
              ) : (
                msg.content
              )}
              <p className={`text-[9px] mt-1.5 ${
                msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
              }`}>
                {new Date(msg.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Thinking */}
        {(isThinking || sending) && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#D4A849', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#D4A849', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#D4A849', animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-muted-foreground">A analisar...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts bar */}
      {messages.length > 0 && (
        <div className="px-3 py-2 border-t border-border bg-muted/20 flex gap-1.5 overflow-x-auto">
          {quickPrompts.slice(0, 4).map(qp => (
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

      {/* Input */}
      <div className="p-3 border-t border-border bg-background">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte ao Eng. Silva..."
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
  );
}
