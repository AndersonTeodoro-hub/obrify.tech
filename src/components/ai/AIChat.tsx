 import { useState, useRef, useEffect } from 'react';
 import { useTranslation } from 'react-i18next';
 import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Textarea } from '@/components/ui/textarea';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Card } from '@/components/ui/card';
 import { cn } from '@/lib/utils';
 
 interface Message {
   role: 'user' | 'assistant';
   content: string;
 }
 
 interface AIChatProps {
   siteId?: string;
   onMissionCreated?: (missionId: string) => void;
   className?: string;
 }
 
 const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-fiscal-agent`;
 
 export function AIChat({ siteId, onMissionCreated, className }: AIChatProps) {
   const { t } = useTranslation();
   const [messages, setMessages] = useState<Message[]>([]);
   const [input, setInput] = useState('');
   const [isLoading, setIsLoading] = useState(false);
   const scrollRef = useRef<HTMLDivElement>(null);
   const textareaRef = useRef<HTMLTextAreaElement>(null);
 
   useEffect(() => {
     if (scrollRef.current) {
       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
     }
   }, [messages]);
 
   const streamChat = async (userMessages: Message[]) => {
     const resp = await fetch(CHAT_URL, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
       },
       body: JSON.stringify({ 
         messages: userMessages,
         siteId 
       }),
     });
 
     if (!resp.ok) {
       const error = await resp.json();
       throw new Error(error.error || 'Erro ao comunicar com o agente');
     }
 
     if (!resp.body) throw new Error("No response body");
 
     const reader = resp.body.getReader();
     const decoder = new TextDecoder();
     let textBuffer = "";
     let assistantContent = "";
 
     while (true) {
       const { done, value } = await reader.read();
       if (done) break;
       
       textBuffer += decoder.decode(value, { stream: true });
 
       let newlineIndex: number;
       while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
         let line = textBuffer.slice(0, newlineIndex);
         textBuffer = textBuffer.slice(newlineIndex + 1);
 
         if (line.endsWith("\r")) line = line.slice(0, -1);
         if (line.startsWith(":") || line.trim() === "") continue;
         if (!line.startsWith("data: ")) continue;
 
         const jsonStr = line.slice(6).trim();
         if (jsonStr === "[DONE]") break;
 
         try {
           const parsed = JSON.parse(jsonStr);
           const content = parsed.choices?.[0]?.delta?.content as string | undefined;
           if (content) {
             assistantContent += content;
             setMessages(prev => {
               const last = prev[prev.length - 1];
               if (last?.role === "assistant") {
                 return prev.map((m, i) => 
                   i === prev.length - 1 ? { ...m, content: assistantContent } : m
                 );
               }
               return [...prev, { role: "assistant", content: assistantContent }];
             });
           }
         } catch {
           textBuffer = line + "\n" + textBuffer;
           break;
         }
       }
     }
   };
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!input.trim() || isLoading) return;
 
     const userMessage: Message = { role: 'user', content: input.trim() };
     const newMessages = [...messages, userMessage];
     setMessages(newMessages);
     setInput('');
     setIsLoading(true);
 
     try {
       await streamChat(newMessages);
     } catch (error) {
       console.error('Chat error:', error);
       setMessages(prev => [
         ...prev,
         { role: 'assistant', content: `❌ ${error instanceof Error ? error.message : 'Erro de comunicação'}` }
       ]);
     } finally {
       setIsLoading(false);
     }
   };
 
   const handleKeyDown = (e: React.KeyboardEvent) => {
     if (e.key === 'Enter' && !e.shiftKey) {
       e.preventDefault();
       handleSubmit(e);
     }
   };
 
   const quickCommands = [
     "Fazer auto de medição",
     "Inspecionar fachada norte",
     "Verificar progresso da obra",
     "Listar não-conformidades",
   ];
 
   return (
     <Card className={cn("flex flex-col h-full border-border/50 bg-card/50 backdrop-blur", className)}>
       {/* Header */}
       <div className="flex items-center gap-3 p-4 border-b border-border/50">
         <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
           <Bot className="w-5 h-5 text-primary-foreground" />
         </div>
         <div>
           <h3 className="font-semibold">Agente Fiscal IA</h3>
           <p className="text-xs text-muted-foreground">Assistente de fiscalização</p>
         </div>
         {isLoading && <Loader2 className="w-4 h-4 ml-auto animate-spin text-primary" />}
       </div>
 
       {/* Messages */}
       <ScrollArea className="flex-1 p-4" ref={scrollRef}>
         {messages.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-center py-8">
             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
               <Sparkles className="w-8 h-8 text-primary" />
             </div>
             <h4 className="font-semibold mb-2">Olá! Sou o Agente Fiscal IA</h4>
             <p className="text-sm text-muted-foreground mb-6 max-w-xs">
               Posso ajudar-te a planear missões de drone, analisar capturas e gerar relatórios de fiscalização.
             </p>
             <div className="flex flex-wrap gap-2 justify-center">
               {quickCommands.map((cmd) => (
                 <Button
                   key={cmd}
                   variant="outline"
                   size="sm"
                   className="text-xs"
                   onClick={() => setInput(cmd)}
                 >
                   {cmd}
                 </Button>
               ))}
             </div>
           </div>
         ) : (
           <div className="space-y-4">
             {messages.map((message, index) => (
               <div
                 key={index}
                 className={cn(
                   "flex gap-3",
                   message.role === 'user' ? 'justify-end' : 'justify-start'
                 )}
               >
                 {message.role === 'assistant' && (
                   <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                     <Bot className="w-4 h-4 text-primary" />
                   </div>
                 )}
                 <div
                   className={cn(
                     "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                     message.role === 'user'
                       ? 'bg-primary text-primary-foreground rounded-br-md'
                       : 'bg-muted rounded-bl-md'
                   )}
                 >
                   <p className="whitespace-pre-wrap">{message.content}</p>
                 </div>
                 {message.role === 'user' && (
                   <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                     <User className="w-4 h-4" />
                   </div>
                 )}
               </div>
             ))}
             {isLoading && messages[messages.length - 1]?.role === 'user' && (
               <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                   <Bot className="w-4 h-4 text-primary" />
                 </div>
                 <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                   <div className="flex gap-1">
                     <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                     <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                     <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                 </div>
               </div>
             )}
           </div>
         )}
       </ScrollArea>
 
       {/* Input */}
       <form onSubmit={handleSubmit} className="p-4 border-t border-border/50">
         <div className="flex gap-2">
           <Textarea
             ref={textareaRef}
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyDown={handleKeyDown}
             placeholder="Escreve um comando... (ex: Fazer auto de medição do bloco A)"
             className="min-h-[44px] max-h-[120px] resize-none"
             disabled={isLoading}
           />
           <Button 
             type="submit" 
             size="icon" 
             disabled={!input.trim() || isLoading}
             className="h-11 w-11 shrink-0"
           >
             <Send className="w-4 h-4" />
           </Button>
         </div>
       </form>
     </Card>
   );
 }