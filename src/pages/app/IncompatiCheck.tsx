import { useState, useCallback, useRef, useEffect } from 'react';
import { useIncompaticheck } from './incompaticheck/useIncompaticheck';
import { PROJECT_TYPES, PDE_DOC_TYPES, VERDICT_CONFIG } from './incompaticheck/types';
import type { Project, PdeDocType } from './incompaticheck/types';
import { formatFileSize } from './incompaticheck/helpers';
import UploadModal from './incompaticheck/UploadModal';
import ShareModal from './incompaticheck/ShareModal';
import ObraRegistModal from './incompaticheck/ObraRegistModal';
import ObraListModal from './incompaticheck/ObraListModal';
import ProjectPreviewModal from './incompaticheck/ProjectPreviewModal';
import OverlayModal from './incompaticheck/OverlayModal';
import { useEngSilvaContext } from '@/hooks/use-eng-silva-context';
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
  Layers,
} from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
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
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [zoneImages, setZoneImages] = useState<Map<string, string>>(new Map());
  const [loadingZones, setLoadingZones] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [clientLogo, setClientLogo] = useState<string | null>(() => localStorage.getItem('incompaticheck_client_logo'));
  const [fiscalLogo, setFiscalLogo] = useState<string | null>(() => localStorage.getItem('incompaticheck_fiscal_logo'));

  // Real AI analysis state
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  // Push IncompatiCheck context to global Eng. Silva panel
  const { setContext: setSilvaContext } = useEngSilvaContext();
  useEffect(() => {
    if (ic.obraAtiva) {
      setSilvaContext({
        chatMessages: ic.chatMessages,
        agentThinking: ic.agentThinking,
        sendUserMessage: ic.sendUserMessage,
        obraName: ic.obraAtiva.nome,
        findings: ic.findings.map(f => ({
          severity: f.severity,
          title: f.title,
          description: f.description,
          location: f.location || undefined,
        })),
        pdeAnalyses: ic.pdeAnalyses.filter(a => a.status === 'completed').map(a => ({
          verdict: a.verdict,
          ai_analysis: a.ai_analysis,
          completed_at: a.completed_at,
        })),
        projects: ic.projects.map(p => ({ name: p.name, type: p.type })),
      });
    }
    return () => setSilvaContext(null);
  }, [ic.obraAtiva, ic.chatMessages, ic.agentThinking, ic.sendUserMessage, ic.findings, ic.pdeAnalyses, ic.projects, setSilvaContext]);

  // Zone image loading
  const handleToggleZone = useCallback(async (finding: AIFinding) => {
    const key = finding.id;
    if (expandedZones.has(key)) {
      setExpandedZones(prev => { const n = new Set(prev); n.delete(key); return n; });
      return;
    }
    setExpandedZones(prev => new Set(prev).add(key));

    if (zoneImages.has(key)) return;
    if (!finding.zone?.source_project) return;

    setLoadingZones(prev => new Set(prev).add(key));
    try {
      const project = ic.projects.find(p => p.name === finding.zone!.source_project);
      if (!project) return;

      const { data: fileData } = await supabase.storage
        .from('incompaticheck-files')
        .download(project.file_path);
      if (!fileData) return;

      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      const { pdfPageToImage, annotateImage } = await import('@/utils/annotate-plan-image');
      const baseImage = await pdfPageToImage(base64);
      const annotated = await annotateImage(baseImage, [{
        x_percent: finding.zone!.x_percent,
        y_percent: finding.zone!.y_percent,
        radius_percent: finding.zone!.radius_percent,
        label: finding.id,
        severity: finding.severity,
      }]);
      setZoneImages(prev => new Map(prev).set(key, annotated));
    } catch (err) {
      console.error('Zone image error:', err);
    } finally {
      setLoadingZones(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [expandedZones, zoneImages, ic.projects]);

  // PDF export with annotations
  const handleExportPdfWithAnnotations = useCallback(async () => {
    // Build result from local or persisted data
    const resultToExport = analysisResult || (ic.analysis && ic.findings.length > 0 ? {
      findings: ic.findings.map(f => ({
        id: f.id,
        severity: (f.severity === 'critical' ? 'alta' : f.severity === 'warning' ? 'media' : 'baixa') as 'alta' | 'media' | 'baixa',
        title: f.title,
        description: f.description,
        location: f.location || '',
        specialties: f.tags || [],
        recommendation: '',
      })),
      analyzed_at: ic.analysis.completed_at || ic.analysis.created_at || new Date().toISOString(),
      projects_analyzed: ic.projects.map(p => ({ name: p.name, type: p.type, size_mb: '' })),
      strategy: 'persisted',
      skipped_files: [],
    } : null);

    if (!resultToExport || resultToExport.findings.length === 0) {
      toast.error('Execute uma análise primeiro.');
      return;
    }
    setExportingPdf(true);
    toast.info('A gerar relatório com imagens anotadas...');

    try {
      const annotatedImages = new Map<string, string>();
      const projectCache = new Map<string, string>();

      for (const finding of resultToExport.findings as AIFinding[]) {
        if (!finding.zone?.source_project) continue;
        const projectName = finding.zone.source_project;

        if (!projectCache.has(projectName)) {
          const project = ic.projects.find(p => p.name === projectName);
          if (project) {
            try {
              const { data: fileData } = await supabase.storage
                .from('incompaticheck-files')
                .download(project.file_path);
              if (fileData) {
                const arrayBuffer = await fileData.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                  const chunk = uint8Array.subarray(i, i + chunkSize);
                  binary += String.fromCharCode(...chunk);
                }
                const base64 = btoa(binary);
                const { pdfPageToImage } = await import('@/utils/annotate-plan-image');
                const imageDataUrl = await pdfPageToImage(base64);
                projectCache.set(projectName, imageDataUrl);
              }
            } catch (err) {
              console.error(`Failed to process ${projectName}:`, err);
            }
          }
        }

        if (projectCache.has(projectName)) {
          const baseImage = projectCache.get(projectName)!;
          const { annotateImage } = await import('@/utils/annotate-plan-image');
          const annotated = await annotateImage(baseImage, [{
            x_percent: finding.zone.x_percent,
            y_percent: finding.zone.y_percent,
            radius_percent: finding.zone.radius_percent,
            label: finding.id,
            severity: finding.severity,
          }]);
          annotatedImages.set(finding.id, annotated);
        }
      }

      await ic.generateReportWithAnnotations(resultToExport, annotatedImages, clientLogo, fiscalLogo);
      toast.success('Relatório gerado com sucesso!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setExportingPdf(false);
    }
  }, [analysisResult, ic]);

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
      // Fetch knowledge data for this obra
      const { data: knowledgeData } = await supabase
        .from('eng_silva_project_knowledge')
        .select('document_name, specialty, summary, key_elements, processed')
        .eq('obra_id', ic.obraAtiva.id)
        .eq('processed', true);

      const knowledgePayload = knowledgeData?.map(k => ({
        project_name: k.document_name,
        specialty: k.specialty,
        summary: k.summary,
        key_elements: k.key_elements,
      })) || [];

      if (knowledgePayload.length > 0) {
        toast.info(`Usando resumos inteligentes para ${knowledgePayload.length} projecto(s).`);
      }

      const projectData = ic.projects.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        file_path: p.file_path,
      }));

      console.log('INCOMPATICHECK: Invoking analysis with', projectData.length, 'projects,', knowledgePayload.length, 'knowledge entries');

      const { data, error } = await supabase.functions.invoke('incompaticheck-analyze', {
        body: { projects: projectData, knowledge_data: knowledgePayload },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log('INCOMPATICHECK: Analysis result received:', data);
      console.log('INCOMPATICHECK: Findings count:', data?.findings?.length);
      setAnalysisResult(data as AnalysisResult);

      // Persist to DB via existing hook flow
      await persistAnalysis(data as AnalysisResult);

      // Save to Eng. Silva memory for voice conversations
      if (data.findings && data.findings.length > 0) {
        saveAnalysisToEngSilva(data as AnalysisResult, ic.obraAtiva?.nome || 'obra');
      }

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

  const saveAnalysisToEngSilva = async (result: AnalysisResult, obraName: string) => {
    try {
      console.log('INCOMPATICHECK: Saving to Eng. Silva memory...');
      const alta = result.findings.filter(f => f.severity === 'alta');
      const media = result.findings.filter(f => f.severity === 'media');
      const baixa = result.findings.filter(f => f.severity === 'baixa');

      let summary = `Análise de incompatibilidades na obra ${obraName}: ${result.findings.length} incompatibilidades detectadas (${alta.length} alta, ${media.length} média, ${baixa.length} baixa). `;

      alta.forEach(f => {
        summary += `[ALTA] ${f.id} - ${f.title}: ${f.description.substring(0, 150)}. Recomendação: ${f.recommendation.substring(0, 150)}. `;
      });

      media.forEach(f => {
        summary += `[MÉDIA] ${f.id} - ${f.title}: ${f.description.substring(0, 100)}. `;
      });

      const response = await supabase.functions.invoke('eng-silva-memory', {
        body: { action: 'add_summary', summary: summary.trim() },
      });
      console.log('INCOMPATICHECK: Memory save response:', response);
    } catch (err) {
      console.error('INCOMPATICHECK: Failed to save to Eng. Silva memory:', err);
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

  // Fallback: use persisted DB data when local analysisResult is absent
  const hasPersistedAnalysis = !analysisResult && !!ic.analysis && ic.findings.length > 0;

  const displayFindings: AIFinding[] = analysisResult?.findings || (hasPersistedAnalysis ? ic.findings.map(f => ({
    id: f.id,
    severity: (f.severity === 'critical' ? 'alta' : f.severity === 'warning' ? 'media' : 'baixa') as 'alta' | 'media' | 'baixa',
    title: f.title,
    description: f.description,
    location: f.location || '',
    specialties: f.tags || [],
    recommendation: '',
  })) : []);

  const hasResults = !!analysisResult || hasPersistedAnalysis;

  // Filtered findings
  const filteredFindings = displayFindings.filter(
    f => !severityFilter || f.severity === severityFilter
  );

  const severityBadgeVariant = (s: string) =>
    s === 'alta' ? 'critical' : s === 'media' ? 'high' : 'success';

  const severityLabel = (s: string) =>
    s === 'alta' ? 'Alta' : s === 'media' ? 'Média' : 'Baixa';

  const displayAltaCount = displayFindings.filter(f => f.severity === 'alta').length;
  const displayMediaCount = displayFindings.filter(f => f.severity === 'media').length;
  const displayBaixaCount = displayFindings.filter(f => f.severity === 'baixa').length;

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
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                                  {ic.knowledgeNames.has(project.name) && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5 flex-shrink-0">
                                      🧠 Knowledge
                                    </Badge>
                                  )}
                                </div>
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

              {/* Knowledge tip */}
              {ic.projects.length > 4 && ic.knowledgeNames.size < ic.projects.length / 2 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
                  <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Dica:</span> Processe os projectos no{' '}
                    <a href="/app/project-knowledge" className="text-primary underline hover:no-underline">
                      Conhecimento do Projecto
                    </a>{' '}
                    antes de analisar. Serão usados resumos inteligentes em vez dos PDFs completos, resultando em análises mais rápidas e precisas.
                  </p>
                </div>
              )}
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
              {!aiAnalyzing && !analysisError && !analysisResult && !hasPersistedAnalysis && (
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
                          Os projectos carregados serão comparados para identificar potenciais conflitos entre especialidades.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Results summary (right panel) */}
              {!aiAnalyzing && hasResults && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-destructive">{displayAltaCount}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Alta</p>
                    </Card>
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-amber-500">{displayMediaCount}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Média</p>
                    </Card>
                    <Card className="text-center py-3">
                      <p className="text-2xl font-bold text-emerald-500">{displayBaixaCount}</p>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPdfWithAnnotations}
                      disabled={exportingPdf}
                      className="gap-1.5 flex-1"
                    >
                      {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      PDF Completo
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        ic.generateExecutiveSummary(displayFindings, clientLogo, fiscalLogo);
                        toast.success('Resumo executivo gerado.');
                      }}
                      className="gap-1.5 flex-1"
                    >
                      <FileSearch className="w-3.5 h-3.5" />
                      Resumo 1pg
                    </Button>
                    {ic.analysis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm('Tem a certeza que deseja excluir esta análise?')) {
                            ic.deleteAnalysis(ic.analysis!.id);
                            setAnalysisResult(null);
                            setSeverityFilter(null);
                          }
                        }}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Overlay button */}
                  {ic.projects.length >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowOverlay(true)}
                      className="w-full gap-2 border-dashed"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Sobrepor Plantas
                    </Button>
                  )}

                  {/* Logo uploads for PDF */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Logo Fiscalização</label>
                      {fiscalLogo ? (
                        <div className="flex items-center gap-1.5 p-1.5 rounded border border-border bg-muted/30">
                          <img src={fiscalLogo} alt="Fiscal" className="h-6 object-contain" />
                          <button onClick={() => { setFiscalLogo(null); localStorage.removeItem('incompaticheck_fiscal_logo'); }} className="ml-auto p-0.5 rounded hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1 p-1.5 rounded border border-dashed border-border cursor-pointer hover:bg-muted/50 text-[10px] text-muted-foreground">
                          <Plus className="w-3 h-3" /> Carregar
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => { const b64 = reader.result as string; setFiscalLogo(b64); localStorage.setItem('incompaticheck_fiscal_logo', b64); };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }} />
                        </label>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-medium">Logo Cliente</label>
                      {clientLogo ? (
                        <div className="flex items-center gap-1.5 p-1.5 rounded border border-border bg-muted/30">
                          <img src={clientLogo} alt="Cliente" className="h-6 object-contain" />
                          <button onClick={() => { setClientLogo(null); localStorage.removeItem('incompaticheck_client_logo'); }} className="ml-auto p-0.5 rounded hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-1 p-1.5 rounded border border-dashed border-border cursor-pointer hover:bg-muted/50 text-[10px] text-muted-foreground">
                          <Plus className="w-3 h-3" /> Carregar
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => { const b64 = reader.result as string; setClientLogo(b64); localStorage.setItem('incompaticheck_client_logo', b64); };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: null, label: `Todas (${displayFindings.length})` },
                      { key: 'alta', label: `Alta (${displayAltaCount})` },
                      { key: 'media', label: `Média (${displayMediaCount})` },
                      { key: 'baixa', label: `Baixa (${displayBaixaCount})` },
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

                  {analysisResult && (
                    <p className="text-[11px] text-muted-foreground">
                      Analisado em {new Date(analysisResult.analyzed_at).toLocaleString('pt-PT')} · {analysisResult.projects_analyzed.length} projectos · Estratégia: {analysisResult.strategy === 'pairs' ? 'pares' : 'conjunta'}
                    </p>
                  )}

                  {hasPersistedAnalysis && !analysisResult && (
                    <p className="text-[10px] text-muted-foreground text-center italic">
                      Resultados da última análise guardada {ic.analysis?.completed_at ? `· ${format(new Date(ic.analysis.completed_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}` : ''}
                    </p>
                  )}
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
          {!aiAnalyzing && hasResults && filteredFindings.length > 0 && (
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

                    {/* Zone annotation button */}
                    {finding.zone && (
                      <div className="space-y-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs h-7"
                          onClick={() => handleToggleZone(finding)}
                          disabled={loadingZones.has(finding.id)}
                        >
                          {loadingZones.has(finding.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : expandedZones.has(finding.id) ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                          {expandedZones.has(finding.id) ? 'Ocultar zona' : 'Ver zona na planta'}
                        </Button>

                        {expandedZones.has(finding.id) && zoneImages.has(finding.id) && (
                          <div className="space-y-1.5">
                            <img
                              src={zoneImages.get(finding.id)}
                              alt={`Zona: ${finding.zone.description}`}
                              className="rounded-lg border border-border w-full max-h-80 object-contain bg-muted"
                            />
                            <p className="text-[11px] text-muted-foreground italic px-1">
                              Zona identificada: {finding.zone.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* No findings for current filter */}
          {!aiAnalyzing && hasResults && filteredFindings.length === 0 && (
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

          {/* ---- ESCLARECIMENTOS & PROPOSTAS (PDE) ---- */}
          {(hasResults || ic.analysis || ic.pdeDocuments.length > 0) && (
            <PdeSection ic={ic} clientLogo={clientLogo} fiscalLogo={fiscalLogo} />
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
        findingsCount={{ critical: displayAltaCount, warning: displayMediaCount, info: displayBaixaCount }}
        onGenerateReport={() => ic.generateReport(clientLogo, fiscalLogo)} />
      <ProjectPreviewModal project={previewProject} onClose={() => setPreviewProject(null)}
        onDelete={(id, path) => ic.deleteProject(id, path)} />
      <OverlayModal
        isOpen={showOverlay}
        onClose={() => setShowOverlay(false)}
        projects={ic.projects}
        findings={displayFindings}
      />
    </div>
  );
}

/* ========== PDE Section Component ========== */
function PdeSection({ ic, clientLogo, fiscalLogo }: { ic: ReturnType<typeof useIncompaticheck>; clientLogo: string | null; fiscalLogo: string | null }) {
  const pdeInputRef = useRef<HTMLInputElement>(null);
  const desenhoInputRef = useRef<HTMLInputElement>(null);
  const respostaInputRef = useRef<HTMLInputElement>(null);

  const inputRefs: Record<PdeDocType, React.RefObject<HTMLInputElement | null>> = {
    pde: pdeInputRef,
    desenho_preparacao: desenhoInputRef,
    resposta_pde: respostaInputRef,
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: PdeDocType) => {
    const file = e.target.files?.[0];
    if (!file || !ic.obraAtiva) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Apenas ficheiros PDF são aceites.');
      return;
    }
    try {
      await ic.uploadPdeDocument(file, docType, ic.obraAtiva.id);
      toast.success(`${PDE_DOC_TYPES[docType].label} carregado.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload.');
    }
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!ic.obraAtiva) return;
    try {
      toast.info('A analisar propostas do empreiteiro...');
      await ic.analyzeProposals(ic.obraAtiva.id);
      toast.success('Análise de propostas concluída.');
    } catch (err: any) {
      toast.error(err.message || 'Erro na análise de propostas.');
    }
  };

  const hasPdeOrDesenho = ic.pdeDocuments.some(d => d.doc_type === 'pde' || d.doc_type === 'desenho_preparacao');
  const latestAnalysis = ic.pdeAnalyses.find(a => a.status === 'completed');

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <span>📋</span> Esclarecimentos & Propostas
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gerir PDE, Desenhos de Preparação e Respostas do projetista
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 3-column upload grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(PDE_DOC_TYPES) as [PdeDocType, typeof PDE_DOC_TYPES[PdeDocType]][]).map(([docType, config]) => {
            const docs = ic.pdeDocuments.filter(d => d.doc_type === docType);
            return (
              <div
                key={docType}
                className="rounded-lg border p-4 space-y-3"
                style={{ borderColor: config.color + '40' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{config.label}</p>
                    <p className="text-[11px] text-muted-foreground">{config.description}</p>
                  </div>
                </div>

                {/* File list */}
                {docs.length > 0 && (
                  <div className="space-y-1.5">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 group">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                        </div>
                        <button
                          onClick={() => ic.deletePdeDocument(doc.id, doc.file_path)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                <input
                  ref={inputRefs[docType]}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, docType)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => inputRefs[docType].current?.click()}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Carregar
                </Button>
              </div>
            );
          })}
        </div>

        {/* Analyze button */}
        <div className="flex justify-center">
          <Button
            onClick={handleAnalyze}
            disabled={!hasPdeOrDesenho || ic.analyzingProposal}
            variant="accent"
            className="gap-2"
          >
            {ic.analyzingProposal ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSearch className="w-4 h-4" />
            )}
            {ic.analyzingProposal ? 'A analisar...' : 'Analisar Propostas'}
          </Button>
        </div>
        {!hasPdeOrDesenho && (
          <p className="text-[11px] text-muted-foreground text-center">
            Carregue pelo menos 1 PDE ou 1 Desenho de Preparação para analisar.
          </p>
        )}

        {/* Verdict Panel */}
        {latestAnalysis && latestAnalysis.ai_analysis && (
          <div
            className="rounded-lg border p-5 space-y-4"
            style={{
              borderColor: VERDICT_CONFIG[latestAnalysis.verdict || '']?.color + '40' || undefined,
              background: VERDICT_CONFIG[latestAnalysis.verdict || '']?.bg || undefined,
            }}
          >
            {/* Verdict badge */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">{VERDICT_CONFIG[latestAnalysis.verdict || '']?.icon}</span>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {VERDICT_CONFIG[latestAnalysis.verdict || '']?.label || 'Parecer'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Parecer Técnico · {latestAnalysis.completed_at ? format(new Date(latestAnalysis.completed_at), "d MMM yyyy 'às' HH:mm", { locale: pt }) : ''}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-background/60 rounded-lg p-3">
              <p className="text-sm text-foreground leading-relaxed">{latestAnalysis.ai_analysis.summary}</p>
            </div>

            {/* Findings addressed */}
            {latestAnalysis.ai_analysis.findings_addressed?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incompatibilidades Abordadas</p>
                <div className="space-y-1.5">
                  {latestAnalysis.ai_analysis.findings_addressed.map((fa, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 flex-shrink-0">{fa.resolved ? '✅' : '❌'}</span>
                      <div>
                        <p className="font-medium text-foreground">{fa.finding_title}</p>
                        <p className="text-muted-foreground">{fa.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New issues */}
            {latestAnalysis.ai_analysis.new_issues?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Novos Problemas Detectados</p>
                <div className="space-y-1.5">
                  {latestAnalysis.ai_analysis.new_issues.map((ni, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-destructive/5 rounded p-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">{ni.title}</p>
                        <p className="text-muted-foreground">{ni.description}</p>
                        {ni.location && <p className="text-muted-foreground italic">Local: {ni.location}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Technical notes */}
            {latestAnalysis.ai_analysis.technical_notes?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas Técnicas</p>
                <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                  {latestAnalysis.ai_analysis.technical_notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendation */}
            {latestAnalysis.ai_analysis.recommendation && (
              <div className="flex items-start gap-2 bg-primary/5 rounded-lg p-3">
                <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Recomendação</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{latestAnalysis.ai_analysis.recommendation}</p>
                </div>
              </div>
            )}

            {/* Download PDE PDF + Delete */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  ic.generatePdeReport(latestAnalysis, ic.pdeDocuments, clientLogo, fiscalLogo);
                  toast.success('PDF do parecer gerado.');
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Parecer PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm('Tem a certeza que deseja excluir este parecer? Poderá executar uma nova análise depois.')) {
                    ic.deletePdeAnalysis(latestAnalysis.id);
                    toast.success('Parecer excluído.');
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Parecer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
