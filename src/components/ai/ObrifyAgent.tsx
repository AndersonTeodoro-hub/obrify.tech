import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Send, X, Mic, MicOff, Bot, History, Volume2, VolumeX, GraduationCap, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAgentConversation } from '@/hooks/use-agent-conversation';
import { useAgentVoice } from '@/hooks/use-agent-voice';
import { AgentHistoryTab } from './AgentHistoryTab';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  suggestions?: string[];
  timestamp: number;
}

const INITIAL_MESSAGE: Message = {
  id: 'welcome',
  role: 'agent',
  content:
    'Olá! Sou o Obrify, o teu assistente de fiscalização. Posso ajudar-te a consultar obras, ver não-conformidades, gerar relatórios e muito mais. O que precisas?',
  suggestions: ['Ver NCs abertas', 'Resumo das obras', 'Gerar relatório'],
  timestamp: Date.now(),
};

export function ObrifyAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBadge, setShowBadge] = useState(() => !localStorage.getItem('obrify_agent_seen'));
  const [activeTab, setActiveTab] = useState('chat');
  const [viewingHistoryConv, setViewingHistoryConv] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('obrify_voice') === 'true');
  const [expertMode, setExpertMode] = useState(() => localStorage.getItem('obrify_expert') === 'true');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();

  const {
    conversationId,
    conversations,
    loadingHistory,
    ensureConversation,
    resetConversation,
    setTitle,
    loadConversations,
    loadMessages,
    userId,
  } = useAgentConversation();

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const convId = conversationId || (await ensureConversation());

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      if (convId && messages.filter((m) => m.role === 'user').length === 0) {
        setTitle(convId, text.trim());
      }

      try {
        const context = {
          page: location.pathname,
          siteId: params.siteId || null,
          filters: {},
        };

        const { data, error } = await supabase.functions.invoke('ai-obrify-agent', {
          body: { message: text.trim(), context, conversationId: convId, userId, expertMode },
        });

        if (error) throw error;

        if (data?.actions) {
          for (const action of data.actions) {
            const navTo = action?.result?.navigateTo;
            if (navTo) {
              navigate(navTo);
              toast({ title: 'Navegação', description: `A navegar para ${navTo}` });
            }
          }
        }

        const agentMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: data?.response || data?.error || 'Desculpa, não consegui processar o pedido.',
          suggestions: data?.suggestions,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, agentMsg]);

        // TTS playback
        if (voiceEnabled && agentMsg.content) {
          playTTS(agentMsg.content);
        }
      } catch (e: any) {
        console.error('ObrifyAgent error:', e);
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: e?.message?.includes('429')
            ? 'Demasiados pedidos. Tenta novamente em breve.'
            : e?.message?.includes('402')
              ? 'Créditos esgotados.'
              : 'Ocorreu um erro. Tenta novamente.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading, location.pathname, params.siteId, navigate, conversationId, ensureConversation, setTitle, messages, userId, expertMode, voiceEnabled]
  );

  const { voiceState, partialTranscript, startRecording, stopRecording, playTTS, stopAudio } = useAgentVoice({
    onTranscript: sendMessage,
    voiceEnabled,
  });

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Show partial transcript in input
  useEffect(() => {
    if (partialTranscript && voiceState === 'recording') {
      setInput(partialTranscript);
    }
  }, [partialTranscript, voiceState]);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    setShowBadge(false);
    localStorage.setItem('obrify_agent_seen', 'true');
    setActiveTab('chat');
    setViewingHistoryConv(null);
    await ensureConversation();
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [ensureConversation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleClear = async () => {
    await resetConversation();
    setMessages([INITIAL_MESSAGE]);
    setViewingHistoryConv(null);
  };

  const handleSelectConversation = async (convId: string) => {
    setViewingHistoryConv(convId);
    const dbMessages = await loadMessages(convId);
    const mapped: Message[] = dbMessages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'agent',
      content: m.content,
      timestamp: new Date(m.created_at).getTime(),
    }));
    setMessages(mapped.length > 0 ? mapped : [INITIAL_MESSAGE]);
    setActiveTab('chat');
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem('obrify_voice', String(next));
    if (!next) stopAudio();
  };

  const toggleExpert = () => {
    const next = !expertMode;
    setExpertMode(next);
    localStorage.setItem('obrify_expert', String(next));
  };

  const isViewingHistory = viewingHistoryConv !== null && viewingHistoryConv !== conversationId;
  const isRecording = voiceState === 'recording';
  const isSpeaking = voiceState === 'speaking';

  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
          aria-label="Abrir Obrify Agent"
        >
          <Sparkles className="h-6 w-6" />
          {showBadge && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-white animate-pulse" />
          )}
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0 [&>button]:hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-accent-500/10 to-accent-600/5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent-600" />
              <SheetTitle className="text-base font-semibold">
                Obrify Agent
              </SheetTitle>
              {expertMode && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-amber-500 text-amber-600 dark:text-amber-400">
                  Eng. Silva
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleExpert}
                className={`h-8 w-8 ${expertMode ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                title="Modo Eng. Silva"
              >
                <GraduationCap className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleVoice}
                className={`h-8 w-8 ${voiceEnabled ? 'text-accent-600' : 'text-muted-foreground'}`}
                title={voiceEnabled ? 'Desligar voz' : 'Ligar voz'}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground h-8 px-2">
                Limpar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-2 grid grid-cols-2">
              <TabsTrigger value="chat" className="text-xs gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Chat
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0">
              {isViewingHistory && (
                <div className="px-4 py-2 border-b bg-muted/50">
                  <button
                    onClick={() => {
                      setViewingHistoryConv(null);
                      setMessages([INITIAL_MESSAGE]);
                    }}
                    className="text-xs text-accent-600 hover:underline"
                  >
                    ← Voltar à conversa actual
                  </button>
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as any}>
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted text-foreground rounded-bl-sm'
                        }`}
                      >
                        {msg.role === 'agent' && expertMode && (
                          <div className="flex items-center gap-1 mb-1">
                            <GraduationCap className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Eng. Silva</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}

                  {!loading && !isViewingHistory && messages.length > 0 && messages[messages.length - 1].role === 'agent' && messages[messages.length - 1].suggestions?.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {messages[messages.length - 1].suggestions!.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="text-xs px-3 py-1.5 rounded-full border border-accent-300 text-accent-700 dark:border-accent-700 dark:text-accent-300 hover:bg-accent-50 dark:hover:bg-accent-900/30 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground">
                        <span className="inline-flex gap-1">
                          A pensar
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Speaking indicator */}
              {isSpeaking && (
                <div className="flex items-center justify-between px-4 py-2 border-t bg-accent-50 dark:bg-accent-900/20">
                  <div className="flex items-center gap-2 text-xs text-accent-700 dark:text-accent-300">
                    <div className="flex gap-0.5">
                      <span className="w-1 h-3 bg-accent-500 rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-accent-500 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                      <span className="w-1 h-2 bg-accent-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                      <span className="w-1 h-5 bg-accent-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                    A falar...
                  </div>
                  <Button variant="ghost" size="icon" onClick={stopAudio} className="h-7 w-7">
                    <Square className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Input */}
              {!isViewingHistory && (
                <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t bg-background">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={startRecording}
                    disabled={loading || voiceState === 'processing'}
                    className={`shrink-0 h-9 w-9 ${isRecording ? 'text-red-500 ring-2 ring-red-500/30 animate-pulse' : 'text-muted-foreground'}`}
                    title={isRecording ? 'Parar gravação' : 'Gravar voz'}
                  >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isRecording ? 'A ouvir...' : 'Escreve a tua pergunta...'}
                    disabled={loading}
                    className="flex-1 h-9 px-3 text-sm bg-muted rounded-lg border-0 outline-none focus:ring-2 focus:ring-accent-500/30 placeholder:text-muted-foreground disabled:opacity-50"
                  />
                  <Button type="submit" size="icon" variant="accent" disabled={!input.trim() || loading} className="shrink-0 h-9 w-9">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 flex flex-col min-h-0 mt-0">
              <AgentHistoryTab
                conversations={conversations}
                loadingHistory={loadingHistory}
                onLoadConversations={loadConversations}
                onSelectConversation={handleSelectConversation}
                activeConversationId={conversationId}
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
