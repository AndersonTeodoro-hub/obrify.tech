import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, CheckCircle2, XCircle, FileWarning, Eye,
  ChevronDown, ChevronUp, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { GenerateCompatReportModal } from './GenerateCompatReportModal';

interface Conflict {
  id: string;
  conflict_type: string;
  severity: string;
  title: string;
  description: string | null;
  location_description: string | null;
  ai_confidence: number | null;
  status: string;
  project1_id: string;
  project2_id: string;
  related_nc_id: string | null;
  detected_at: string;
}

interface ProjectConflictsDetailProps {
  siteId: string;
  orgId: string;
  conflicts: Conflict[];
  projects: Array<{ id: string; name: string; specialty: string }>;
  onViewProject?: (projectId: string) => void;
}

const SEVERITY_CONFIG: Record<string, { label: string; variant: 'critical' | 'high' | 'medium' | 'low' }> = {
  critical: { label: 'Crítico', variant: 'critical' },
  high: { label: 'Alto', variant: 'high' },
  medium: { label: 'Médio', variant: 'medium' },
  low: { label: 'Baixo', variant: 'low' },
};

const TYPE_LABELS: Record<string, string> = {
  spatial_overlap: 'Sobreposição Espacial',
  dimension_mismatch: 'Cotas Diferentes',
  missing_provision: 'Provisão em Falta',
  code_violation: 'Violação de Norma',
};

const STATUS_LABELS: Record<string, string> = {
  detected: 'Detectado',
  confirmed: 'Confirmado',
  dismissed: 'Descartado',
  resolved: 'Resolvido',
  nc_created: 'NC Criada',
};

export function ProjectConflictsDetail({
  siteId, orgId, conflicts, projects, onViewProject,
}: ProjectConflictsDetailProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const active = conflicts.filter(c => !['resolved', 'dismissed'].includes(c.status));

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const update: Record<string, unknown> = { status };
      if (status === 'resolved' || status === 'dismissed') {
        update.resolved_by = user?.id;
        update.resolved_at = new Date().toISOString();
        if (notes) update.resolution_notes = notes;
      }
      const { error } = await supabase.from('project_conflicts').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-conflicts', siteId] });
      toast.success('Estado do conflito actualizado');
    },
    onError: () => toast.error('Erro ao actualizar conflito'),
  });

  const createNCMutation = useMutation({
    mutationFn: async (conflict: Conflict) => {
      const { error } = await supabase
        .from('project_conflicts')
        .update({ status: 'nc_created' })
        .eq('id', conflict.id);
      if (error) throw error;
      return { conflictId: conflict.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-conflicts', siteId] });
      toast.success('Conflito marcado como NC criada');
    },
    onError: () => toast.error('Erro ao criar NC'),
  });

  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || '—';

  // Empty state
  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
        <CheckCircle2 className="h-12 w-12 text-success mb-3" />
        <p className="text-sm font-medium text-foreground">Sem incompatibilidades detectadas</p>
        <p className="text-xs text-muted-foreground mt-1">Todos os projectos estão compatibilizados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Conflitos Detectados ({active.length})
        </h4>
        <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Gerar Relatório
        </Button>
      </div>

      <GenerateCompatReportModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        siteId={siteId}
        orgId={orgId}
      />

      {active.map((conflict, idx) => {
        const sev = SEVERITY_CONFIG[conflict.severity];
        const isExpanded = expandedId === conflict.id;

        return (
          <Card key={conflict.id} className="border-l-4 animate-fade-in" style={{
            animationDelay: `${idx * 50}ms`,
            borderLeftColor: conflict.severity === 'critical' ? 'hsl(var(--destructive))' :
              conflict.severity === 'high' ? '#f59e0b' :
              conflict.severity === 'medium' ? 'hsl(var(--info, 210 100% 50%))' : 'hsl(var(--muted-foreground))',
          }}>
            <CardContent className="p-4">
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : conflict.id)}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sev?.variant || 'outline'}>{sev?.label || conflict.severity}</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[conflict.conflict_type] || conflict.conflict_type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABELS[conflict.status] || conflict.status}
                    </Badge>
                    {conflict.ai_confidence != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(conflict.ai_confidence * 100)}% confiança
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm text-foreground">{conflict.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {getProjectName(conflict.project1_id)} ↔ {getProjectName(conflict.project2_id)}
                  </p>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-3">
                  {conflict.description && (
                    <p className="text-sm text-muted-foreground">{conflict.description}</p>
                  )}
                  {conflict.location_description && (
                    <p className="text-xs text-muted-foreground">📍 {conflict.location_description}</p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {onViewProject && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onViewProject(conflict.project1_id)}>
                          <Eye className="mr-1 h-3 w-3" /> Planta 1
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onViewProject(conflict.project2_id)}>
                          <Eye className="mr-1 h-3 w-3" /> Planta 2
                        </Button>
                      </>
                    )}

                    {conflict.status === 'detected' && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateStatusMutation.mutate({ id: conflict.id, status: 'confirmed' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStatusMutation.mutate({ id: conflict.id, status: 'dismissed' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Descartar
                        </Button>
                      </>
                    )}

                    {(conflict.status === 'detected' || conflict.status === 'confirmed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => createNCMutation.mutate(conflict)}
                        disabled={createNCMutation.isPending}
                      >
                        <FileWarning className="mr-1 h-3 w-3" /> Criar NC
                      </Button>
                    )}

                    {conflict.status === 'confirmed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: conflict.id, status: 'resolved' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Marcar Resolvido
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
