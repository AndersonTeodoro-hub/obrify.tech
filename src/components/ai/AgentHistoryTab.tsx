import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
  const { t } = useTranslation();

  useEffect(() => {
    onLoadConversations();
  }, [onLoadConversations]);

  if (loadingHistory) {
    return (
      <div className="px-4 py-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Sparkles className="h-8 w-8 text-accent-500 opacity-60" />
        </div>
        <p className="text-sm font-medium text-foreground">{t('agent.historyEmpty')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('agent.historyEmptyDesc')}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-2 py-2">
      <div className="space-y-1">
        {conversations.map((conv, idx) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-muted/80 animate-fade-in ${
              conv.id === activeConversationId ? 'bg-muted' : ''
            }`}
            style={{ animationDelay: `${idx * 40}ms` }}
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
