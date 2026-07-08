import { useState, useRef, useEffect } from 'react';
import { useIncompaticheck } from './incompaticheck/useIncompaticheck';
import { PROJECT_TYPES, PDE_DOC_TYPES, VERDICT_CONFIG } from './incompaticheck/types';
import type { Project, PdeDocType } from './incompaticheck/types';
import { formatFileSize } from './incompaticheck/helpers';
import UploadModal from './incompaticheck/UploadModal';
import ObraRegistModal from './incompaticheck/ObraRegistModal';
import ObraListModal from './incompaticheck/ObraListModal';
import ProjectPreviewModal from './incompaticheck/ProjectPreviewModal';
import { useEngSilvaContext } from '@/hooks/use-eng-silva-context';
import { useAnalysisPipeline } from '@/hooks/useAnalysisPipeline';
import { useSelfAnalysis } from '@/hooks/useSelfAnalysis';
import ElementsExplorer from '@/components/incompaticheck/ElementsExplorer';
import CrossAnalysisPanel from '@/components/incompaticheck/CrossAnalysisPanel';
import SelfAnalysisPanel from '@/components/incompaticheck/SelfAnalysisPanel';
import ContextObraModal from './incompaticheck/ContextObraModal';
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
  Trash2,
  Lightbulb,
  Play,
  ScanLine,
  Boxes,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

export default function IncompatiCheck() {
  const ic = useIncompaticheck();
  const pipeline = useAnalysisPipeline(ic.obraAtiva?.id ?? null, ic.projects);
  const [elementsRefreshKey, setElementsRefreshKey] = useState(0);
  const self = useSelfAnalysis(ic.obraAtiva?.id ?? null, elementsRefreshKey);
  const [showObraModal, setShowObraModal] = useState(false);
  const [showObraList, setShowObraList] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [clientLogo, setClientLogo] = useState<string | null>(() => localStorage.getItem('incompaticheck_client_logo'));
  const [fiscalLogo, setFiscalLogo] = useState<string | null>(() => localStorage.getItem('incompaticheck_fiscal_logo'));

  // Recarrega o ElementsExplorer sempre que as contagens de elementos mudam
  useEffect(() => {
    setElementsRefreshKey(k => k + 1);
  }, [pipeline.elementCounts]);

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

  const hasObra = !!ic.obraAtiva;
  const hasProjects = ic.projects.length > 0;

  // Group projects by type
  const projectsByType = ic.projects.reduce<Record<string, Project[]>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});

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
      {hasObra && !hasProjects && (
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
          <div className="space-y-4">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Projectos Carregados</CardTitle>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowContext(true)}
                        className="gap-1.5"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Contexto
                      </Button>
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={pipeline.runPrepareAll}
                        disabled={pipeline.preparing || ic.projects.length === 0}
                        className="gap-1.5"
                      >
                        {pipeline.preparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Preparar Análise
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Carregar Projecto
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ic.projects.length} projecto{ic.projects.length !== 1 ? 's' : ''} na obra{' '}
                    <span className="font-medium text-primary">{ic.obraAtiva?.nome}</span>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progresso da preparacao (inventario/extracao) */}
                  {pipeline.progress.active && (
                    <div className="space-y-1.5 rounded-lg bg-primary/5 border border-primary/20 p-3">
                      <p className="text-xs text-foreground">
                        {pipeline.progress.stage === 'INVENTORY' ? 'A inventariar' : 'A extrair elementos de'}{' '}
                        <span className="font-medium">{pipeline.progress.projectName}</span>
                        {pipeline.progress.total > 1 && ` (${pipeline.progress.index}/${pipeline.progress.total})`}
                      </p>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '70%' }} />
                      </div>
                    </div>
                  )}
                  {/* Erro ruidoso da pipeline (nao desaparece como um toast) */}
                  {pipeline.pipelineError && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/40 p-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-destructive whitespace-pre-wrap break-words flex-1">{pipeline.pipelineError}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={pipeline.clearError} className="h-6 text-xs">Fechar</Button>
                    </div>
                  )}
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
                          {projects.map(project => {
                            const inv = pipeline.inventories[project.id];
                            const count = pipeline.elementCounts[project.id] ?? 0;
                            const rowActive = pipeline.progress.active && pipeline.progress.projectId === project.id;
                            return (
                            <div key={project.id} className="rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                              <div
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
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
                              {/* Linha da pipeline: inventario + elementos + accoes */}
                              <div className="flex items-center gap-2 px-3 pb-2.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                <InventoryBadge inv={inv} running={rowActive && pipeline.progress.stage === 'INVENTORY'} />
                                {count > 0 && (
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <Boxes className="w-3 h-3" />{count} elementos
                                  </Badge>
                                )}
                                <div className="flex-1" />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 gap-1 text-[11px]"
                                  disabled={pipeline.preparing || rowActive}
                                  onClick={() => pipeline.runInventory(project).catch(() => {})}
                                >
                                  <ScanLine className="w-3 h-3" /> Inventariar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 gap-1 text-[11px]"
                                  disabled={pipeline.preparing || rowActive || !inv || inv.processing_status !== 'DONE'}
                                  onClick={() => pipeline.runExtraction(project).catch(() => {})}
                                >
                                  <Boxes className="w-3 h-3" /> Extrair
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 gap-1 text-[11px]"
                                  disabled={pipeline.preparing || rowActive || self.progress.active || count === 0}
                                  onClick={() => self.runProject(project.id, project.name).catch(() => {})}
                                >
                                  <ShieldCheck className="w-3 h-3" /> Verificar Coerência
                                </Button>
                              </div>
                            </div>
                            );
                          })}
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

          {/* Logótipos do relatório (usados no relatório de excelência, PDE e partilha) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Logótipos do Relatório</CardTitle>
              <p className="text-xs text-muted-foreground">Aparecem no cabeçalho dos relatórios gerados (fiscalização à esquerda, cliente à direita).</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-w-md">
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
            </CardContent>
          </Card>

          {/* ---- ELEMENTOS EXTRAIDOS (Onda 1) ---- */}
          {ic.obraAtiva && Object.values(pipeline.elementCounts).some(c => c > 0) && (
            <ElementsExplorer obraId={ic.obraAtiva.id} refreshKey={elementsRefreshKey} />
          )}

          {/* ---- COERENCIA INTERNA (Onda 2.5) ---- */}
          {ic.obraAtiva && (self.findings.length > 0 || self.progress.active || self.selfError) && (
            <SelfAnalysisPanel
              self={self}
              obraId={ic.obraAtiva.id}
              refreshKey={elementsRefreshKey}
              projectNames={Object.fromEntries(ic.projects.map(p => [p.id, p.name]))}
              projectFiles={Object.fromEntries(ic.projects.map(p => [p.id, p.file_path]))}
            />
          )}

          {/* ---- ANALISE CRUZADA (Onda 2) ---- */}
          {ic.obraAtiva && Object.values(pipeline.elementCounts).some(c => c > 0) && (
            <CrossAnalysisPanel
              obraId={ic.obraAtiva.id}
              refreshKey={elementsRefreshKey}
              selfFindings={self.findings}
              projectFiles={Object.fromEntries(ic.projects.map(p => [p.id, p.file_path]))}
              obra={{ id: ic.obraAtiva.id, nome: ic.obraAtiva.nome, cidade: ic.obraAtiva.cidade, fiscal: ic.obraAtiva.fiscal }}
              clientLogo={clientLogo}
              fiscalLogo={fiscalLogo}
            />
          )}

          {/* ---- ESCLARECIMENTOS & PROPOSTAS (PDE) ---- */}
          {(ic.analysis || ic.pdeDocuments.length > 0) && (
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
      <ProjectPreviewModal project={previewProject} onClose={() => setPreviewProject(null)}
        onDelete={(id, path) => ic.deleteProject(id, path)} />
      <ContextObraModal
        isOpen={showContext}
        onClose={() => setShowContext(false)}
        currentContext={ic.obraAtiva?.analysis_context ?? null}
        onSave={async (ctx) => { if (ic.obraAtiva) await ic.updateObraContext(ic.obraAtiva.id, ctx); }}
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

/* ========== Inventory Badge (Onda 1) ========== */
function InventoryBadge({ inv, running }: {
  inv?: { processing_status: string; especialidade: string; doc_type: string; pisos: string[]; error_message: string | null };
  running: boolean;
}) {
  if (running) {
    return <Badge variant="secondary" className="text-[10px] gap-1"><Loader2 className="w-3 h-3 animate-spin" /> A inventariar</Badge>;
  }
  if (!inv || inv.processing_status === 'PENDING') {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground">Sem inventário</Badge>;
  }
  if (inv.processing_status === 'RUNNING') {
    return <Badge variant="secondary" className="text-[10px] gap-1"><Loader2 className="w-3 h-3 animate-spin" /> A inventariar</Badge>;
  }
  if (inv.processing_status === 'ERROR') {
    return <Badge variant="critical" className="text-[10px]" title={inv.error_message || 'Erro'}>Erro no inventário</Badge>;
  }
  return (
    <Badge variant="success" className="text-[10px]">
      {inv.especialidade} · {inv.doc_type}{inv.pisos?.length ? ` · ${inv.pisos.slice(0, 2).join(', ')}${inv.pisos.length > 2 ? '…' : ''}` : ''}
    </Badge>
  );
}
