import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  MoreVertical, 
  Layers, 
  Grid3X3, 
  MapPin,
  Pencil,
  Trash2,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { AddFloorModal } from './AddFloorModal';
import { AddAreaModal } from './AddAreaModal';
import { AddPointModal } from './AddPointModal';

interface SiteStructureTabProps {
  siteId: string;
}

interface Floor {
  id: string;
  name: string;
  level: number | null;
  areas: Area[];
}

interface Area {
  id: string;
  name: string;
  floor_id: string;
  capture_points: CapturePoint[];
}

interface CapturePoint {
  id: string;
  code: string;
  description: string | null;
  area_id: string;
}

export function SiteStructureTab({ siteId }: SiteStructureTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [isAddFloorOpen, setIsAddFloorOpen] = useState(false);
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [isAddPointOpen, setIsAddPointOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const { data: structure, isLoading } = useQuery({
    queryKey: ['site-structure', siteId],
    queryFn: async () => {
      // Fetch floors
      const { data: floors, error: floorsError } = await supabase
        .from('floors')
        .select('id, name, level')
        .eq('site_id', siteId)
        .order('level', { ascending: true });
      
      if (floorsError) throw floorsError;

      // Fetch areas for all floors
      const floorIds = floors?.map(f => f.id) || [];
      const { data: areas, error: areasError } = await supabase
        .from('areas')
        .select('id, name, floor_id')
        .in('floor_id', floorIds.length > 0 ? floorIds : ['']);
      
      if (areasError) throw areasError;

      // Fetch capture points for all areas
      const areaIds = areas?.map(a => a.id) || [];
      const { data: points, error: pointsError } = await supabase
        .from('capture_points')
        .select('id, code, description, area_id')
        .in('area_id', areaIds.length > 0 ? areaIds : ['']);
      
      if (pointsError) throw pointsError;

      // Organize into hierarchy
      const floorsWithChildren: Floor[] = (floors || []).map(floor => ({
        ...floor,
        areas: (areas || [])
          .filter(area => area.floor_id === floor.id)
          .map(area => ({
            ...area,
            capture_points: (points || []).filter(point => point.area_id === area.id),
          })),
      }));

      return floorsWithChildren;
    },
  });

  const deleteFloorMutation = useMutation({
    mutationFn: async (floorId: string) => {
      const { error } = await supabase.from('floors').delete().eq('id', floorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
      toast.success(t('siteDetail.floorDeleted'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async (areaId: string) => {
      const { error } = await supabase.from('areas').delete().eq('id', areaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
      toast.success(t('siteDetail.areaDeleted'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const deletePointMutation = useMutation({
    mutationFn: async (pointId: string) => {
      const { error } = await supabase.from('capture_points').delete().eq('id', pointId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
      toast.success(t('siteDetail.pointDeleted'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const handleAddArea = (floorId: string) => {
    setSelectedFloorId(floorId);
    setIsAddAreaOpen(true);
  };

  const handleAddPoint = (areaId: string) => {
    setSelectedAreaId(areaId);
    setIsAddPointOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!structure || structure.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('siteDetail.noFloors')}</h3>
          <Button onClick={() => setIsAddFloorOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('siteDetail.createFirstFloor')}
          </Button>
        </CardContent>

        <AddFloorModal
          siteId={siteId}
          open={isAddFloorOpen}
          onOpenChange={setIsAddFloorOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
            setIsAddFloorOpen(false);
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsAddFloorOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('siteDetail.addFloor')}
        </Button>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {structure.map((floor) => (
          <AccordionItem 
            key={floor.id} 
            value={floor.id}
            className="border rounded-lg px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <Layers className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {floor.name}
                  {floor.level !== null && (
                    <span className="text-muted-foreground ml-2">
                      ({t('siteDetail.floorLevel')} {floor.level})
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground ml-auto mr-4">
                  {floor.areas.length} {t('siteDetail.areas').toLowerCase()}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4">
              <div className="flex justify-between items-center mb-3 pl-8">
                <span className="text-sm text-muted-foreground">
                  {t('siteDetail.areas')}
                </span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleAddArea(floor.id)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {t('siteDetail.addArea')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => deleteFloorMutation.mutate(floor.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {floor.areas.length === 0 ? (
                <p className="text-sm text-muted-foreground pl-8">
                  {t('siteDetail.noAreas')}
                </p>
              ) : (
                <Accordion type="multiple" className="pl-8 space-y-1">
                  {floor.areas.map((area) => (
                    <AccordionItem 
                      key={area.id} 
                      value={area.id}
                      className="border rounded-md px-3"
                    >
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-3 flex-1">
                          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{area.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto mr-4">
                            {area.capture_points.length} {t('siteDetail.points').toLowerCase()}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1 pb-3">
                        <div className="flex justify-between items-center mb-2 pl-7">
                          <span className="text-xs text-muted-foreground">
                            {t('siteDetail.points')}
                          </span>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleAddPoint(area.id)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              {t('siteDetail.addPoint')}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {t('common.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => deleteAreaMutation.mutate(area.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t('common.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {area.capture_points.length === 0 ? (
                          <p className="text-xs text-muted-foreground pl-7">
                            {t('siteDetail.noPoints')}
                          </p>
                        ) : (
                          <div className="space-y-1 pl-7">
                            {area.capture_points.map((point) => (
                              <div 
                                key={point.id}
                                className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group"
                              >
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm font-mono">{point.code}</span>
                                  {point.description && (
                                    <span className="text-xs text-muted-foreground">
                                      - {point.description}
                                    </span>
                                  )}
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                    >
                                      <MoreVertical className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      {t('common.edit')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      className="text-destructive"
                                      onClick={() => deletePointMutation.mutate(point.id)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {t('common.delete')}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <AddFloorModal
        siteId={siteId}
        open={isAddFloorOpen}
        onOpenChange={setIsAddFloorOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setIsAddFloorOpen(false);
        }}
      />

      <AddAreaModal
        floorId={selectedFloorId}
        open={isAddAreaOpen}
        onOpenChange={setIsAddAreaOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setIsAddAreaOpen(false);
        }}
      />

      <AddPointModal
        areaId={selectedAreaId}
        open={isAddPointOpen}
        onOpenChange={setIsAddPointOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setIsAddPointOpen(false);
        }}
      />
    </div>
  );
}
