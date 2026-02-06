import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { GitCompareArrows, Loader2 } from 'lucide-react';

const SPECIALTY_LABELS: Record<string, string> = {
  topography: 'Topografia',
  architecture: 'Arquitectura',
  structure: 'Estruturas',
  plumbing: 'Águas e Esgotos',
  electrical: 'Electricidade',
  hvac: 'AVAC',
  gas: 'Gás',
  telecom: 'Telecomunicações',
  other: 'Outros',
};

interface CompareProjectsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  sourceProjectId: string;
  sourceProjectName: string;
  projects: Array<{ id: string; name: string; specialty: string }>;
}

export function CompareProjectsModal({
  open, onOpenChange, siteId, sourceProjectId, sourceProjectName, projects,
}: CompareProjectsModalProps) {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState('');

  const otherProjects = projects.filter(p => p.id !== sourceProjectId);

  const compareMutation = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error('Seleccione um projecto');
      const { data, error } = await supabase.functions.invoke('ai-compare-projects', {
        body: { project1Id: sourceProjectId, project2Id: targetId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-conflicts', siteId] });
      const count = data?.conflicts_count || 0;
      toast.success(
        count > 0
          ? `Comparação concluída: ${count} conflito(s) detectado(s)`
          : 'Comparação concluída: sem conflitos detectados'
      );
      onOpenChange(false);
      setTargetId('');
    },
    onError: (err: Error) => {
      toast.error('Erro na comparação', { description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTargetId(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" />
            Comparar Projectos
          </DialogTitle>
          <DialogDescription>
            Compare duas plantas para detectar incompatibilidades entre especialidades.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Projecto 1</Label>
            <div className="p-3 rounded-lg bg-muted/50 text-sm font-medium">{sourceProjectName}</div>
          </div>

          <div className="space-y-2">
            <Label>Projecto 2 *</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar projecto para comparar" />
              </SelectTrigger>
              <SelectContent>
                {otherProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {SPECIALTY_LABELS[p.specialty] || p.specialty}
                      </Badge>
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => compareMutation.mutate()}
            disabled={!targetId || compareMutation.isPending}
          >
            {compareMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                A comparar...
              </>
            ) : (
              <>
                <GitCompareArrows className="mr-2 h-4 w-4" />
                Comparar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
