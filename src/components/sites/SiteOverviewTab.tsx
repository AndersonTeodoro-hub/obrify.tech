import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Camera, 
  AlertTriangle, 
  ClipboardCheck, 
  Calendar,
  Layers,
  Grid3X3,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';

interface SiteOverviewTabProps {
  siteId: string;
}

export function SiteOverviewTab({ siteId }: SiteOverviewTabProps) {
  const { t } = useTranslation();

  // Fetch structure counts
  const { data: structureData, isLoading: isLoadingStructure } = useQuery({
    queryKey: ['site-structure-counts', siteId],
    queryFn: async () => {
      const { data: floors, error: floorsError } = await supabase
        .from('floors')
        .select('id')
        .eq('site_id', siteId);
      
      if (floorsError) throw floorsError;

      const floorIds = floors?.map(f => f.id) || [];
      
      let areasCount = 0;
      let pointsCount = 0;

      if (floorIds.length > 0) {
        const { data: areas, error: areasError } = await supabase
          .from('areas')
          .select('id')
          .in('floor_id', floorIds);
        
        if (areasError) throw areasError;
        areasCount = areas?.length || 0;

        const areaIds = areas?.map(a => a.id) || [];
        
        if (areaIds.length > 0) {
          const { count, error: pointsError } = await supabase
            .from('capture_points')
            .select('*', { count: 'exact', head: true })
            .in('area_id', areaIds);
          
          if (pointsError) throw pointsError;
          pointsCount = count || 0;
        }
      }

      return {
        floors: floors?.length || 0,
        areas: areasCount,
        points: pointsCount,
      };
    },
  });

  // Fetch capture count
  const { data: captureCount, isLoading: isLoadingCaptures } = useQuery({
    queryKey: ['site-capture-count', siteId],
    queryFn: async () => {
      const { data: floors } = await supabase
        .from('floors')
        .select('id')
        .eq('site_id', siteId);
      
      const floorIds = floors?.map(f => f.id) || [];
      if (floorIds.length === 0) return 0;

      const { data: areas } = await supabase
        .from('areas')
        .select('id')
        .in('floor_id', floorIds);
      
      const areaIds = areas?.map(a => a.id) || [];
      if (areaIds.length === 0) return 0;

      const { data: points } = await supabase
        .from('capture_points')
        .select('id')
        .in('area_id', areaIds);
      
      const pointIds = points?.map(p => p.id) || [];
      if (pointIds.length === 0) return 0;

      const { count } = await supabase
        .from('captures')
        .select('*', { count: 'exact', head: true })
        .in('capture_point_id', pointIds);
      
      return count || 0;
    },
  });

  // Fetch inspections data
  const { data: inspectionsData, isLoading: isLoadingInspections } = useQuery({
    queryKey: ['site-inspections-stats', siteId],
    queryFn: async () => {
      const { data: inspections, error } = await supabase
        .from('inspections')
        .select('id, scheduled_at, status')
        .eq('site_id', siteId)
        .order('scheduled_at', { ascending: false });
      
      if (error) throw error;

      const lastInspection = inspections?.[0];
      
      return {
        count: inspections?.length || 0,
        lastInspection: lastInspection?.scheduled_at || null,
      };
    },
  });

  // Fetch open NCs count
  const { data: openNCsCount, isLoading: isLoadingNCs } = useQuery({
    queryKey: ['site-open-ncs', siteId],
    queryFn: async () => {
      const { data: inspections } = await supabase
        .from('inspections')
        .select('id')
        .eq('site_id', siteId);
      
      const inspectionIds = inspections?.map(i => i.id) || [];
      if (inspectionIds.length === 0) return 0;

      const { count } = await supabase
        .from('nonconformities')
        .select('*', { count: 'exact', head: true })
        .in('inspection_id', inspectionIds)
        .eq('status', 'OPEN');
      
      return count || 0;
    },
  });

  const isLoading = isLoadingStructure || isLoadingCaptures || isLoadingInspections || isLoadingNCs;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('siteDetail.totalCaptures')}
            </CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{captureCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('siteDetail.openNCs')}
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${(openNCsCount || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(openNCsCount || 0) > 0 ? 'text-destructive' : ''}`}>
              {openNCsCount || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('siteDetail.inspectionsCount')}
            </CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectionsData?.count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('siteDetail.lastInspection')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectionsData?.lastInspection 
                ? format(new Date(inspectionsData.lastInspection), 'dd/MM/yyyy')
                : t('siteDetail.noInspections')
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Structure Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('siteDetail.structureSummary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{structureData?.floors || 0}</p>
                <p className="text-sm text-muted-foreground">{t('siteDetail.floors')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Grid3X3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{structureData?.areas || 0}</p>
                <p className="text-sm text-muted-foreground">{t('siteDetail.areas')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{structureData?.points || 0}</p>
                <p className="text-sm text-muted-foreground">{t('siteDetail.points')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
