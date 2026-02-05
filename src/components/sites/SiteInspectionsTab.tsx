import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, ClipboardCheck, Eye, Pencil } from 'lucide-react';
import { format } from 'date-fns';

interface SiteInspectionsTabProps {
  siteId: string;
}

const statusStyles: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export function SiteInspectionsTab({ siteId }: SiteInspectionsTabProps) {
  const { t } = useTranslation();

  const { data: inspections, isLoading } = useQuery({
    queryKey: ['site-inspections', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          id,
          status,
          scheduled_at,
          created_at,
          template:inspection_templates(id, name)
        `)
        .eq('site_id', siteId)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return t('inspections.statusDraft');
      case 'in_progress':
        return t('inspections.statusInProgress');
      case 'completed':
        return t('inspections.statusCompleted');
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!inspections || inspections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('inspections.noInspections')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('inspections.startInspecting')}
          </p>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('inspections.new')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('inspections.new')}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inspections.template')}</TableHead>
              <TableHead>{t('siteDetail.scheduledDate')}</TableHead>
              <TableHead>{t('inspections.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inspections.map((inspection) => (
              <TableRow key={inspection.id}>
                <TableCell className="font-medium">
                  {inspection.template?.name || '-'}
                </TableCell>
                <TableCell>
                  {inspection.scheduled_at 
                    ? format(new Date(inspection.scheduled_at), 'dd/MM/yyyy HH:mm')
                    : '-'
                  }
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={statusStyles[inspection.status] || ''}
                  >
                    {getStatusLabel(inspection.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
