import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HardHat, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface SitesWithNCsProps {
  orgIds: string[];
}

interface SiteWithNCs {
  id: string;
  name: string;
  address: string | null;
  openNCs: number;
}

export function SitesWithNCs({ orgIds }: SitesWithNCsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: sitesWithNCs, isLoading } = useQuery({
    queryKey: ['sites-with-ncs', orgIds],
    queryFn: async () => {
      // Get all sites for the organizations
      const { data: sites, error: sitesError } = await supabase
        .from('sites')
        .select('id, name, address')
        .in('org_id', orgIds);

      if (sitesError) throw sitesError;
      if (!sites || sites.length === 0) return [];

      const siteIds = sites.map(s => s.id);

      // Get inspections for these sites
      const { data: inspections, error: inspError } = await supabase
        .from('inspections')
        .select('id, site_id')
        .in('site_id', siteIds);

      if (inspError) throw inspError;
      if (!inspections || inspections.length === 0) return [];

      const inspectionIds = inspections.map(i => i.id);

      // Get open nonconformities
      const { data: ncs, error: ncsError } = await supabase
        .from('nonconformities')
        .select('id, inspection_id')
        .in('inspection_id', inspectionIds)
        .eq('status', 'OPEN');

      if (ncsError) throw ncsError;

      // Map NC counts per site
      const ncCountBySite = new Map<string, number>();
      
      ncs?.forEach(nc => {
        const inspection = inspections.find(i => i.id === nc.inspection_id);
        if (inspection) {
          const currentCount = ncCountBySite.get(inspection.site_id) || 0;
          ncCountBySite.set(inspection.site_id, currentCount + 1);
        }
      });

      // Build result with only sites that have open NCs
      const result: SiteWithNCs[] = sites
        .filter(site => (ncCountBySite.get(site.id) || 0) > 0)
        .map(site => ({
          id: site.id,
          name: site.name,
          address: site.address,
          openNCs: ncCountBySite.get(site.id) || 0,
        }))
        .sort((a, b) => b.openNCs - a.openNCs);

      return result;
    },
    enabled: orgIds.length > 0,
  });

  if (isLoading) {
    return (
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            {t('dashboard.sitesWithNCs')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sitesWithNCs || sitesWithNCs.length === 0) {
    return null; // Don't show card if no sites with NCs
  }

  const getSeverityBadgeClass = (count: number) => {
    if (count >= 5) return 'bg-red-500/20 text-red-500';
    if (count >= 3) return 'bg-orange-500/20 text-orange-500';
    return 'bg-yellow-500/20 text-yellow-500';
  };

  return (
    <Card className="glass border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          {t('dashboard.sitesWithNCs')}
        </CardTitle>
        <CardDescription>{t('dashboard.sitesWithNCsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sitesWithNCs.map((site) => (
            <div
              key={site.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-border/50"
              onClick={() => navigate(`/app/sites/${site.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HardHat className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{site.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {site.address || t('sites.noAddress')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={getSeverityBadgeClass(site.openNCs)}>
                  {t('dashboard.openNCsCount', { count: site.openNCs })}
                </Badge>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
