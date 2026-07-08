import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCrossAnalysis } from '@/hooks/useCrossAnalysis';
import type { CrossFinding, ElementRow } from '@/pages/app/incompaticheck/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { GitCompareArrows, AlertTriangle, Loader2, RotateCcw, Check, X } from 'lucide-react';

const SEV_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const sevVariant = (s: string) => (s === 'alta' ? 'critical' : s === 'media' ? 'high' : 'success');
const sevLabel = (s: string) => (s === 'alta' ? 'Alta' : s === 'media' ? 'Média' : 'Baixa');

export default function CrossAnalysisPanel({ obraId, refreshKey }: { obraId: string; refreshKey: number }) {
  const cross = useCrossAnalysis(obraId, refreshKey);
  const [elementsMap, setElementsMap] = useState<Record<string, ElementRow>>({});
  const [selected, setSelected] = useState<CrossFinding | null>(null);

  // Carrega elementos da obra para renderizar a evidencia dupla
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
  }, [obraId, refreshKey, cross.findings.length]);

  const canCross = cross.especialidades.length >= 2;

  // Agrupa por par (normalizado) e ordena por severidade
  const groups = useMemo(() => {
    const byPair: Record<string, { label: string; items: CrossFinding[] }> = {};
    for (const f of cross.findings) {
      const [a, b] = [f.especialidade_a, f.especialidade_b].sort((x, y) => x.localeCompare(y));
      const key = `${a}|${b}`;
      if (!byPair[key]) byPair[key] = { label: `${a} × ${b}`, items: [] };
      byPair[key].items.push(f);
    }
    Object.values(byPair).forEach(g => g.items.sort((x, y) => (SEV_ORDER[x.severity] - SEV_ORDER[y.severity]) || (y.confidence - x.confidence)));
    return Object.entries(byPair).map(([key, g]) => ({ key, ...g })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cross.findings]);

  const counts = useMemo(() => {
    const c = { total: cross.findings.length, alta: 0, media: 0, baixa: 0, confirmado: 0, rejeitado: 0 };
    for (const f of cross.findings) {
      c[f.severity]++;
      if (f.status === 'confirmado') c.confirmado++;
      if (f.status === 'rejeitado') c.rejeitado++;
    }
    return c;
  }, [cross.findings]);

  const setStatus = async (f: CrossFinding, status: 'confirmado' | 'rejeitado') => {
    try {
      await cross.updateFindingStatus(f.id, status);
      setSelected(prev => (prev && prev.id === f.id ? { ...prev, status } : prev));
    } catch (err: any) {
      // Erro ruidoso: mensagem completa no mesmo alerta destrutivo do painel
      cross.setCrossError(`Não foi possível ${status === 'confirmado' ? 'confirmar' : 'rejeitar'} o finding: ${err.message}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4" /> Análise Cruzada
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {counts.total > 0 && (
              <div className="flex gap-1.5 text-[10px] text-muted-foreground items-center">
                <Badge variant="critical" className="text-[10px]">{counts.alta} alta</Badge>
                <Badge variant="high" className="text-[10px]">{counts.media} média</Badge>
                <Badge variant="success" className="text-[10px]">{counts.baixa} baixa</Badge>
                <span>· {counts.confirmado} confirmados · {counts.rejeitado} rejeitados</span>
              </div>
            )}
            <Button
              variant="accent"
              size="sm"
              onClick={cross.runCrossAnalysis}
              disabled={!canCross || cross.running}
              className="gap-1.5"
              title={!canCross ? 'Precisa de elementos extraídos de pelo menos 2 especialidades' : undefined}
            >
              {cross.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompareArrows className="w-3.5 h-3.5" />}
              Cruzar Especialidades
            </Button>
          </div>
        </div>
        {!canCross && (
          <p className="text-xs text-muted-foreground">
            Extraia elementos de pelo menos 2 especialidades para cruzar.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progresso */}
        {cross.progress.active && (
          <div className="space-y-1.5 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-foreground">
              A cruzar <span className="font-medium">{cross.progress.parAtual}</span>
              {cross.progress.total > 1 && ` (${cross.progress.index}/${cross.progress.total})`}
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}
        {/* Erro ruidoso persistente */}
        {cross.crossError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/40 p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive whitespace-pre-wrap break-words flex-1">{cross.crossError}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={cross.clearError} className="h-6 text-xs">Fechar</Button>
          </div>
        )}

        {cross.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Sem incompatibilidades cruzadas. Corra "Cruzar Especialidades".
          </p>
        ) : (
          groups.map(group => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label} ({group.items.length})</p>
                <Button
                  variant="ghost" size="sm" className="h-6 gap-1 text-[11px]"
                  disabled={cross.running || cross.progress.active}
                  onClick={() => cross.runSinglePair(group.items[0].especialidade_a, group.items[0].especialidade_b).catch(() => {})}
                >
                  <RotateCcw className="w-3 h-3" /> Re-cruzar
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
                      <Badge variant="outline" className="text-[10px]">{f.tipo_conflito}</Badge>
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

      {/* Painel lateral: evidencia dupla + accoes */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  <Badge variant={sevVariant(selected.severity) as any} className="text-[10px]">{sevLabel(selected.severity)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{selected.tipo_conflito}</Badge>
                  <span className="text-sm">{selected.title}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Descrição" value={selected.description} />
                <Field label="Impacto" value={selected.impact} />
                <Field label="Localização" value={selected.location} />
                <Field label="Recomendação" value={selected.recommendation} />
                <Field label="Nota de construtibilidade" value={selected.constructability_note} />
                <Field label="Confiança" value={selected.confidence.toFixed(2)} />

                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Evidência — {selected.especialidade_a}</p>
                  <EvidenceCard el={elementsMap[selected.element_a_id]} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Evidência — {selected.especialidade_b}</p>
                  {selected.element_b_id
                    ? <EvidenceCard el={elementsMap[selected.element_b_id]} />
                    : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Elemento em falta em {selected.especialidade_b}</p>
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{selected.description}</p>
                      </div>
                    )}
                </div>

                <div className="flex gap-2 pt-3">
                  <Button
                    size="sm"
                    variant={selected.status === 'confirmado' ? 'default' : 'outline'}
                    onClick={() => setStatus(selected, 'confirmado')}
                    className="gap-1.5 flex-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant={selected.status === 'rejeitado' ? 'default' : 'outline'}
                    onClick={() => setStatus(selected, 'rejeitado')}
                    className="gap-1.5 flex-1"
                  >
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
