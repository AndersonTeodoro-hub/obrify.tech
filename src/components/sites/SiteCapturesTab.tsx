import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Camera } from 'lucide-react';
import { CaptureCard } from '@/components/captures/CaptureCard';
import { CaptureViewer } from '@/components/captures/CaptureViewer';
import { NewCaptureModal } from '@/components/captures/NewCaptureModal';
import type { CaptureWithDetails } from '@/types/captures';

interface SiteCapturesTabProps {
  siteId: string;
  siteName: string;
}

export function SiteCapturesTab({ siteId, siteName }: SiteCapturesTabProps) {
  const { t } = useTranslation();
  const [selectedCapture, setSelectedCapture] = useState<CaptureWithDetails | null>(null);
  const [isNewCaptureOpen, setIsNewCaptureOpen] = useState(false);

  const { data: captures, isLoading, refetch } = useQuery({
    queryKey: ['site-captures', siteId],
    queryFn: async () => {
      // First get all floors for this site
      const { data: floors } = await supabase
        .from('floors')
        .select('id')
        .eq('site_id', siteId);
      
      const floorIds = floors?.map(f => f.id) || [];
      if (floorIds.length === 0) return [];

      // Get all areas for these floors
      const { data: areas } = await supabase
        .from('areas')
        .select('id')
        .in('floor_id', floorIds);
      
      const areaIds = areas?.map(a => a.id) || [];
      if (areaIds.length === 0) return [];

      // Get all capture points for these areas
      const { data: points } = await supabase
        .from('capture_points')
        .select('id')
        .in('area_id', areaIds);
      
      const pointIds = points?.map(p => p.id) || [];
      if (pointIds.length === 0) return [] as CaptureWithDetails[];

      // Get captures with full details
      const { data: capturesData, error } = await supabase
        .from('captures')
        .select(`
          id,
          file_path,
          captured_at,
          created_at,
          source_type,
          processing_status,
          user_id,
          capture_point:capture_points(
            id,
            code,
            description,
            area:areas(
              id,
              name,
              floor:floors(
                id,
                name,
                level,
                site:sites(id, name)
              )
            )
          )
        `)
        .in('capture_point_id', pointIds)
        .order('captured_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch profiles for all user_ids
      const userIds = [...new Set(capturesData?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      return (capturesData || []).map(capture => ({
        ...capture,
        profile: profileMap.get(capture.user_id) || null,
      })) as CaptureWithDetails[];
    },
  });

  const handleCaptureClick = (capture: CaptureWithDetails) => {
    setSelectedCapture(capture);
  };

  const handleNavigate = (capture: CaptureWithDetails) => {
    setSelectedCapture(capture);
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  if (!captures || captures.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('captures.noCaptures')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('captures.startCapturing')}
            </p>
            <Button onClick={() => setIsNewCaptureOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('captures.new')}
            </Button>
          </CardContent>
        </Card>

        <NewCaptureModal
          open={isNewCaptureOpen}
          onOpenChange={(open) => {
            setIsNewCaptureOpen(open);
            if (!open) refetch();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setIsNewCaptureOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('captures.new')}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {captures.map((capture) => (
            <CaptureCard
              key={capture.id}
              capture={capture}
              onClick={() => handleCaptureClick(capture)}
            />
          ))}
        </div>
      </div>

      <CaptureViewer
        capture={selectedCapture}
        captures={captures}
        open={!!selectedCapture}
        onOpenChange={(open) => !open && setSelectedCapture(null)}
        onNavigate={handleNavigate}
        onDelete={() => {
          setSelectedCapture(null);
          refetch();
        }}
      />

      <NewCaptureModal
        open={isNewCaptureOpen}
        onOpenChange={(open) => {
          setIsNewCaptureOpen(open);
          if (!open) refetch();
        }}
      />
    </>
  );
}
