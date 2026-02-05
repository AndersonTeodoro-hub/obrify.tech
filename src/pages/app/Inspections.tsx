import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Eye } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { InspectionFilters } from '@/components/inspections/InspectionFilters';
import { NewInspectionWizard } from '@/components/inspections/NewInspectionWizard';

type DateFilter = 'all' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';

export default function Inspections() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  
  // Filter state
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Fetch inspections with related data
  const { data: inspections, isLoading, refetch } = useQuery({
    queryKey: ['inspections', siteFilter, statusFilter, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from('inspections')
        .select(`
          *,
          sites!inner(id, name),
          inspection_templates!inner(id, name, category)
        `)
        .order('created_at', { ascending: false });

      // Apply site filter
      if (siteFilter !== 'all') {
        query = query.eq('site_id', siteFilter);
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter.toUpperCase());
      }

      // Apply date filter
      const now = new Date();
      if (dateFilter === 'last7') {
        query = query.gte('created_at', subDays(now, 7).toISOString());
      } else if (dateFilter === 'last30') {
        query = query.gte('created_at', subDays(now, 30).toISOString());
      } else if (dateFilter === 'thisMonth') {
        query = query.gte('created_at', startOfMonth(now).toISOString());
      } else if (dateFilter === 'lastMonth') {
        const lastMonth = subMonths(now, 1);
        query = query.gte('created_at', startOfMonth(lastMonth).toISOString())
          .lte('created_at', endOfMonth(lastMonth).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch sites for filter dropdown
  const { data: sites } = useQuery({
    queryKey: ['sites-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for inspector names
  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      if (error) throw error;
      return data;
    },
  });

  const getInspectorName = (userId: string) => {
    const profile = profiles?.find(p => p.user_id === userId);
    return profile?.full_name || t('common.unknown');
  };

  const getStatusBadge = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case 'draft':
        return <Badge variant="secondary">{t('inspections.statusDraft')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30">{t('inspections.statusInProgress')}</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30">{t('inspections.statusCompleted')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadge = (category: string | null) => {
    const colors: Record<string, string> = {
      structure: 'bg-blue-500/20 text-blue-400',
      finishes: 'bg-amber-500/20 text-amber-400',
      installations: 'bg-green-500/20 text-green-400',
      safety: 'bg-red-500/20 text-red-400',
    };
    const colorClass = category ? colors[category] || 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground';
    return (
      <Badge className={colorClass}>
        {category ? t(`templates.categories.${category}`) : '-'}
      </Badge>
    );
  };

  const hasActiveFilters = siteFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setSiteFilter('all');
    setStatusFilter('all');
    setDateFilter('all');
  };

  const handleInspectionCreated = (inspectionId: string) => {
    setWizardOpen(false);
    refetch();
    navigate(`/app/inspections/${inspectionId}`);
  };

  const dateLocale = i18n.language === 'pt' ? pt : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('inspections.title')}</h1>
          <p className="text-muted-foreground">{t('inspections.subtitle')}</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-accent" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('inspections.new')}
        </Button>
      </div>

      <InspectionFilters
        sites={sites || []}
        siteFilter={siteFilter}
        onSiteFilterChange={setSiteFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {isLoading ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        </Card>
      ) : inspections && inspections.length > 0 ? (
        <Card className="glass border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inspections.date')}</TableHead>
                <TableHead>{t('inspections.site')}</TableHead>
                <TableHead>{t('inspections.template')}</TableHead>
                <TableHead>{t('inspections.status')}</TableHead>
                <TableHead>{t('inspections.inspector')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspections.map((inspection) => (
                <TableRow key={inspection.id}>
                  <TableCell>
                    {format(new Date(inspection.scheduled_at || inspection.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {inspection.sites?.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{inspection.inspection_templates?.name}</span>
                      {getCategoryBadge(inspection.inspection_templates?.category)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(inspection.status)}
                  </TableCell>
                  <TableCell>
                    {getInspectorName(inspection.created_by)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/app/inspections/${inspection.id}`)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {t('inspections.view')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('inspections.noInspections')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('inspections.startInspecting')}</p>
            <Button className="mt-4" onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('inspections.new')}
            </Button>
          </CardContent>
        </Card>
      )}

      <NewInspectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={handleInspectionCreated}
      />
    </div>
  );
}
