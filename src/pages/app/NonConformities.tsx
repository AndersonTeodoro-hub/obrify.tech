import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileDown, AlertTriangle, Eye, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { NCDetailSheet } from '@/components/nonconformities/NCDetailSheet';

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

export default function NonConformities() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [siteFilter, setSiteFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedNC, setSelectedNC] = useState<string | null>(null);

  // Fetch user's organizations
  const { data: memberships } = useQuery({
    queryKey: ['user-memberships', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const orgIds = memberships?.map((m) => m.org_id) || [];

  // Fetch sites for filter
  const { data: sites } = useQuery({
    queryKey: ['sites-for-filter', orgIds],
    queryFn: async () => {
      if (orgIds.length === 0) return [];
      const { data, error } = await supabase
        .from('sites')
        .select('id, name')
        .in('org_id', orgIds)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: orgIds.length > 0,
  });

  // Fetch all nonconformities
  const { data: nonconformities, isLoading, refetch } = useQuery({
    queryKey: ['all-nonconformities', siteFilter, severityFilter, statusFilter, orgIds],
    queryFn: async () => {
      if (orgIds.length === 0) return [];
      
      let query = supabase
        .from('nonconformities')
        .select(`
          *,
          sites!nonconformities_site_id_fkey(id, name),
          inspections!nonconformities_inspection_id_fkey(
            id,
            inspection_templates(name)
          )
        `)
        .order('created_at', { ascending: false });

      if (siteFilter !== 'all') {
        query = query.eq('site_id', siteFilter);
      }
      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: orgIds.length > 0,
  });

  const hasFilters = siteFilter !== 'all' || severityFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSiteFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
  };

  const exportToExcel = () => {
    if (!nonconformities || nonconformities.length === 0) return;

    const headers = [
      t('ncPage.columns.id'),
      t('ncPage.columns.site'),
      t('ncPage.columns.description'),
      t('ncPage.columns.severity'),
      t('ncPage.columns.status'),
      t('ncPage.columns.dueDate'),
      t('ncPage.columns.responsible'),
      t('nc.detail.createdAt'),
    ];

    const rows = nonconformities.map((nc, index) => {
      const sevKey = nc.severity as keyof typeof severityConfig;
      const statKey = nc.status as keyof typeof statusConfig;
      return [
        `#${String(index + 1).padStart(3, '0')}`,
        nc.sites?.name || '-',
        nc.description || nc.title,
        t(`nc.${severityConfig[sevKey]?.label || 'severityMedium'}`),
        t(`nc.status.${statusConfig[statKey]?.label || 'open'}`),
        nc.due_date ? format(new Date(nc.due_date), 'dd/MM/yyyy') : '-',
        nc.responsible || '-',
        format(new Date(nc.created_at), 'dd/MM/yyyy HH:mm'),
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')
      )
      .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nao-conformidades_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '-';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('ncPage.title')}</h1>
          <p className="text-muted-foreground">{t('ncPage.subtitle')}</p>
        </div>
        <Button onClick={exportToExcel} disabled={!nonconformities?.length}>
          <FileDown className="w-4 h-4 mr-2" />
          {t('ncPage.exportExcel')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('ncPage.filterBySite')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ncPage.allSites')}</SelectItem>
                {sites?.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('ncPage.filterBySeverity')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ncPage.allSeverities')}</SelectItem>
                <SelectItem value="critical">{t('nc.severityCritical')}</SelectItem>
                <SelectItem value="high">{t('nc.severityHigh')}</SelectItem>
                <SelectItem value="medium">{t('nc.severityMedium')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('ncPage.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ncPage.allStatuses')}</SelectItem>
                <SelectItem value="OPEN">{t('nc.status.open')}</SelectItem>
                <SelectItem value="IN_PROGRESS">{t('nc.status.in_progress')}</SelectItem>
                <SelectItem value="RESOLVED">{t('nc.status.resolved')}</SelectItem>
                <SelectItem value="CLOSED">{t('nc.status.closed')}</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                {t('ncPage.clearFilters')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : nonconformities && nonconformities.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t('ncPage.columns.id')}</TableHead>
                  <TableHead>{t('ncPage.columns.site')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('ncPage.columns.description')}</TableHead>
                  <TableHead>{t('ncPage.columns.severity')}</TableHead>
                  <TableHead>{t('ncPage.columns.status')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('ncPage.columns.dueDate')}</TableHead>
                  <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonconformities.map((nc, index) => {
                  const sevConfig = severityConfig[nc.severity as keyof typeof severityConfig] || severityConfig.medium;
                  const statConfig = statusConfig[nc.status as keyof typeof statusConfig] || statusConfig.OPEN;
                  
                  return (
                    <TableRow key={nc.id}>
                      <TableCell className="font-mono text-sm">
                        #{String(index + 1).padStart(3, '0')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {nc.sites?.name || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {truncateText(nc.description || nc.title, 50)}
                      </TableCell>
                      <TableCell>
                        <Badge className={sevConfig.color} variant="outline">
                          {t(`nc.${sevConfig.label}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statConfig.color} variant="secondary">
                          {t(`nc.status.${statConfig.label}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {nc.due_date ? format(new Date(nc.due_date), 'dd/MM/yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedNC(nc.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">{t('ncPage.noResults')}</h3>
              <p className="text-muted-foreground">{t('ncPage.noResultsDesc')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <NCDetailSheet
        ncId={selectedNC}
        open={!!selectedNC}
        onOpenChange={(open) => !open && setSelectedNC(null)}
        onStatusChange={() => refetch()}
      />
    </div>
  );
}
