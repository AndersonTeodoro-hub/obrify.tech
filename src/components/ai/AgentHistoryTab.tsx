import { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Conversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  message_count: number;
}

interface AgentHistoryTabProps {
  conversations: Conversation[];
  loadingHistory: boolean;
  onLoadConversations: () => void;
  onSelectConversation: (id: string) => void;
  activeConversationId: string | null;
}

export function AgentHistoryTab({
  conversations,
  loadingHistory,
  onLoadConversations,
  onSelectConversation,
  activeConversationId,
}: AgentHistoryTabProps) {
  useEffect(() => {
    onLoadConversations();
  }, [onLoadConversations]);

  if (loadingHistory) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        A carregar histórico...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <MessageSquare className="h-8 w-8 opacity-40" />
        <p>Sem conversas anteriores</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-2 py-2">
      <div className="space-y-1">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-muted/80 ${
              conv.id === activeConversationId ? 'bg-muted' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">
                {conv.title || 'Conversa sem título'}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {conv.message_count}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(conv.started_at), "d MMM, HH:mm", { locale: pt })}
              {conv.ended_at && ' • terminada'}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
