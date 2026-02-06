import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download, X, ZoomIn, ZoomOut, RotateCcw,
  PanelRightClose, PanelRightOpen, AlertTriangle, Brain, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

interface ProjectViewerProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  siteId: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive/20 text-destructive',
  high: 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  medium: 'bg-info/20 text-info',
  low: 'bg-muted text-muted-foreground',
};

export function ProjectViewer({ projectId, open, onClose, siteId }: ProjectViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [panelOpen, setPanelOpen] = useState(true);
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: elements = [] } = useQuery({
    queryKey: ['project-elements', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_elements')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ['project-conflicts-viewer', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_conflicts')
        .select('*')
        .eq('site_id', siteId)
        .or(`project1_id.eq.${projectId},project2_id.eq.${projectId}`);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-analyze-project', {
        body: { projectId, analysisType: 'full' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-elements', projectId] });
      toast.success(`Análise concluída: ${data?.elements_count || 0} elementos detectados`);
    },
    onError: (err: Error) => toast.error('Erro na análise', { description: err.message }),
  });

  if (!project) return null;

  const isPdf = project.file_type?.includes('pdf');
  const isImage = project.file_type?.startsWith('image/');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex flex-row items-center justify-between">
          <DialogTitle className="text-base">{project.name}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              Analisar
            </Button>
            {isImage && (
              <>
                <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setZoom(1)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => setPanelOpen(!panelOpen)}>
              {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
            {project.file_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={project.file_url} download target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Main viewer */}
          <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center">
            {isPdf && project.file_url ? (
              <iframe src={project.file_url} className="w-full h-full border-0" title={project.name} />
            ) : isImage && project.file_url ? (
              <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
                <img
                  src={project.file_url}
                  alt={project.name}
                  className="max-w-none transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                />
              </div>
            ) : (
              <p className="text-muted-foreground">Pré-visualização indisponível</p>
            )}
          </div>

          {/* Side panel */}
          {panelOpen && (
            <ScrollArea className="w-80 border-l bg-background">
              <div className="p-4 space-y-5">
                {/* Metadata */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Metadados</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Versão</span>
                      <span className="font-medium">{project.version || '1'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Piso/Zona</span>
                      <span>{project.floor_or_zone || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo</span>
                      <span>{project.file_type || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tamanho</span>
                      <span>{project.file_size ? `${(project.file_size / 1024 / 1024).toFixed(1)} MB` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upload</span>
                      <span>{format(new Date(project.uploaded_at), 'dd MMM yyyy', { locale: pt })}</span>
                    </div>
                    {project.is_current_version && (
                      <Badge variant="success" className="text-xs">Versão Actual</Badge>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Analysis status */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Análise</h4>
                  <Badge variant="outline" className={
                    project.analysis_status === 'completed' ? 'bg-success/20 text-success' :
                    project.analysis_status === 'failed' ? 'bg-destructive/20 text-destructive' :
                    project.analysis_status === 'analyzing' ? 'bg-info/20 text-info' : ''
                  }>
                    {project.analysis_status === 'pending' ? 'Pendente' :
                     project.analysis_status === 'analyzing' ? 'A analisar' :
                     project.analysis_status === 'completed' ? 'Concluída' : 'Falhou'}
                  </Badge>
                  {project.analyzed_at && (
                    <p className="text-xs text-muted-foreground">
                      Analisado em {format(new Date(project.analyzed_at), 'dd MMM yyyy HH:mm', { locale: pt })}
                    </p>
                  )}
                </div>

                {/* Elements */}
                {elements.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Elementos ({elements.length})
                      </h4>
                      <div className="space-y-2">
                        {elements.slice(0, 20).map(el => (
                          <div key={el.id} className="text-xs p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{el.element_code || el.element_type}</span>
                              {el.confidence != null && (
                                <span className="text-muted-foreground">{Math.round(el.confidence * 100)}%</span>
                              )}
                            </div>
                            {el.location_description && (
                              <p className="text-muted-foreground mt-0.5">{el.location_description}</p>
                            )}
                          </div>
                        ))}
                        {elements.length > 20 && (
                          <p className="text-xs text-muted-foreground">+{elements.length - 20} mais</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Conflicts */}
                {conflicts.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Conflitos ({conflicts.length})
                      </h4>
                      <div className="space-y-2">
                        {conflicts.map(c => (
                          <div key={c.id} className="text-xs p-2 rounded-lg border border-destructive/20 bg-destructive/5">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={SEVERITY_STYLES[c.severity] || ''} variant="outline">
                                {c.severity}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                            </div>
                            <p className="font-medium">{c.title}</p>
                            {c.description && (
                              <p className="text-muted-foreground mt-0.5">{c.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {project.description && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">Descrição</h4>
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
