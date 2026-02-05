import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

const statusColors = {
  OPEN: 'bg-red-500',
  IN_PROGRESS: 'bg-blue-500',
  RESOLVED: 'bg-orange-500',
  CLOSED: 'bg-green-500',
};

interface NCStatusTimelineProps {
  ncId: string;
  currentStatus: string;
  createdAt: string;
}

export function NCStatusTimeline({ ncId, currentStatus, createdAt }: NCStatusTimelineProps) {
  const { t } = useTranslation();

  const { data: history, isLoading } = useQuery({
    queryKey: ['nc-status-history', ncId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nonconformity_status_history')
        .select('*')
        .eq('nonconformity_id', ncId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      
      // Fetch profile names for each history item
      const historyWithProfiles = await Promise.all(
        data.map(async (item) => {
          let userName: string | null = null;
          if (item.changed_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', item.changed_by)
              .single();
            userName = profile?.full_name || null;
          }
          return { ...item, userName };
        })
      );
      
      return historyWithProfiles;
    },
    enabled: !!ncId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // Build timeline: start with creation, then add history items
  const timelineItems = [
    {
      id: 'creation',
      status: 'OPEN',
      date: createdAt,
      user: null,
      notes: null,
      isCreation: true,
    },
    ...(history || []).map((item) => ({
      id: item.id,
      status: item.new_status,
      date: item.created_at,
      user: item.userName || null,
      notes: item.notes,
      isCreation: false,
    })),
  ];

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      OPEN: 'open',
      IN_PROGRESS: 'in_progress',
      RESOLVED: 'resolved',
      CLOSED: 'closed',
    };
    return t(`nc.status.${labels[status] || 'open'}`);
  };

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-2 top-3 bottom-3 w-0.5 bg-border" />

      <div className="space-y-4">
        {timelineItems.map((item, index) => {
          const color = statusColors[item.status as keyof typeof statusColors] || statusColors.OPEN;
          const isLast = index === timelineItems.length - 1;

          return (
            <div key={item.id} className="relative flex gap-4 pl-6">
              {/* Dot */}
              <div
                className={`absolute left-0 top-1.5 w-4 h-4 rounded-full ${color} border-2 border-background`}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{getStatusLabel(item.status)}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(item.date), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
                {item.user && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.user}</p>
                )}
                {item.notes && (
                  <p className="text-sm text-muted-foreground mt-1 bg-muted/50 p-2 rounded">
                    "{item.notes}"
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
