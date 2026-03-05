import { useState, useCallback } from 'react';
import { useIncompaticheck } from './incompaticheck/useIncompaticheck';
import { PROJECT_TYPES } from './incompaticheck/types';
import type { Project } from './incompaticheck/types';
import { formatFileSize } from './incompaticheck/helpers';
import UploadModal from './incompaticheck/UploadModal';
import ShareModal from './incompaticheck/ShareModal';
import ObraRegistModal from './incompaticheck/ObraRegistModal';
import ObraListModal from './incompaticheck/ObraListModal';
import ProjectPreviewModal from './incompaticheck/ProjectPreviewModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  FileSearch,
  Upload,
  FileText,
  AlertTriangle,
  Download,
  Plus,
  Loader2,
  Building2,
  RotateCcw,
  Trash2,
  CheckCircle2,
  MapPin,
  Lightbulb,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types for the real AI analysis
interface AIFindingZone {
  description: string;
  x_percent: number;
  y_percent: number;
  radius_percent: number;
  source_project: string;
}

interface AIFinding {
  id: string;
  severity: 'alta' | 'media' | 'baixa';
  title: string;
  description: string;
  specialties: string[];
  location: string;
  recommendation: string;
  zone?: AIFindingZone;
}

interface AnalysisResult {
  findings: AIFinding[];
  analyzed_at: string;
  projects_analyzed: { name: string; type: string; size_mb: string }[];
  skipped_files?: { name: string; reason: string }[];
  strategy: string;
}

export default function IncompatiCheck() {
  const ic = useIncompaticheck();
  const [showObraModal, setShowObraModal] = useState(false);
  const [showObraList, setShowObraList] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [filter, setFilter] = useState('all');

  // Real AI analysis state
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  const handleCreateObra = async (info: { nome: string; cidade: string; fiscal: string }) => {
    const obra = await ic.createObra(info.nome, info.cidade, info.fiscal);
    if (obra) {
      await ic.selectObra(obra);
      setShowObraModal(false);
    }
  };

  const handleUpload = async (file: File, type: string) => {
    if (!ic.obraAtiva) return;
    await ic.uploadProject(file, type, ic.obraAtiva.id);
  };

  const handleRunAnalysis = async () => {
    if (!ic.obraAtiva) return;
    setAiAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const projectData = ic.projects.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        file_path: p.file_path,
      }));

      console.log('INCOMPATICHECK: Invoking analysis with', projectData.length, 'projects');

      const { data, error } = await supabase.functions.invoke('incompaticheck-analyze', {
        body: { projects: projectData },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log('INCOMPATICHECK: Analysis complete:', data);
      setAnalysisResult(data as AnalysisResult);

      // Persist to DB via existing hook flow
      await persistAnalysis(data as AnalysisResult);

      toast.success(`Análise concluída: ${data.findings.length} incompatibilidade(s) encontrada(s)`);
    } catch (err: any) {
      console.error('INCOMPATICHECK: Analysis error:', err);
      setAnalysisError(err.message || 'Erro na análise. Verifique os ficheiros e tente novamente.');
      toast.error('Erro na análise de incompatibilidades');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const persistAnalysis = async (result: AnalysisResult) => {
    if (!ic.obraAtiva) return;
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const altaCount = result.findings.filter(f => f.severity === 'alta').length;
      const mediaCount = result.findings.filter(f => f.severity === 'media').length;
      const baixaCount = result.findings.filter(f => f.severity === 'baixa').length;

      const { data: analysisRow } = await supabase
        .from('incompaticheck_analyses')
        .insert({
          user_id: user.user.id,
          obra_id: ic.obraAtiva.id,
          status: 'completed',
          total_projects: result.projects_analyzed.length,
          critical_count: altaCount,
          warning_count: mediaCount,
          info_count: baixaCount,
          completed_at: result.analyzed_at,
        })
        .select()
        .single();

      if (analysisRow && result.findings.length > 0) {
        const findingsToInsert = result.findings.map(f => ({
          analysis_id: (analysisRow as any).id,
          severity: f.severity === 'alta' ? 'critical' : f.severity === 'media' ? 'warning' : 'info',
          title: f.title,
          description: f.description,
          location: f.location || '',
          tags: f.specialties || [],
          resolved: false,
        }));

        await supabase.from('incompaticheck_findings').insert(findingsToInsert);
      }
    } catch (err) {
      console.error('INCOMPATICHECK: Failed to persist analysis:', err);
    }
  };

  const hasObra = !!ic.obraAtiva;
  const hasProjects = ic.projects.length > 0;
  const canAnalyze = ic.projects.length >= 2;

  // Group projects by type
  const projectsByType = ic.projects.reduce<Record<string, Project[]>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});

  // Filtered findings from AI result
  const filteredFindings = analysisResult?.findings.filter(
    f => !severityFilter || f.severity === severityFilter
  ) || [];

  const severityBadgeVariant = (s: string) =>
    s === 'alta' ? 'critical' : s === 'media' ? 'high' : 'success';

  const severityLabel = (s: string) =>
    s === 'alta' ? 'Alta' : s === 'media' ? 'Média' : 'Baixa';

  const altaCount = analysisResult?.findings.filter(f => f.severity === 'alta').length || 0;
  const mediaCount = analysisResult?.findings.filter(f => f.severity === 'media').length || 0;
  const baixaCount = analysisResult?.findings.filter(f => f.severity === 'baixa').length || 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/app">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>IncompatiCheck</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">IncompatiCheck</h1>
          <p className="text-sm text-muted-foreground mt-1">Análise de Incompatibilidades entre Projectos</p>
        </div>
        <Button
          variant="outline"
          onClick={() => ic.obras.length > 0 ? setShowObraList(true) : setShowObraModal(true)}
          className="gap-2"
        >
          <Building2 className="w-4 h-4" />
          {ic.obraAtiva?.nome || 'Selecionar Obra'}
        </Button>
      </div>

      {/* STATE: No obra selected */}
      {!hasObra && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <FileSearch className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Selecione uma obra para começar a análise</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Escolha uma obra existente ou registe uma nova para carregar projectos e analisar incompatibilidades.
            </p>
            <Button onClick={() => setShowObraModal(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Registar Nova Obra
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STATE: Obra selected, no projects */}
      {hasObra && !hasProjects && !aiAnalyzing && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-xs font-medium text-primary mb-2">Obra: {ic.obraAtiva?.nome}</p>
            <h2 className="text-lg font-semibold text-foreground mb-2">Carregue os projectos para análise</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Adicione ficheiros PDF dos projectos de especialidades para iniciar a análise de incompatibilidades.
            </p>
            <Button onClick={() => setShowUpload(true)} variant="accent" className="gap-2">
              <Plus className="w-4 h-4" />
              Carregar Projectos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STATE: Has projects (main working state) */}
      {hasObra && hasProjects && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Projects Panel (3 cols) */}
            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Projectos Carregados</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Carregar Projecto
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ic.projects.length} projecto{ic.projects.length !== 1 ? 's' : ''} na obra{' '}
                    <span className="font-medium text-primary">{ic.obraAtiva?.nome}</span>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(projectsByType).map(([type, projects]) => {
                    const typeConfig = PROJECT_TYPES[type];
                    return (
                      <div key={type}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{typeConfig?.icon}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {typeConfig?.label || type}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {projects.length}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          {projects.map(project => (
                            <div
                              key={project.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
                              onClick={() => setPreviewProject(project)}
                            >
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatFileSize(project.file_size)} · {format(new Date(project.created_at), "d MMM yyyy", { locale: pt })}
                                </p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); ic.deleteProject(project.id, project.file_path); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                                aria-label="Remover"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Right: Analysis Panel (2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Analyzing state */}
              {aiAnalyzing && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <h2 className="text-lg font-semibold text-foreground mb-2">A analisar incompatibilidades...</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Isto pode demorar 1-3 minutos dependendo do tamanho dos projectos.
                    </p>
                    <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      O Claude está a comparar todas as especialidades.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Error state */}
              {!aiAnalyzing && analysisError && (
                <Card className="border-destructive/50">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="w-10 h-10 text-destructive mb-3" />
                    <h3 className="text-sm font-semibold text-foreground mb-2">Erro na análise</h3>
                    <p className="text-xs text-muted-foreground mb-4 max-w-xs">{analysisError}</p>
                    <Button variant="outline" size="sm" onClick={handleRunAnalysis} className="gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" />
                      Tentar Novamente
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Ready to analyze */}
              {!aiAnalyzing && !analysisError && !analysisResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Análise</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!canAnalyze ? (
                      <div className="text-center py-8">
                        <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                          Carregue pelo menos 2 projectos de especialidades diferentes para analisar incompatibilidades.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-6 space-y-4">
                        <Button onClick={handleRunAnalysis} variant="accent" size="lg" className="w-full gap-2">
                          <FileSearch className="w-5 h-5" />
                          Analisar Incompatibilidades
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          A IA irá comparar os projectos carregados e identificar potenciais conflitos entre especialidades.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Results summary (right panel) */}
              {!aiAnalyzing && analysisResult && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-destructive">{altaCount}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Alta</p>
                    </Card>
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-amber-500">{mediaCount}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Média</p>
                    </Card>
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-emerald-500">{baixaCount}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Baixa</p>
                    </Card>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setAnalysisResult(null);
                      setAnalysisError(null);
                      setSeverityFilter(null);
                    }} className="gap-1.5 flex-1">
                      <RotateCcw className="w-3.5 h-3.5" />
                      Nova Análise
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowShare(true)} className="gap-1.5 flex-1">
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: null, label: `Todas (${analysisResult.findings.length})` },
                      { key: 'alta', label: `Alta (${altaCount})` },
                      { key: 'media', label: `Média (${mediaCount})` },
                      { key: 'baixa', label: `Baixa (${baixaCount})` },
                    ].map(f => (
                      <Button
                        key={f.key || 'all'}
                        variant={severityFilter === f.key ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setSeverityFilter(f.key)}
                        className="text-xs h-7"
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Analisado em {new Date(analysisResult.analyzed_at).toLocaleString('pt-PT')} · {analysisResult.projects_analyzed.length} projectos · Estratégia: {analysisResult.strategy === 'pairs' ? 'pares' : 'conjunta'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Skipped files warning */}
          {analysisResult && analysisResult.skipped_files && analysisResult.skipped_files.length > 0 && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Ficheiros não analisados: {analysisResult.skipped_files.map(f => f.name).join(', ')}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results: Full width findings list */}
          {!aiAnalyzing && analysisResult && filteredFindings.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Incompatibilidades Detectadas ({filteredFindings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border">
                {filteredFindings.map((finding, idx) => (
                  <div key={finding.id || idx} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-muted-foreground">{finding.id}</span>
                        <Badge variant={severityBadgeVariant(finding.severity) as any} className="text-[10px]">
                          {severityLabel(finding.severity)}
                        </Badge>
                      </div>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground">{finding.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{finding.description}</p>

                    {finding.specialties && finding.specialties.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {finding.specialties.map(s => (
                          <Badge key={s} variant="outline" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {finding.location && finding.location !== 'N/A' && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {finding.location}
                      </div>
                    )}

                    {finding.recommendation && (
                      <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
                        <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground">Recomendação:</span> {finding.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* No findings for current filter */}
          {!aiAnalyzing && analysisResult && filteredFindings.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {severityFilter
                    ? `Nenhuma incompatibilidade com severidade "${severityLabel(severityFilter)}" encontrada.`
                    : 'Nenhuma incompatibilidade encontrada.'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Modals */}
      <ObraRegistModal isOpen={showObraModal} onClose={() => setShowObraModal(false)} onConfirm={handleCreateObra} />
      <ObraListModal isOpen={showObraList} onClose={() => setShowObraList(false)} obras={ic.obras} obraAtiva={ic.obraAtiva}
        onSelect={obra => ic.selectObra(obra)} onDelete={id => ic.deleteObra(id)} onNew={() => { setShowObraList(false); setShowObraModal(true); }} />
      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUpload={handleUpload}
        obraNome={ic.obraAtiva?.nome} uploadProgress={ic.uploadProgress} />
      <ShareModal isOpen={showShare} onClose={() => setShowShare(false)} obraAtiva={ic.obraAtiva}
        findingsCount={{ critical: altaCount, warning: mediaCount, info: baixaCount }}
        onGenerateReport={ic.generateReport} />
      <ProjectPreviewModal project={previewProject} onClose={() => setPreviewProject(null)}
        onDelete={(id, path) => ic.deleteProject(id, path)} />
    </div>
  );
}
