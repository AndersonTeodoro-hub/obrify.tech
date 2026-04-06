import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { SiteHeader } from '@/components/sites/SiteHeader';
import { SiteOverviewTab } from '@/components/sites/SiteOverviewTab';
import { SiteStructureTab } from '@/components/sites/SiteStructureTab';
import { SiteCapturesTab } from '@/components/sites/SiteCapturesTab';
import { SiteInspectionsTab } from '@/components/sites/SiteInspectionsTab';
import { SiteDocumentsTab } from '@/components/sites/SiteDocumentsTab';
import { SiteProjectsTab } from '@/components/sites/SiteProjectsTab';
import { EditSiteModal } from '@/components/sites/EditSiteModal';
import { SiteFloorPlanTab } from '@/components/sites/SiteFloorPlanTab';

export default function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: site, isLoading, error, refetch } = useQuery({
    queryKey: ['site', siteId],
    queryFn: async () => {
      if (!siteId) throw new Error('No site ID provided');
      
      const { data, error } = await supabase
        .from('sites')
        .select(`
          *,
          organization:organizations(id, name)
        `)
        .eq('id', siteId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">{t('siteDetail.notFound')}</h2>
        <p className="text-muted-foreground">{t('siteDetail.notFoundDesc')}</p>
        <Button onClick={() => navigate('/app/sites')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('siteDetail.backToSites')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SiteHeader 
        site={site} 
        onEdit={() => setIsEditOpen(true)} 
        onBack={() => navigate('/app/sites')}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">{t('siteDetail.overview')}</TabsTrigger>
          <TabsTrigger value="structure">{t('siteDetail.structure')}</TabsTrigger>
          <TabsTrigger value="floorplan">Planta</TabsTrigger>
          <TabsTrigger value="projects">Projectos</TabsTrigger>
          <TabsTrigger value="captures">{t('siteDetail.captures')}</TabsTrigger>
          <TabsTrigger value="inspections">{t('siteDetail.inspections')}</TabsTrigger>
          <TabsTrigger value="documents">{t('siteDetail.documents')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SiteOverviewTab siteId={siteId!} />
        </TabsContent>

        <TabsContent value="structure">
          <SiteStructureTab siteId={siteId!} />
        </TabsContent>

        <TabsContent value="floorplan">
          <SiteFloorPlanTab siteId={siteId!} />
        </TabsContent>

        <TabsContent value="projects">
          <SiteProjectsTab siteId={siteId!} orgId={site.org_id} />
        </TabsContent>

        <TabsContent value="captures">
          <SiteCapturesTab siteId={siteId!} siteName={site.name} />
        </TabsContent>

        <TabsContent value="inspections">
          <SiteInspectionsTab siteId={siteId!} />
        </TabsContent>

        <TabsContent value="documents">
          <SiteDocumentsTab siteId={siteId!} orgId={site.org_id} />
        </TabsContent>
      </Tabs>

      <EditSiteModal
        site={site}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => {
          refetch();
          setIsEditOpen(false);
        }}
      />
    </div>
  );
}
