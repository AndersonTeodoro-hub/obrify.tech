import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ElementRow } from '@/pages/app/incompaticheck/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Layers, Search } from 'lucide-react';

const ALL = '__all__';

export default function ElementsExplorer({ obraId, refreshKey }: { obraId: string; refreshKey: number }) {
  const [elements, setElements] = useState<ElementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fEsp, setFEsp] = useState<string>(ALL);
  const [fPiso, setFPiso] = useState<string>(ALL);
  const [fTipo, setFTipo] = useState<string>(ALL);
  const [fText, setFText] = useState('');
  const [selected, setSelected] = useState<ElementRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('incompaticheck_elements')
        .select('*')
        .eq('obra_id', obraId)
        .order('source_page', { ascending: true });
      if (!cancelled) { setElements((data || []) as ElementRow[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [obraId, refreshKey]);

  const especialidades = useMemo(() => Array.from(new Set(elements.map(e => e.especialidade).filter(Boolean))).sort(), [elements]);
  const pisos = useMemo(() => Array.from(new Set(elements.map(e => e.piso).filter(Boolean) as string[])).sort(), [elements]);
  const tipos = useMemo(() => Array.from(new Set(elements.map(e => e.element_type).filter(Boolean))).sort(), [elements]);

  const filtered = useMemo(() => elements.filter(e =>
    (fEsp === ALL || e.especialidade === fEsp) &&
    (fPiso === ALL || e.piso === fPiso) &&
    (fTipo === ALL || e.element_type === fTipo) &&
    (!fText.trim() || (e.element_ref || '').toLowerCase().includes(fText.trim().toLowerCase()))
  ), [elements, fEsp, fPiso, fTipo, fText]);

  const dims = (e: ElementRow) => e.dimensions
    ? Object.entries(e.dimensions).map(([k, v]) => `${k.replace('_mm', '')}:${v}`).join(' ') : '—';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4" /> Elementos Extraídos ({filtered.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">Registo estruturado da obra — validação da qualidade da extração antes da Onda 2.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select value={fEsp} onValueChange={setFEsp}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Especialidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas especialidades</SelectItem>
              {especialidades.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPiso} onValueChange={setFPiso}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Piso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os pisos</SelectItem>
              {pisos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={fText} onChange={e => setFText(e.target.value)} placeholder="Ref (V12, P3...)" className="h-8 text-xs pl-7" />
          </div>
        </div>

        {/* Tabela */}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-8">A carregar elementos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sem elementos para os filtros atuais.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-2 font-medium">Ref</th>
                  <th className="py-1.5 pr-2 font-medium">Tipo</th>
                  <th className="py-1.5 pr-2 font-medium">Especialidade</th>
                  <th className="py-1.5 pr-2 font-medium">Piso</th>
                  <th className="py-1.5 pr-2 font-medium">Cotas</th>
                  <th className="py-1.5 pr-2 font-medium">Eixo</th>
                  <th className="py-1.5 pr-2 font-medium">Dimensões</th>
                  <th className="py-1.5 pr-2 font-medium">Conf.</th>
                  <th className="py-1.5 pr-2 font-medium">Pág.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} onClick={() => setSelected(e)}
                    className="border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                    <td className="py-1.5 pr-2 font-mono">{e.element_ref || '—'}</td>
                    <td className="py-1.5 pr-2">{e.element_type}</td>
                    <td className="py-1.5 pr-2">{e.especialidade}</td>
                    <td className="py-1.5 pr-2">{e.piso || '—'}</td>
                    <td className="py-1.5 pr-2">{e.cota_raw || (e.cota_base != null ? `${e.cota_base}${e.cota_topo != null ? `/${e.cota_topo}` : ''}` : '—')}</td>
                    <td className="py-1.5 pr-2">{e.eixo_ref || '—'}</td>
                    <td className="py-1.5 pr-2">{dims(e)}</td>
                    <td className="py-1.5 pr-2">
                      <Badge variant={e.confidence >= 0.7 ? 'success' : e.confidence >= 0.5 ? 'high' : 'critical'} className="text-[10px]">
                        {e.confidence.toFixed(2)}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-2">{e.source_page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Painel lateral com evidencia completa */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono">{selected.element_ref || selected.element_type}</span>
                  <Badge variant="outline" className="text-[10px]">{selected.element_type}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Evidência (raw_evidence)" value={selected.raw_evidence} mono />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Especialidade" value={selected.especialidade} />
                  <Field label="Piso" value={selected.piso} />
                  <Field label="Cota base" value={selected.cota_base} />
                  <Field label="Cota topo" value={selected.cota_topo} />
                  <Field label="Cota (original)" value={selected.cota_raw} />
                  <Field label="Eixo" value={selected.eixo_ref} />
                  <Field label="Material" value={selected.material} />
                  <Field label="Confiança" value={selected.confidence.toFixed(2)} />
                  <Field label="Página fonte" value={selected.source_page} />
                  <Field label="Zona" value={selected.source_zone} />
                </div>
                {selected.dimensions && <Field label="Dimensões" value={JSON.stringify(selected.dimensions, null, 2)} mono />}
                {selected.route && <Field label="Traçado (route)" value={JSON.stringify(selected.route, null, 2)} mono />}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string | number | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-sm text-foreground whitespace-pre-wrap break-words ${mono ? 'font-mono text-xs' : ''}`}>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </p>
    </div>
  );
}
