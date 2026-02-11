import { useState } from 'react';
import { useIncompaticheck } from './incompaticheck/useIncompaticheck';
import { PROJECT_TYPES, SEVERITY_CONFIG } from './incompaticheck/types';
import type { Project } from './incompaticheck/types';
import { formatFileSize } from './incompaticheck/helpers';
import AgentPanel from './incompaticheck/AgentPanel';
import StatCard from './incompaticheck/StatCard';
import CrossSectionSVG from './incompaticheck/CrossSectionSVG';
import UploadModal from './incompaticheck/UploadModal';
import ShareModal from './incompaticheck/ShareModal';
import ObraRegistModal from './incompaticheck/ObraRegistModal';
import ObraListModal from './incompaticheck/ObraListModal';
import ProjectPreviewModal from './incompaticheck/ProjectPreviewModal';

function ProjectTypeBadge({ type }: { type: string }) {
  const config = PROJECT_TYPES[type];
  if (!config) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
      borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: config.color,
      background: `${config.color}15`, border: `1px solid ${config.color}30`,
    }}>
      {config.icon} {config.label}
    </span>
  );
}

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

  // ---- Determine page state ----
  const hasObra = !!ic.obraAtiva;
  const hasProjects = ic.projects.length > 0;
  const hasAnalysis = !!ic.analysis;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0c10', fontFamily: "'DM Sans', sans-serif", color: '#fff', overflow: 'hidden' }}>
      {/* Sidebar: Projects */}
      <div className="max-lg:hidden" style={{ width: '280px', minWidth: '280px', background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Projetos</div>
          <div style={{ fontSize: '11px', color: '#666' }}>{ic.projects.length} ficheiro{ic.projects.length !== 1 ? 's' : ''} carregado{ic.projects.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {ic.projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: '#555', fontSize: '12px' }}>
              {hasObra ? 'Nenhum projeto carregado. Use o botão Upload.' : 'Selecione uma obra primeiro.'}
            </div>
          ) : (
            ic.projects.map(project => {
              const typeConfig = PROJECT_TYPES[project.type];
              return (
                <div key={project.id} className="group" style={{
                  padding: '12px', borderRadius: '12px', marginBottom: '6px', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                  transition: 'all 0.2s',
                }} onClick={() => setPreviewProject(project)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                      background: `${typeConfig?.color}15`, border: `1px solid ${typeConfig?.color}25`,
                    }}>
                      {typeConfig?.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                      <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                        {project.format.toUpperCase()} · {formatFileSize(project.file_size)}
                        {project.from_zip && ' · ZIP'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🔍</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>IncompatiCheck</div>
              <div style={{ fontSize: '11px', color: '#888' }}>Análise de Incompatibilidades</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Obra selector */}
            <button onClick={() => ic.obras.length > 0 ? setShowObraList(true) : setShowObraModal(true)} style={{
              padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#ccc',
            }}>
              🏗️ {ic.obraAtiva?.nome || 'Selecionar Obra'}
            </button>

            {hasObra && (
              <>
                <button onClick={() => setShowUpload(true)} style={{
                  padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid rgba(255,165,0,0.2)', background: 'rgba(255,165,0,0.05)', color: '#f59e0b',
                }}>
                  📁 Upload
                </button>
                {hasAnalysis && (
                  <button onClick={() => setShowShare(true)} style={{
                    padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: '1px solid rgba(0,201,167,0.2)', background: 'rgba(0,201,167,0.05)', color: '#00c9a7',
                  }}>
                    📤 Relatório
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main scrollable area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* STATE: No obra */}
          {!hasObra && (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏗️</div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Registe uma obra para começar</h2>
              <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>Crie uma obra para carregar projetos e analisar incompatibilidades.</p>
              <button onClick={() => setShowObraModal(true)} style={{
                padding: '12px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)', color: '#fff', fontSize: '14px', fontWeight: 600,
              }}>
                + Registar Obra
              </button>
            </div>
          )}

          {/* STATE: Has obra, no projects */}
          {hasObra && !hasProjects && !ic.analyzing && (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Carregue os projetos para análise</h2>
              <p style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>Obra: <strong style={{ color: '#ff6b35' }}>{ic.obraAtiva?.nome}</strong></p>
              <p style={{ color: '#666', fontSize: '13px', marginBottom: '24px' }}>PDF · DWG · DWF · IFC · ZIP — até 2GB</p>
              <button onClick={() => setShowUpload(true)} style={{
                padding: '12px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)', color: '#fff', fontSize: '14px', fontWeight: 600,
              }}>
                📁 Upload de Projeto
              </button>
            </div>
          )}

          {/* STATE: Has projects, no analysis */}
          {hasObra && hasProjects && !hasAnalysis && !ic.analyzing && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Execute a análise de incompatibilidades</h2>
              <p style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>
                {ic.projects.length} projeto{ic.projects.length !== 1 ? 's' : ''} carregado{ic.projects.length !== 1 ? 's' : ''} na obra <strong style={{ color: '#ff6b35' }}>{ic.obraAtiva?.nome}</strong>
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '24px' }}>
                {ic.projects.map(p => (
                  <ProjectTypeBadge key={p.id} type={p.type} />
                ))}
              </div>
              <button onClick={handleRunAnalysis} style={{
                padding: '12px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)', color: '#fff', fontSize: '14px', fontWeight: 600,
              }}>
                ⚡ Executar Análise
              </button>
            </div>
          )}

          {/* STATE: Analyzing */}
          {ic.analyzing && (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>A analisar incompatibilidades...</h2>
              <p style={{ color: '#888', fontSize: '13px' }}>{ic.uploadProgress || 'A processar projetos...'}</p>
            </div>
          )}

          {/* STATE: Has analysis results */}
          {hasObra && hasAnalysis && !ic.analyzing && (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <StatCard number={ic.analysis!.critical_count} label="Críticas" type="critical" />
                <StatCard number={ic.analysis!.warning_count} label="Alertas" type="warning" />
                <StatCard number={ic.analysis!.info_count} label="Observações" type="info" />
                <StatCard number={ic.analysis!.total_projects} label="Projetos" type="ok" />
              </div>

              {/* Cross section SVG */}
              <div style={{ marginBottom: '24px' }}>
                <CrossSectionSVG />
              </div>

              {/* Re-run analysis + upload more */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setShowUpload(true)} style={{
                  padding: '8px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid rgba(255,165,0,0.2)', background: 'rgba(255,165,0,0.05)', color: '#f59e0b',
                }}>
                  + Upload
                </button>
                <button onClick={handleRunAnalysis} style={{
                  padding: '8px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#ccc',
                }}>
                  ⚡ Re-analisar
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {[
                  { key: 'all', label: 'Todas' },
                  { key: 'critical', label: `Críticas (${ic.analysis!.critical_count})` },
                  { key: 'warning', label: `Alertas (${ic.analysis!.warning_count})` },
                  { key: 'info', label: `Info (${ic.analysis!.info_count})` },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)} style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    background: filter === f.key ? 'rgba(255,165,0,0.1)' : 'transparent',
                    border: `1px solid ${filter === f.key ? 'rgba(255,165,0,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    color: filter === f.key ? '#f59e0b' : '#888',
                  }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Findings list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredFindings.map(finding => {
                  const sev = SEVERITY_CONFIG[finding.severity];
                  return (
                    <div key={finding.id} style={{
                      padding: '16px', borderRadius: '14px',
                      background: sev?.bg || 'rgba(255,255,255,0.03)',
                      border: `1px solid ${sev?.border || 'rgba(255,255,255,0.06)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%', marginTop: '6px', flexShrink: 0,
                          background: sev?.color || '#888',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{
                              fontSize: '9px', padding: '2px 8px', borderRadius: '6px', fontWeight: 700,
                              color: sev?.color, background: `${sev?.color}15`, border: `1px solid ${sev?.border}`,
                            }}>
                              {sev?.label}
                            </span>
                            {finding.location && (
                              <span style={{ fontSize: '10px', color: '#666' }}>📍 {finding.location}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#eee', marginBottom: '4px' }}>{finding.title}</div>
                          <div style={{ fontSize: '12px', color: '#999', lineHeight: 1.5 }}>{finding.description}</div>
                          {finding.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                              {finding.tags.map(tag => (
                                <ProjectTypeBadge key={tag} type={tag} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredFindings.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#555', fontSize: '13px' }}>
                    Nenhuma incompatibilidade encontrada com este filtro.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agent Panel */}
      <div className="max-lg:hidden">
        <AgentPanel findings={ic.findings} obraName={ic.obraAtiva?.nome} />
      </div>

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
