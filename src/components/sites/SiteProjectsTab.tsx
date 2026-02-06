import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Map, Building2, Columns3, Droplets, Wind, Zap, Flame, Radio, FileStack,
  Plus, ArrowLeft, Eye, Download, Trash2, FileText, Brain, GitCompareArrows, Loader2,
} from 'lucide-react';
import { UploadProjectModal } from './UploadProjectModal';
import { ProjectViewer } from './ProjectViewer';
import { ProjectConflictsSummary } from './ProjectConflictsSummary';
import { ProjectConflictsDetail } from './ProjectConflictsDetail';
import { CompareProjectsModal } from './CompareProjectsModal';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ProjectSpecialty = Database['public']['Enums']['project_specialty'];

interface SiteProjectsTabProps {
  siteId: string;
  orgId: string;
}

const SPECIALTIES: { key: ProjectSpecialty; icon: React.ElementType; color: string }[] = [
  { key: 'topography', icon: Map, color: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'architecture', icon: Building2, color: 'text-blue-600 dark:text-blue-400' },
  { key: 'structure', icon: Columns3, color: 'text-orange-600 dark:text-orange-400' },
  { key: 'plumbing', icon: Droplets, color: 'text-cyan-600 dark:text-cyan-400' },
  { key: 'hvac', icon: Wind, color: 'text-violet-600 dark:text-violet-400' },
  { key: 'electrical', icon: Zap, color: 'text-yellow-600 dark:text-yellow-400' },
  { key: 'gas', icon: Flame, color: 'text-red-600 dark:text-red-400' },
  { key: 'telecom', icon: Radio, color: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'other', icon: FileStack, color: 'text-muted-foreground' },
];

const SPECIALTY_LABELS: Record<ProjectSpecialty, string> = {
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

const ANALYSIS_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  analyzing: 'bg-info/20 text-info',
  completed: 'bg-success/20 text-success',
  failed: 'bg-destructive/20 text-destructive',
};

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  analyzing: 'A analisar',
  completed: 'Concluída',
  failed: 'Falhou',
};

export function SiteProjectsTab({ siteId, orgId }: SiteProjectsTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedSpecialty, setSelectedSpecialty] = useState<ProjectSpecialty | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [viewingProject, setViewingProject] = useState<string | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [compareProject, setCompareProject] = useState<{ id: string; name: string } | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('site_id', siteId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ['project-conflicts', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_conflicts')
        .select('*')
        .eq('site_id', siteId);
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', siteId] });
      toast.success('Projecto eliminado');
    },
    onError: () => toast.error('Erro ao eliminar projecto'),
  });

  const handleAnalyze = async (projectId: string) => {
    setAnalyzingIds(prev => new Set(prev).add(projectId));
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze-project', {
        body: { projectId, analysisType: 'full' },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['projects', siteId] });
      queryClient.invalidateQueries({ queryKey: ['project-elements'] });
      toast.success(`Análise concluída: ${data?.elements_count || 0} elementos detectados`);
    } catch (err: any) {
      toast.error('Erro na análise', { description: err.message });
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(projectId); return s; });
    }
  };

  const countsBySpecialty = SPECIALTIES.reduce((acc, s) => {
    acc[s.key] = projects.filter(p => p.specialty === s.key).length;
    return acc;
  }, {} as Record<ProjectSpecialty, number>);

  const conflictsByProject = (projectId: string) =>
    conflicts.filter(c =>
      (c.project1_id === projectId || c.project2_id === projectId) &&
      c.status !== 'resolved' && c.status !== 'dismissed'
    ).length;

  const filteredProjects = selectedSpecialty
    ? projects.filter(p => p.specialty === selectedSpecialty)
    : projects;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  // Grid view
  if (!selectedSpecialty) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Projectos</h3>
            <p className="text-sm text-muted-foreground">{projects.length} documento(s) carregado(s)</p>
          </div>
          <Button onClick={() => setIsUploadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Carregar Projecto
          </Button>
        </div>

        <ProjectConflictsSummary siteId={siteId} conflicts={conflicts} />

        <ProjectConflictsDetail
          siteId={siteId}
          orgId={orgId}
          conflicts={conflicts}
          projects={projects.map(p => ({ id: p.id, name: p.name, specialty: p.specialty }))}
          onViewProject={setViewingProject}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SPECIALTIES.map(({ key, icon: Icon, color }) => {
            const count = countsBySpecialty[key];
            const latest = projects.find(p => p.specialty === key && p.is_current_version);
            return (
              <Card
                key={key}
                className="cursor-pointer hover:shadow-md hover:border-accent/40 transition-all"
                onClick={() => setSelectedSpecialty(key)}
              >
                <CardContent className="p-5 flex flex-col items-center gap-3 text-center">
                  <div className={`p-3 rounded-xl bg-muted/50 ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{SPECIALTY_LABELS[key]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {count} documento{count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {latest && (
                    <Badge variant="outline" className="text-xs">
                      v{latest.version || '1'}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <UploadProjectModal
          open={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          siteId={siteId}
          orgId={orgId}
        />

        {viewingProject && (
          <ProjectViewer
            projectId={viewingProject}
            open={!!viewingProject}
            onClose={() => setViewingProject(null)}
            siteId={siteId}
          />
        )}
      </div>
    );
  }

  // List view for selected specialty
  const spec = SPECIALTIES.find(s => s.key === selectedSpecialty)!;
  const SpecIcon = spec.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedSpecialty(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={`p-2 rounded-lg bg-muted/50 ${spec.color}`}>
            <SpecIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{SPECIALTY_LABELS[selectedSpecialty]}</h3>
            <p className="text-sm text-muted-foreground">{filteredProjects.length} documento(s)</p>
          </div>
        </div>
        <Button onClick={() => setIsUploadOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Carregar Projecto
        </Button>
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Sem projectos nesta especialidade</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Carregar Primeiro Projecto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Piso/Zona</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Análise</TableHead>
                <TableHead>Conflitos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map(project => {
                const cCount = conflictsByProject(project.id);
                const isAnalyzing = analyzingIds.has(project.id);
                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="text-muted-foreground">{project.floor_or_zone || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{project.version || '1'}</span>
                        {project.is_current_version && (
                          <Badge variant="success" className="text-[10px]">Actual</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(project.uploaded_at), 'dd MMM yyyy', { locale: pt })}
                    </TableCell>
                    <TableCell>
                      <Badge className={ANALYSIS_STATUS_STYLES[project.analysis_status] || ''} variant="outline">
                        {isAnalyzing ? 'A analisar...' : (ANALYSIS_STATUS_LABELS[project.analysis_status] || project.analysis_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cCount > 0 ? (
                        <Badge variant="destructive">{cCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Analisar com IA"
                          onClick={() => handleAnalyze(project.id)}
                          disabled={isAnalyzing}
                        >
                          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Comparar"
                          onClick={() => setCompareProject({ id: project.id, name: project.name })}
                        >
                          <GitCompareArrows className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setViewingProject(project.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {project.file_url && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={project.file_url} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Eliminar este projecto?')) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <UploadProjectModal
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        siteId={siteId}
        orgId={orgId}
        preSelectedSpecialty={selectedSpecialty}
      />

      {viewingProject && (
        <ProjectViewer
          projectId={viewingProject}
          open={!!viewingProject}
          onClose={() => setViewingProject(null)}
          siteId={siteId}
        />
      )}

      {compareProject && (
        <CompareProjectsModal
          open={!!compareProject}
          onOpenChange={(v) => { if (!v) setCompareProject(null); }}
          siteId={siteId}
          sourceProjectId={compareProject.id}
          sourceProjectName={compareProject.name}
          projects={projects.map(p => ({ id: p.id, name: p.name, specialty: p.specialty }))}
        />
      )}
    </div>
  );
}
