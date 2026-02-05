import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, Eye, AlertTriangle, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatDistanceToNow } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: string;
  related_capture_id: string | null;
  related_site_id: string | null;
  user_id: string;
  read: boolean;
  created_at: string;
}

export function AlertBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const dateLocale = i18n.language === 'pt' ? pt : enUS;

  // Fetch alerts and count
  const fetchAlerts = async () => {
    if (!user) return;

    try {
      // Fetch recent alerts
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setAlerts(data || []);

      // Count unread
      const { count, error: countError } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (!countError) {
        setUnreadCount(count || 0);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newAlert = payload.new as Alert;
          setAlerts((prev) => [newAlert, ...prev].slice(0, 10));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedAlert = payload.new as Alert;
          setAlerts((prev) =>
            prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a))
          );
          // Recalculate unread count
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (alertId: string) => {
    await supabase.from('alerts').update({ read: true }).eq('id', alertId);
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, read: true } : a))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase
      .from('alerts')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadCount(0);
  };

  const handleViewCapture = async (alert: Alert) => {
    await markAsRead(alert.id);
    if (alert.related_site_id && alert.related_capture_id) {
      navigate(`/app/sites/${alert.related_site_id}?tab=captures&capture=${alert.related_capture_id}`);
    }
    setIsOpen(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'major':
        return 'bg-orange-500 text-white';
      case 'minor':
        return 'bg-yellow-500 text-black';
      case 'observation':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical':
        return t('captures.ai.severity.critical');
      case 'major':
        return t('captures.ai.severity.major');
      case 'minor':
        return t('captures.ai.severity.minor');
      case 'observation':
        return t('captures.ai.severity.observation');
      default:
        return severity;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: true,
        locale: dateLocale,
      });
    } catch {
      return dateString;
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold">{t('alerts.title')}</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              {t('alerts.markAllRead')}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />

        {/* Alerts List */}
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                {t('alerts.noAlerts')}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {t('alerts.noAlertsDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`relative rounded-lg p-3 transition-colors ${
                    alert.read
                      ? 'bg-background hover:bg-muted/50'
                      : 'bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  {/* Unread indicator */}
                  {!alert.read && (
                    <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
                  )}

                  <div className="flex items-start gap-2">
                    <Badge
                      className={`shrink-0 text-[10px] px-1.5 py-0 ${getSeverityColor(
                        alert.severity
                      )}`}
                    >
                      {getSeverityLabel(alert.severity)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(alert.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => handleViewCapture(alert)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {t('alerts.viewCapture')}
                    </Button>
                    {(alert.severity === 'critical' || alert.severity === 'major') && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          handleViewCapture(alert);
                        }}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        NC
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
