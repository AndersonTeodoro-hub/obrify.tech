import { useState } from 'react';
import { useIncompaticheck } from './incompaticheck/useIncompaticheck';
import { PROJECT_TYPES, SEVERITY_CONFIG } from './incompaticheck/types';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function IncompatiCheck() {
  const ic = useIncompaticheck();
  const [showObraModal, setShowObraModal] = useState(false);
  const [showObraList, setShowObraList] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [filter, setFilter] = useState('all');

  const filteredFindings = filter === 'all' ? ic.findings : ic.findings.filter(f => f.severity === filter);

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
    await ic.runAnalysis(ic.obraAtiva.id);
  };

  const hasObra = !!ic.obraAtiva;
  const hasProjects = ic.projects.length > 0;
  const hasAnalysis = !!ic.analysis;
  const canAnalyze = ic.projects.length >= 2;

  // Group projects by type
  const projectsByType = ic.projects.reduce<Record<string, Project[]>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});

  const severityLabel = (s: string) =>
    s === 'critical' ? 'Alta' : s === 'warning' ? 'Média' : 'Baixa';

  const severityVariant = (s: string) =>
    s === 'critical' ? 'critical' : s === 'warning' ? 'high' : 'success';

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
      {hasObra && !hasProjects && !ic.analyzing && (
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

      {/* STATE: Analyzing */}
      {ic.analyzing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">A analisar incompatibilidades...</h2>
            <p className="text-sm text-muted-foreground">{ic.uploadProgress || 'A processar projectos...'}</p>
          </CardContent>
        </Card>
      )}

      {/* STATE: Has projects (main working state) */}
      {hasObra && hasProjects && !ic.analyzing && (
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
            {!hasAnalysis ? (
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
            ) : (
              /* Results */
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="text-center py-3">
                    <p className="text-2xl font-bold text-destructive">{ic.analysis!.critical_count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Críticas</p>
                  </Card>
                  <Card className="text-center py-3">
                    <p className="text-2xl font-bold text-amber-500">{ic.analysis!.warning_count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Alertas</p>
                  </Card>
                  <Card className="text-center py-3">
                    <p className="text-2xl font-bold text-emerald-500">{ic.analysis!.info_count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Info</p>
                  </Card>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5 flex-1">
                    <Plus className="w-3.5 h-3.5" />
                    Upload
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRunAnalysis} className="gap-1.5 flex-1">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Re-analisar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowShare(true)} className="gap-1.5 flex-1">
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'all', label: 'Todas' },
                    { key: 'critical', label: `Críticas (${ic.analysis!.critical_count})` },
                    { key: 'warning', label: `Alertas (${ic.analysis!.warning_count})` },
                    { key: 'info', label: `Info (${ic.analysis!.info_count})` },
                  ].map(f => (
                    <Button
                      key={f.key}
                      variant={filter === f.key ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setFilter(f.key)}
                      className="text-xs h-7"
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                {/* Findings */}
                <Card>
                  <CardContent className="p-0 divide-y divide-border">
                    {filteredFindings.length === 0 ? (
                      <div className="text-center py-10 text-sm text-muted-foreground">
                        Nenhuma incompatibilidade encontrada com este filtro.
                      </div>
                    ) : (
                      filteredFindings.map(finding => (
                        <div key={finding.id} className="p-4 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={severityVariant(finding.severity) as any} className="text-[10px]">
                              {severityLabel(finding.severity)}
                            </Badge>
                            {finding.location && (
                              <span className="text-[11px] text-muted-foreground">📍 {finding.location}</span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold text-foreground">{finding.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">{finding.description}</p>
                          {finding.tags.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap pt-1">
                              {finding.tags.map(tag => {
                                const tc = PROJECT_TYPES[tag];
                                return tc ? (
                                  <Badge key={tag} variant="outline" className="text-[10px]">
                                    {tc.icon} {tc.label}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ObraRegistModal isOpen={showObraModal} onClose={() => setShowObraModal(false)} onConfirm={handleCreateObra} />
      <ObraListModal isOpen={showObraList} onClose={() => setShowObraList(false)} obras={ic.obras} obraAtiva={ic.obraAtiva}
        onSelect={obra => ic.selectObra(obra)} onDelete={id => ic.deleteObra(id)} onNew={() => { setShowObraList(false); setShowObraModal(true); }} />
      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUpload={handleUpload}
        obraNome={ic.obraAtiva?.nome} uploadProgress={ic.uploadProgress} />
      <ShareModal isOpen={showShare} onClose={() => setShowShare(false)} obraAtiva={ic.obraAtiva}
        findingsCount={{ critical: ic.analysis?.critical_count || 0, warning: ic.analysis?.warning_count || 0, info: ic.analysis?.info_count || 0 }}
        onGenerateReport={ic.generateReport} />
      <ProjectPreviewModal project={previewProject} onClose={() => setPreviewProject(null)}
        onDelete={(id, path) => ic.deleteProject(id, path)} />
    </div>
  );
}
