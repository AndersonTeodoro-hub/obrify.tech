import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CaptureCard } from '@/components/captures/CaptureCard';
import { CaptureFilters } from '@/components/captures/CaptureFilters';
import { NewCaptureModal } from '@/components/captures/NewCaptureModal';
import { CaptureViewer } from '@/components/captures/CaptureViewer';
import type { CaptureFiltersState, CaptureWithDetails } from '@/types/captures';
import { CATEGORY_SOURCES } from '@/types/captures';

export default function Captures() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCapture, setSelectedCapture] = useState<CaptureWithDetails | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [filters, setFilters] = useState<CaptureFiltersState>({
    siteId: null,
    floorId: null,
    captureType: 'all',
    dateFrom: null,
    dateTo: null,
  });

  // Fetch user's sites through memberships
  const { data: sites = [] } = useQuery({
    queryKey: ['user-sites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: memberships } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);

      if (!memberships?.length) return [];

      const orgIds = memberships.map((m) => m.org_id);
      
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .in('org_id', orgIds)
        .order('name');

      return sites || [];
    },
    enabled: !!user,
  });

  // Fetch floors for selected site
  const { data: floors = [], isLoading: isLoadingFloors } = useQuery({
    queryKey: ['site-floors', filters.siteId],
    queryFn: async () => {
      if (!filters.siteId) return [];
      
      const { data } = await supabase
        .from('floors')
        .select('id, name, level')
        .eq('site_id', filters.siteId)
        .order('level');

      return data || [];
    },
    enabled: !!filters.siteId,
  });

  // Fetch captures with all related data
  const { data: captures = [], isLoading: isLoadingCaptures } = useQuery({
    queryKey: ['captures', filters, user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get user's org IDs first
      const { data: memberships } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);

      if (!memberships?.length) return [];

      const orgIds = memberships.map((m) => m.org_id);

      // Build query for captures with all joins
      let query = supabase
        .from('captures')
        .select(`
          id,
          file_path,
          source_type,
          processing_status,
          captured_at,
          created_at,
          user_id,
          capture_points!inner (
            id,
            code,
            description,
            areas!inner (
              id,
              name,
              floors!inner (
                id,
                name,
                level,
                sites!inner (
                  id,
                  name,
                  org_id
                )
              )
            )
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.captureType !== 'all') {
        const sources = CATEGORY_SOURCES[filters.captureType];
        query = query.in('source_type', sources);
      }

      const { data: capturesData, error } = await query;

      if (error) {
        console.error('Error fetching captures:', error);
        return [];
      }

      if (!capturesData) return [];

      // Filter by org membership and site/floor filters
      const filteredCaptures = capturesData.filter((capture: any) => {
        const site = capture.capture_points?.areas?.floors?.sites;
        if (!site || !orgIds.includes(site.org_id)) return false;
        
        if (filters.siteId && site.id !== filters.siteId) return false;
        if (filters.floorId && capture.capture_points?.areas?.floors?.id !== filters.floorId) return false;
        
        return true;
      });

      // Get user profiles for the captures
      const userIds = [...new Set(filteredCaptures.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      // Transform to CaptureWithDetails format
      return filteredCaptures.map((capture: any): CaptureWithDetails => ({
        id: capture.id,
        file_path: capture.file_path,
        source_type: capture.source_type,
        processing_status: capture.processing_status,
        captured_at: capture.captured_at,
        created_at: capture.created_at,
        user_id: capture.user_id,
        capture_point: {
          id: capture.capture_points.id,
          code: capture.capture_points.code,
          description: capture.capture_points.description,
          area: {
            id: capture.capture_points.areas.id,
            name: capture.capture_points.areas.name,
            floor: {
              id: capture.capture_points.areas.floors.id,
              name: capture.capture_points.areas.floors.name,
              level: capture.capture_points.areas.floors.level,
              site: {
                id: capture.capture_points.areas.floors.sites.id,
                name: capture.capture_points.areas.floors.sites.name,
              },
            },
          },
        },
        profile: profileMap.get(capture.user_id) || null,
      }));
    },
    enabled: !!user,
  });

  const handleCaptureClick = (capture: CaptureWithDetails) => {
    setSelectedCapture(capture);
    setIsViewerOpen(true);
  };

  const handleViewerNavigate = (capture: CaptureWithDetails) => {
    setSelectedCapture(capture);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('captures.title')}</h1>
          <p className="text-muted-foreground">{t('captures.subtitle')}</p>
        </div>
        <Button 
          className="bg-gradient-to-r from-primary to-accent"
          onClick={() => setIsCreateOpen(true)}
        >
          <Camera className="w-4 h-4 mr-2" />
          {t('captures.new')}
        </Button>
      </div>

      {/* Filters */}
      <CaptureFilters
        filters={filters}
        onFiltersChange={setFilters}
        sites={sites}
        floors={floors}
        isLoadingFloors={isLoadingFloors}
      />

      {/* Content */}
      {isLoadingCaptures ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      ) : captures.length === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">{t('captures.noCaptures')}</h3>
            <p className="text-muted-foreground text-center mt-1">{t('captures.startCapturing')}</p>
            <Button 
              className="mt-4 bg-gradient-to-r from-primary to-accent"
              onClick={() => setIsCreateOpen(true)}
            >
              <Camera className="w-4 h-4 mr-2" />
              {t('captures.new')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {captures.map((capture) => (
            <CaptureCard
              key={capture.id}
              capture={capture}
              onClick={() => handleCaptureClick(capture)}
            />
          ))}
        </div>
      )}

      {/* New Capture Modal */}
      <NewCaptureModal open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* Capture Viewer */}
      <CaptureViewer
        capture={selectedCapture}
        captures={captures}
        open={isViewerOpen}
        onOpenChange={setIsViewerOpen}
        onNavigate={handleViewerNavigate}
      />
    </div>
  );
}
