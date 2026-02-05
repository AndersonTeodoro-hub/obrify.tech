import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
  FolderOpen,
  GripVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { AddFloorModal } from './AddFloorModal';
import { AddAreaModal } from './AddAreaModal';
import { AddPointModal } from './AddPointModal';
import { EditFloorModal } from './EditFloorModal';
import { EditAreaModal } from './EditAreaModal';
import { EditPointModal } from './EditPointModal';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface SiteStructureTabProps {
  siteId: string;
}

interface Floor {
  id: string;
  name: string;
  level: number | null;
  description?: string | null;
  areas: Area[];
}

interface Area {
  id: string;
  name: string;
  floor_id: string;
  type?: string | null;
  capture_points: CapturePoint[];
}

interface CapturePoint {
  id: string;
  code: string;
  description: string | null;
  area_id: string;
  pos_x?: number | null;
  pos_y?: number | null;
}

type DeleteTarget = 
  | { type: 'floor'; item: Floor }
  | { type: 'area'; item: Area }
  | { type: 'point'; item: CapturePoint }
  | null;

export function SiteStructureTab({ siteId }: SiteStructureTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  // Add modals state
  const [isAddFloorOpen, setIsAddFloorOpen] = useState(false);
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [isAddPointOpen, setIsAddPointOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  // Edit modals state
  const [editFloor, setEditFloor] = useState<Floor | null>(null);
  const [editArea, setEditArea] = useState<Area | null>(null);
  const [editPoint, setEditPoint] = useState<CapturePoint | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  // Drag and drop state
  const [draggedFloorId, setDraggedFloorId] = useState<string | null>(null);

  const { data: structure, isLoading } = useQuery({
    queryKey: ['site-structure', siteId],
    queryFn: async () => {
      // Fetch floors with description
      const { data: floors, error: floorsError } = await supabase
        .from('floors')
        .select('id, name, level, description')
        .eq('site_id', siteId)
        .order('level', { ascending: true });
      
      if (floorsError) throw floorsError;

      // Fetch areas with type for all floors
      const floorIds = floors?.map(f => f.id) || [];
      const { data: areas, error: areasError } = await supabase
        .from('areas')
        .select('id, name, floor_id, type')
        .in('floor_id', floorIds.length > 0 ? floorIds : ['']);
      
      if (areasError) throw areasError;

      // Fetch capture points with coordinates for all areas
      const areaIds = areas?.map(a => a.id) || [];
      const { data: points, error: pointsError } = await supabase
        .from('capture_points')
        .select('id, code, description, area_id, pos_x, pos_y')
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

  // Delete mutations
  const deleteFloorMutation = useMutation({
    mutationFn: async (floorId: string) => {
      const { error } = await supabase.from('floors').delete().eq('id', floorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
      toast.success(t('siteDetail.floorDeleted'));
      setDeleteTarget(null);
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
      setDeleteTarget(null);
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
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; level: number }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from('floors')
          .update({ level: update.level })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
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

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    
    switch (deleteTarget.type) {
      case 'floor':
        deleteFloorMutation.mutate(deleteTarget.item.id);
        break;
      case 'area':
        deleteAreaMutation.mutate(deleteTarget.item.id);
        break;
      case 'point':
        deletePointMutation.mutate(deleteTarget.item.id);
        break;
    }
  };

  const getDeleteDescription = () => {
    if (!deleteTarget) return '';
    
    switch (deleteTarget.type) {
      case 'floor':
        return t('siteDetail.deleteFloorConfirm', { name: deleteTarget.item.name });
      case 'area':
        return t('siteDetail.deleteAreaConfirm', { name: deleteTarget.item.name });
      case 'point':
        return t('siteDetail.deletePointConfirm', { code: deleteTarget.item.code });
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, floorId: string) => {
    setDraggedFloorId(floorId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', floorId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetFloorId: string) => {
    e.preventDefault();
    
    if (!draggedFloorId || draggedFloorId === targetFloorId || !structure) {
      setDraggedFloorId(null);
      return;
    }

    const draggedIndex = structure.findIndex(f => f.id === draggedFloorId);
    const targetIndex = structure.findIndex(f => f.id === targetFloorId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedFloorId(null);
      return;
    }

    // Create new order
    const newOrder = [...structure];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItem);

    // Update levels
    const updates = newOrder.map((floor, index) => ({
      id: floor.id,
      level: index,
    }));

    reorderMutation.mutate(updates);
    setDraggedFloorId(null);
  }, [draggedFloorId, structure, reorderMutation]);

  const handleDragEnd = useCallback(() => {
    setDraggedFloorId(null);
  }, []);

  const getAreaTypeLabel = (type: string | null | undefined) => {
    if (!type) return null;
    return t(`siteDetail.areaTypes.${type}`);
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
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {t('siteDetail.dragToReorder')}
        </p>
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
            className={`border rounded-lg px-4 transition-colors ${
              draggedFloorId === floor.id ? 'opacity-50' : ''
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, floor.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, floor.id)}
            onDragEnd={handleDragEnd}
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
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
              {floor.description && (
                <p className="text-sm text-muted-foreground mb-3 pl-8">
                  {floor.description}
                </p>
              )}
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
                      <DropdownMenuItem onClick={() => setEditFloor(floor)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => setDeleteTarget({ type: 'floor', item: floor })}
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
                          {area.type && area.type !== 'other' && (
                            <Badge variant="secondary" className="text-xs">
                              {getAreaTypeLabel(area.type)}
                            </Badge>
                          )}
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
                                <DropdownMenuItem onClick={() => setEditArea(area)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {t('common.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget({ type: 'area', item: area })}
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
                                  {(point.pos_x !== null || point.pos_y !== null) && (
                                    <Badge variant="outline" className="text-xs">
                                      ({point.pos_x ?? 0}, {point.pos_y ?? 0})
                                    </Badge>
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
                                    <DropdownMenuItem onClick={() => setEditPoint(point)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      {t('common.edit')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      className="text-destructive"
                                      onClick={() => setDeleteTarget({ type: 'point', item: point })}
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

      {/* Add Modals */}
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

      {/* Edit Modals */}
      <EditFloorModal
        floor={editFloor}
        open={!!editFloor}
        onOpenChange={(open) => !open && setEditFloor(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setEditFloor(null);
        }}
      />

      <EditAreaModal
        area={editArea}
        open={!!editArea}
        onOpenChange={(open) => !open && setEditArea(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setEditArea(null);
        }}
      />

      <EditPointModal
        point={editPoint}
        open={!!editPoint}
        onOpenChange={(open) => !open && setEditPoint(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['site-structure', siteId] });
          setEditPoint(null);
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('siteDetail.deleteConfirmTitle')}
        description={getDeleteDescription()}
        onConfirm={handleDeleteConfirm}
        isPending={
          deleteFloorMutation.isPending || 
          deleteAreaMutation.isPending || 
          deletePointMutation.isPending
        }
      />
    </div>
  );
}
