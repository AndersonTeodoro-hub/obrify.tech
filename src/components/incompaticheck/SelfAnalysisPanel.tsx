import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { useSelfAnalysis } from '@/hooks/useSelfAnalysis';
import type { SelfFinding, ElementRow } from '@/pages/app/incompaticheck/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ShieldCheck, AlertTriangle, RotateCcw, Check, X } from 'lucide-react';
import EvidenceImage from '@/components/incompaticheck/EvidenceImage';

type SelfHook = ReturnType<typeof useSelfAnalysis>;

const SEV_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const sevVariant = (s: string) => (s === 'alta' ? 'critical' : s === 'media' ? 'high' : 'success');
const sevLabel = (s: string) => (s === 'alta' ? 'Alta' : s === 'media' ? 'Média' : 'Baixa');

export default function SelfAnalysisPanel({ self, obraId, refreshKey, projectNames, projectFiles }: {
  self: SelfHook; obraId: string; refreshKey: number; projectNames: Record<string, string>; projectFiles: Record<string, string>;
}) {
  const [elementsMap, setElementsMap] = useState<Record<string, ElementRow>>({});
  const [selected, setSelected] = useState<SelfFinding | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('incompaticheck_elements').select('*').eq('obra_id', obraId);
      if (cancelled) return;
      const map: Record<string, ElementRow> = {};
      (data || []).forEach((e: ElementRow) => { map[e.id] = e; });
      setElementsMap(map);
    })();
    return () => { cancelled = true; };
  }, [obraId, refreshKey, self.findings.length]);

  const groups = useMemo(() => {
    const byProj: Record<string, { label: string; items: SelfFinding[] }> = {};
    for (const f of self.findings) {
      if (!byProj[f.project_id]) byProj[f.project_id] = { label: projectNames[f.project_id] || f.especialidade || f.project_id, items: [] };
      byProj[f.project_id].items.push(f);
    }
    Object.values(byProj).forEach(g => g.items.sort((x, y) => (SEV_ORDER[x.severity] - SEV_ORDER[y.severity]) || (y.confidence - x.confidence)));
    return Object.entries(byProj).map(([key, g]) => ({ key, ...g })).sort((a, b) => a.label.localeCompare(b.label));
  }, [self.findings, projectNames]);

  const counts = useMemo(() => {
    const c = { total: self.findings.length, alta: 0, media: 0, baixa: 0, confirmado: 0, rejeitado: 0 };
    for (const f of self.findings) {
      c[f.severity]++;
      if (f.status === 'confirmado') c.confirmado++;
      if (f.status === 'rejeitado') c.rejeitado++;
    }
    return c;
  }, [self.findings]);

  const setStatus = async (f: SelfFinding, status: 'confirmado' | 'rejeitado') => {
    try {
      await self.updateFindingStatus(f.id, status);
      setSelected(prev => (prev && prev.id === f.id ? { ...prev, status } : prev));
    } catch (err: any) {
      // Erro ruidoso: mensagem completa no mesmo alerta destrutivo do painel
      self.setSelfError(`Não foi possível ${status === 'confirmado' ? 'confirmar' : 'rejeitar'} o finding: ${err.message}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Coerência Interna
          </CardTitle>
          {counts.total > 0 && (
            <div className="flex gap-1.5 text-[10px] text-muted-foreground items-center flex-wrap">
              <Badge variant="critical" className="text-[10px]">{counts.alta} alta</Badge>
              <Badge variant="high" className="text-[10px]">{counts.media} média</Badge>
              <Badge variant="success" className="text-[10px]">{counts.baixa} baixa</Badge>
              <span>· {counts.confirmado} confirmados · {counts.rejeitado} rejeitados</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Incoerências dentro de cada documento — use "Verificar Coerência" na lista de projectos.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progresso */}
        {self.progress.active && (
          <div className="space-y-1.5 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-foreground">A verificar coerência de <span className="font-medium">{self.progress.label}</span></p>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}
        {/* Erro ruidoso persistente */}
        {self.selfError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/40 p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive whitespace-pre-wrap break-words flex-1">{self.selfError}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={self.clearError} className="h-6 text-xs">Fechar</Button>
          </div>
        )}

        {self.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sem incoerências internas detectadas.</p>
        ) : (
          groups.map(group => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">{group.label} ({group.items.length})</p>
                <Button
                  variant="ghost" size="sm" className="h-6 gap-1 text-[11px] flex-shrink-0"
                  disabled={self.progress.active}
                  onClick={() => self.runProject(group.key, group.label).catch(() => {})}
                >
                  <RotateCcw className="w-3 h-3" /> Re-verificar
                </Button>
              </div>
              <div className="space-y-1.5">
                {group.items.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors ${f.status === 'rejeitado' ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                      <Badge variant={sevVariant(f.severity) as any} className="text-[10px]">{sevLabel(f.severity)}</Badge>
                      <Badge variant="outline" className="text-[10px]">{f.tipo_problema}</Badge>
                      {f.status === 'confirmado' && <Badge variant="success" className="text-[10px] gap-0.5"><Check className="w-3 h-3" />Confirmado</Badge>}
                      {f.status === 'rejeitado' && <Badge variant="secondary" className="text-[10px]">Rejeitado</Badge>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                      {f.location && <p className="text-[11px] text-muted-foreground truncate">{f.location}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Painel lateral: evidencia + accoes */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  <Badge variant={sevVariant(selected.severity) as any} className="text-[10px]">{sevLabel(selected.severity)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{selected.tipo_problema}</Badge>
                  <span className="text-sm">{selected.title}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Descrição" value={selected.description} />
                <Field label="Impacto" value={selected.impact} />
                <Field label="Localização" value={selected.location} />
                <Field label="Recomendação" value={selected.recommendation} />
                <Field label="Confiança" value={selected.confidence.toFixed(2)} />

                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Elemento</p>
                  <EvidenceCard el={elementsMap[selected.element_a_id]} />
                </div>
                {selected.element_b_id && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Elemento (2)</p>
                    <EvidenceCard el={elementsMap[selected.element_b_id]} />
                  </div>
                )}

                {(() => {
                  const elA = elementsMap[selected.element_a_id];
                  const elB = selected.element_b_id ? elementsMap[selected.element_b_id] : null;
                  const shared = !!(elA && elB && elA.project_id === elB.project_id && elA.source_page === elB.source_page);
                  return (
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Evidência visual</p>
                      {elA && shared ? (
                        <EvidenceImage
                          filePath={projectFiles[elA.project_id]}
                          page={elA.source_page}
                          positions={[elA, elB!].map((e) => ({ x: e.position?.x, y: e.position?.y, ref: e.element_ref }))}
                          caption={(!elA.position && !elA.element_ref) && (!elB!.position && !elB!.element_ref) ? 'Posição não capturada — re-extrair o projeto para ativar a marcação.' : undefined}
                        />
                      ) : (
                        <>
                          {elA && (
                            <EvidenceImage
                              filePath={projectFiles[elA.project_id]}
                              page={elA.source_page}
                              positions={[{ x: elA.position?.x, y: elA.position?.y, ref: elA.element_ref }]}
                              caption={(!elA.position && !elA.element_ref) ? 'Posição não capturada — re-extrair o projeto para ativar a marcação.' : undefined}
                            />
                          )}
                          {elB && (
                            <EvidenceImage
                              filePath={projectFiles[elB.project_id]}
                              page={elB.source_page}
                              positions={[{ x: elB.position?.x, y: elB.position?.y, ref: elB.element_ref }]}
                              caption={(!elB.position && !elB.element_ref) ? 'Posição não capturada — re-extrair o projeto para ativar a marcação.' : undefined}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-3">
                  <Button size="sm" variant={selected.status === 'confirmado' ? 'default' : 'outline'} onClick={() => setStatus(selected, 'confirmado')} className="gap-1.5 flex-1">
                    <Check className="w-3.5 h-3.5" /> Confirmar
                  </Button>
                  <Button size="sm" variant={selected.status === 'rejeitado' ? 'default' : 'outline'} onClick={() => setStatus(selected, 'rejeitado')} className="gap-1.5 flex-1">
                    <X className="w-3.5 h-3.5" /> Rejeitar
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function EvidenceCard({ el }: { el?: ElementRow }) {
  if (!el) return <p className="text-xs text-muted-foreground italic">Elemento não encontrado (pode ter sido re-extraído).</p>;
  const cotas = el.cota_raw || (el.cota_base != null ? `${el.cota_base}${el.cota_topo != null ? ` / ${el.cota_topo}` : ''}` : '—');
  const dims = el.dimensions ? Object.entries(el.dimensions).map(([k, v]) => `${k.replace('_mm', '')}:${v}`).join(' ') : '—';
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm">{el.element_ref || '—'}</span>
        <Badge variant="outline" className="text-[10px]">{el.element_type}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="Piso" value={el.piso} small />
        <Field label="Cotas" value={cotas} small />
        <Field label="Eixo" value={el.eixo_ref} small />
        <Field label="Dimensões" value={dims} small />
        <Field label="Material" value={el.material} small />
        <Field label="Página" value={el.source_page} small />
      </div>
      <Field label="Evidência (raw)" value={el.raw_evidence} mono small />
    </div>
  );
}

function Field({ label, value, mono, small }: { label: string; value: string | number | null; mono?: boolean; small?: boolean }) {
  if (value === null || value === undefined || value === '') {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className={`${small ? 'text-xs' : 'text-sm'} text-muted-foreground`}>—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`${small ? 'text-xs' : 'text-sm'} text-foreground whitespace-pre-wrap break-words ${mono ? 'font-mono' : ''}`}>{String(value)}</p>
    </div>
  );
}
