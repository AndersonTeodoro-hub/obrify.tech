import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2, Calendar, User, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { NCStatusTimeline } from './NCStatusTimeline';
import { NCEvidenceGallery } from './NCEvidenceGallery';
import { CloseNCModal } from './CloseNCModal';

const severityConfig = {
  critical: { label: 'severityCritical', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  high: { label: 'severityHigh', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  medium: { label: 'severityMedium', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
};

const statusConfig = {
  OPEN: { label: 'open', color: 'bg-red-500/20 text-red-400' },
  IN_PROGRESS: { label: 'in_progress', color: 'bg-blue-500/20 text-blue-400' },
  RESOLVED: { label: 'resolved', color: 'bg-orange-500/20 text-orange-400' },
  CLOSED: { label: 'closed', color: 'bg-green-500/20 text-green-400' },
};

const statusOrder = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

interface NCDetailSheetProps {
  ncId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange?: () => void;
}

export function NCDetailSheet({ ncId, open, onOpenChange, onStatusChange }: NCDetailSheetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCloseModal, setShowCloseModal] = useState(false);

  const { data: nc, isLoading } = useQuery({
    queryKey: ['nonconformity-detail', ncId],
    queryFn: async () => {
      if (!ncId) return null;
      const { data, error } = await supabase
        .from('nonconformities')
        .select(`
          *,
          sites!nonconformities_site_id_fkey(id, name),
          inspections!nonconformities_inspection_id_fkey(
            id,
            inspection_templates(name)
          )
        `)
        .eq('id', ncId)
        .single();
      if (error) throw error;
      
      // Fetch profile separately if created_by exists
      let creatorName: string | null = null;
      if (data.created_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', data.created_by)
          .single();
        creatorName = profile?.full_name || null;
      }
      
      return { ...data, creatorName };
    },
    enabled: !!ncId && open,
  });

  const changeStatusMutation = useMutation({
    mutationFn: async ({ newStatus, notes }: { newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; notes?: string }) => {
      if (!ncId || !user?.id) throw new Error('Missing data');

      // Update NC status
      const { error: updateError } = await supabase
        .from('nonconformities')
        .update({ status: newStatus })
        .eq('id', ncId);
      if (updateError) throw updateError;

      // Log status change in history
      const { error: historyError } = await supabase
        .from('nonconformity_status_history')
        .insert({
          nonconformity_id: ncId,
          old_status: nc?.status,
          new_status: newStatus,
          changed_by: user.id,
          notes: notes || null,
        });
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      toast({
        title: t('nc.detail.statusChanged'),
      });
      queryClient.invalidateQueries({ queryKey: ['nonconformity-detail', ncId] });
      queryClient.invalidateQueries({ queryKey: ['nc-status-history', ncId] });
      onStatusChange?.();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') => {
    if (newStatus === 'CLOSED') {
      setShowCloseModal(true);
    } else {
      changeStatusMutation.mutate({ newStatus });
    }
  };

  const handleCloseNC = async (notes: string) => {
    await changeStatusMutation.mutateAsync({ newStatus: 'CLOSED', notes });
    setShowCloseModal(false);
  };

  if (!ncId) return null;

  const sevConfig = nc ? severityConfig[nc.severity as keyof typeof severityConfig] || severityConfig.medium : null;
  const statConfig = nc ? statusConfig[nc.status as keyof typeof statusConfig] || statusConfig.OPEN : null;
  const isClosed = nc?.status === 'CLOSED';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t('ncPage.title')}
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-4 mt-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : nc ? (
            <div className="space-y-6 mt-6">
              {/* Status & Severity */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                {sevConfig && (
                  <Badge className={sevConfig.color} variant="outline">
                    {t(`nc.${sevConfig.label}`)}
                  </Badge>
                )}
                {statConfig && (
                  <Badge className={statConfig.color} variant="secondary">
                    {t(`nc.status.${statConfig.label}`)}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <div>
                <h3 className="font-semibold text-lg">{nc.title}</h3>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{t('nc.detail.site')}:</span>
                </div>
                <div className="font-medium">{nc.sites?.name || '-'}</div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>{t('nc.detail.inspection')}:</span>
                </div>
                <div className="font-medium">{nc.inspections?.inspection_templates?.name || '-'}</div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{t('nc.detail.createdBy')}:</span>
                </div>
                <div className="font-medium">{nc.creatorName || '-'}</div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{t('nc.detail.createdAt')}:</span>
                </div>
                <div className="font-medium">
                  {format(new Date(nc.created_at), 'dd/MM/yyyy HH:mm')}
                </div>

                {nc.due_date && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>{t('nc.detail.dueDate')}:</span>
                    </div>
                    <div className="font-medium">
                      {format(new Date(nc.due_date), 'dd/MM/yyyy')}
                    </div>
                  </>
                )}

                {nc.responsible && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{t('nc.detail.responsible')}:</span>
                    </div>
                    <div className="font-medium">{nc.responsible}</div>
                  </>
                )}
              </div>

              <Separator />

              {/* Description */}
              <div>
                <h4 className="font-medium mb-2">{t('nc.detail.description')}</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {nc.description || '-'}
                </p>
              </div>

              {/* Standard Violated */}
              {nc.standard_violated && (
                <div>
                  <h4 className="font-medium mb-2">{t('nc.detail.standardViolated')}</h4>
                  <p className="text-sm text-muted-foreground">{nc.standard_violated}</p>
                </div>
              )}

              {/* Corrective Action */}
              {nc.corrective_action && (
                <div>
                  <h4 className="font-medium mb-2">{t('nc.detail.correctiveAction')}</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    {nc.corrective_action}
                  </p>
                </div>
              )}

              <Separator />

              {/* Evidence Photos */}
              <div>
                <h4 className="font-medium mb-3">{t('nc.detail.evidence')}</h4>
                <NCEvidenceGallery ncId={ncId} />
              </div>

              <Separator />

              {/* Status Timeline */}
              <div>
                <h4 className="font-medium mb-3">{t('nc.detail.history')}</h4>
                <NCStatusTimeline ncId={ncId} currentStatus={nc.status} createdAt={nc.created_at} />
              </div>

              {/* Change Status */}
              {!isClosed && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3">{t('nc.detail.changeStatus')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {statusOrder.map((status) => {
                        const config = statusConfig[status];
                        const isCurrentStatus = nc.status === status;
                        
                        if (status === 'CLOSED') {
                          return (
                            <Button
                              key={status}
                              variant="outline"
                              size="sm"
                              className={isCurrentStatus ? config.color : ''}
                              disabled={isCurrentStatus || changeStatusMutation.isPending}
                              onClick={() => handleStatusChange(status)}
                            >
                              {t(`nc.status.${config.label}`)}
                            </Button>
                          );
                        }
                        
                        return (
                          <Button
                            key={status}
                            variant="outline"
                            size="sm"
                            className={isCurrentStatus ? config.color : ''}
                            disabled={isCurrentStatus || changeStatusMutation.isPending}
                            onClick={() => handleStatusChange(status)}
                          >
                            {t(`nc.status.${config.label}`)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <CloseNCModal
        open={showCloseModal}
        onOpenChange={setShowCloseModal}
        ncId={ncId}
        onClose={handleCloseNC}
        isPending={changeStatusMutation.isPending}
      />
    </>
  );
}
