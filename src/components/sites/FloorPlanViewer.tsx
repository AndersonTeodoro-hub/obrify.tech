import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ZoomIn, ZoomOut, RotateCcw, Pencil, Eye, Plus, X, Loader2, MapPin, Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Esquema de cores por tipo de elemento
const ELEMENT_COLORS: Record<string, { color: string; label: string }> = {
  sapata: { color: '#EF4444', label: 'Sapata' },
  pilar: { color: '#3B82F6', label: 'Pilar' },
  viga: { color: '#22C55E', label: 'Viga' },
  laje: { color: '#A855F7', label: 'Laje' },
  muro: { color: '#F97316', label: 'Muro' },
  caixa_visita: { color: '#06B6D4', label: 'Caixa de Visita' },
  generico: { color: '#6B7280', label: 'Genérico' },
};

const ELEMENT_TYPES = Object.keys(ELEMENT_COLORS);

interface CapturePoint {
  id: string;
  code: string;
  description: string | null;
  area_id: string;
  pos_x: number | null;
  pos_y: number | null;
  element_type?: string | null;
  color?: string | null;
}

interface FloorPlanViewerProps {
  siteId: string;
  floorId: string;
  floorName: string;
}

export function FloorPlanViewer({ siteId, floorId, floorName }: FloorPlanViewerProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Zoom e pan
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Modo edição
  const [editMode, setEditMode] = useState(false);
  const [showNewPointModal, setShowNewPointModal] = useState(false);
  const [newPointPos, setNewPointPos] = useState({ x: 0, y: 0 });
  const [newPointCode, setNewPointCode] = useState('');
  const [newPointType, setNewPointType] = useState('generico');
  const [newPointAreaId, setNewPointAreaId] = useState('');
  const [savingPoint, setSavingPoint] = useState(false);

  // Drag de ponto
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);

  // Análise IA
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyzeWithAI = async () => {
    if (!floorPlan?.id) {
      toast.error('Sem planta carregada para analisar');
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('eng-silva-analyze-floorplan', {
        body: {
          floor_plan_file_id: floorPlan.id,
          floor_id: floorId,
          site_id: siteId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha na análise');
      toast.success(`Eng. Silva detectou ${data.inserted} elementos`, {
        description: data.summary,
      });
      queryClient.invalidateQueries({ queryKey: ['floor-capture-points', floorId] });
      queryClient.invalidateQueries({ queryKey: ['floor-areas-plan', floorId] });
      queryClient.invalidateQueries({ queryKey: ['site-structure'] });
    } catch (err: any) {
      toast.error('Erro na análise: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setAnalyzing(false);
    }
  };

  // Ponto seleccionado
  const [selectedPoint, setSelectedPoint] = useState<CapturePoint | null>(null);

  // Filtros de legenda
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  // Buscar planta do floor
  const { data: floorPlan, isLoading: loadingPlan } = useQuery({
    queryKey: ['floor-plan', floorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_files')
        .select('id, file_path, name, mime_type')
        .eq('floor_id', floorId)
        .eq('type', 'planta_piso')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) return null;
      return data;
    },
  });

  // Signed URL da imagem
  const { data: imageUrl } = useQuery({
    queryKey: ['floor-plan-url', floorPlan?.file_path],
    queryFn: async () => {
      if (!floorPlan?.file_path) return null;
      const { data, error } = await supabase.storage
        .from('project-files')
        .createSignedUrl(floorPlan.file_path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!floorPlan?.file_path,
  });

  // Buscar áreas do floor
  const { data: areas = [] } = useQuery({
    queryKey: ['floor-areas-plan', floorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('areas')
        .select('id, name')
        .eq('floor_id', floorId)
        .order('name');
      return data || [];
    },
  });

  // Buscar pontos de captura de todas as áreas do floor
  const { data: capturePoints = [] } = useQuery({
    queryKey: ['floor-capture-points', floorId],
    queryFn: async () => {
      const areaIds = areas.map(a => a.id);
      if (areaIds.length === 0) return [];

      const { data } = await supabase
        .from('capture_points')
        .select('id, code, description, area_id, pos_x, pos_y, element_type, color')
        .in('area_id', areaIds);

      return (data || []) as CapturePoint[];
    },
    enabled: areas.length > 0,
  });

  // Buscar contagem de capturas por ponto
  const { data: captureCounts = {} } = useQuery({
    queryKey: ['point-capture-counts', floorId],
    queryFn: async () => {
      const pointIds = capturePoints.map(p => p.id);
      if (pointIds.length === 0) return {};

      const { data } = await supabase
        .from('captures')
        .select('capture_point_id')
        .in('capture_point_id', pointIds);

      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => {
        counts[c.capture_point_id] = (counts[c.capture_point_id] || 0) + 1;
      });
      return counts;
    },
    enabled: capturePoints.length > 0,
  });

  // Pontos com coordenadas, filtrados por tipo
  const visiblePoints = capturePoints.filter(p =>
    p.pos_x !== null && p.pos_y !== null &&
    !hiddenTypes.has(p.element_type || 'generico')
  );

  // Cor do ponto
  const getPointColor = (point: CapturePoint): string => {
    if (point.color) return point.color;
    const type = point.element_type || 'generico';
    return ELEMENT_COLORS[type]?.color || ELEMENT_COLORS.generico.color;
  };

  // Zoom
  const handleZoom = (delta: number) => {
    setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
  }, []);

  // Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (editMode && !e.shiftKey) return; // Em modo edição, shift+drag para pan
    setIsPanning(true);
    setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingPointId && containerRef.current && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      // Actualização visual imediata — sem guardar na BD ainda
      const el = document.getElementById(`marker-${draggingPointId}`);
      if (el) {
        el.style.left = `${Math.max(0, Math.min(100, x))}%`;
        el.style.top = `${Math.max(0, Math.min(100, y))}%`;
      }
      return;
    }

    if (!isPanning) return;
    setOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart, draggingPointId]);

  const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (draggingPointId && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      const { error } = await supabase
        .from('capture_points')
        .update({ pos_x: parseFloat(x.toFixed(2)), pos_y: parseFloat(y.toFixed(2)) })
        .eq('id', draggingPointId);

      if (error) {
        toast.error('Erro ao mover ponto');
      } else {
        queryClient.invalidateQueries({ queryKey: ['floor-capture-points', floorId] });
      }
      setDraggingPointId(null);
      return;
    }

    setIsPanning(false);
  }, [draggingPointId, floorId, queryClient]);

  // Click na planta para criar ponto (modo edição)
  const handlePlanClick = (e: React.MouseEvent) => {
    if (!editMode || isPanning || draggingPointId) return;
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (x < 0 || x > 100 || y < 0 || y > 100) return;

    setNewPointPos({ x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) });
    setNewPointCode('');
    setNewPointType('generico');
    setNewPointAreaId(areas[0]?.id || '');
    setShowNewPointModal(true);
  };

  // Guardar novo ponto
  const handleSaveNewPoint = async () => {
    if (!newPointCode.trim() || !newPointAreaId) return;

    setSavingPoint(true);
    try {
      const color = ELEMENT_COLORS[newPointType]?.color || ELEMENT_COLORS.generico.color;

      const { error } = await supabase
        .from('capture_points')
        .insert({
          area_id: newPointAreaId,
          code: newPointCode.trim(),
          element_type: newPointType,
          color,
          pos_x: newPointPos.x,
          pos_y: newPointPos.y,
          point_source: 'manual',
        });

      if (error) throw error;

      toast.success(`Ponto ${newPointCode} criado`);
      setShowNewPointModal(false);
      queryClient.invalidateQueries({ queryKey: ['floor-capture-points', floorId] });
      queryClient.invalidateQueries({ queryKey: ['site-structure'] });
    } catch (err: any) {
      toast.error('Erro ao criar ponto: ' + (err.message || 'Erro'));
    } finally {
      setSavingPoint(false);
    }
  };

  // Toggle legenda
  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Tipos presentes nos pontos actuais
  const presentTypes = [...new Set(capturePoints.map(p => p.element_type || 'generico'))];

  if (loadingPlan) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!floorPlan || !imageUrl) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MapPin className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            Nenhuma planta carregada para {floorName}.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Use o botão "Planta" na tab Estrutura para carregar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleZoom(0.25)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleZoom(-0.25)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="text-xs">{Math.round(scale * 100)}%</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {visiblePoints.length} pontos
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyzeWithAI}
            disabled={analyzing || !floorPlan?.id}
          >
            {analyzing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Eng. Silva: Detectar Elementos
          </Button>
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? (
              <>
                <Eye className="mr-1 h-3.5 w-3.5" />
                Visualizar
              </>
            ) : (
              <>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Editar
              </>
            )}
          </Button>
        </div>
      </div>

      {editMode && (
        <p className="text-xs text-amber-600 bg-amber-500/10 rounded-md px-3 py-1.5 border border-amber-500/20">
          Modo edição: clique na planta para criar um ponto. Arraste marcadores para reposicionar.
        </p>
      )}

      {/* Área da planta */}
      <div className="flex gap-3">
        <div
          ref={containerRef}
          className={cn(
            'flex-1 relative overflow-hidden rounded-lg border bg-muted/30',
            editMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          )}
          style={{ height: '65vh' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsPanning(false); setDraggingPointId(null); }}
        >
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isPanning || draggingPointId ? 'none' : 'transform 0.2s',
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Imagem da planta */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={floorName}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
              onClick={handlePlanClick}
            />

            {/* Marcadores sobrepostos */}
            {imageRef.current && visiblePoints.map(point => {
              const color = getPointColor(point);
              const count = captureCounts[point.id] || 0;
              const isSelected = selectedPoint?.id === point.id;

              return (
                <div
                  key={point.id}
                  id={`marker-${point.id}`}
                  className={cn(
                    'absolute flex flex-col items-center pointer-events-auto',
                    editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                    isSelected && 'z-20'
                  )}
                  style={{
                    left: `${point.pos_x}%`,
                    top: `${point.pos_y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!editMode) setSelectedPoint(isSelected ? null : point);
                  }}
                  onMouseDown={(e) => {
                    if (editMode) {
                      e.stopPropagation();
                      setDraggingPointId(point.id);
                    }
                  }}
                >
                  {/* Marcador circular */}
                  <div
                    className={cn(
                      'rounded-full flex items-center justify-center border-2 border-white shadow-lg transition-transform',
                      isSelected ? 'scale-125' : 'hover:scale-110'
                    )}
                    style={{
                      backgroundColor: color,
                      width: '28px',
                      height: '28px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'white',
                    }}
                  >
                    {point.code.length <= 4 ? point.code : point.code.slice(0, 3)}
                  </div>

                  {/* Label + contagem */}
                  <div
                    className="mt-0.5 px-1 rounded text-center whitespace-nowrap"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      fontSize: '9px',
                      color: 'white',
                      lineHeight: '14px',
                    }}
                  >
                    {point.code}{count > 0 && ` (${count})`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel lateral: info do ponto ou legenda */}
        <div className="w-56 shrink-0 space-y-3">
          {/* Legenda */}
          <Card>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Legenda</p>
              {presentTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem pontos</p>
              ) : (
                presentTypes.map(type => {
                  const info = ELEMENT_COLORS[type] || ELEMENT_COLORS.generico;
                  const hidden = hiddenTypes.has(type);
                  const count = capturePoints.filter(p => (p.element_type || 'generico') === type).length;
                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1 rounded text-xs transition-opacity',
                        hidden ? 'opacity-40' : 'opacity-100',
                        'hover:bg-muted/50'
                      )}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/50"
                        style={{ backgroundColor: info.color }}
                      />
                      <span className="flex-1 text-left">{info.label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Info do ponto seleccionado */}
          {selectedPoint && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getPointColor(selectedPoint) }}
                    />
                    <span className="font-mono font-bold text-sm">{selectedPoint.code}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setSelectedPoint(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                {selectedPoint.description && (
                  <p className="text-xs text-muted-foreground">{selectedPoint.description}</p>
                )}

                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>{ELEMENT_COLORS[selectedPoint.element_type || 'generico']?.label || 'Genérico'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Posição</span>
                    <span>({selectedPoint.pos_x?.toFixed(1)}%, {selectedPoint.pos_y?.toFixed(1)}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capturas</span>
                    <span>{captureCounts[selectedPoint.id] || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Área</span>
                    <span>{areas.find(a => a.id === selectedPoint.area_id)?.name || '—'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal para novo ponto */}
      <Dialog open={showNewPointModal} onOpenChange={setShowNewPointModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Ponto de Captura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input
                value={newPointCode}
                onChange={(e) => setNewPointCode(e.target.value)}
                placeholder="Ex: S1, P3, V2"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de elemento</Label>
              <Select value={newPointType} onValueChange={setNewPointType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELEMENT_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: ELEMENT_COLORS[type].color }}
                        />
                        {ELEMENT_COLORS[type].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Área *</Label>
              <Select value={newPointAreaId} onValueChange={setNewPointAreaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar área" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map(area => (
                    <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Posição: ({newPointPos.x.toFixed(1)}%, {newPointPos.y.toFixed(1)}%)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPointModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveNewPoint}
              disabled={!newPointCode.trim() || !newPointAreaId || savingPoint}
            >
              {savingPoint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Ponto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
