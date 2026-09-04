import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2, ImageOff, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// Comparação temporal (ponto 10 do âmbito): mesmo ponto de captura, mesmo ângulo,
// datas diferentes, lado a lado — para avaliar evolução dos trabalhos.

interface CapturePointComparisonModalProps {
  capturePointId: string | null;
  pointCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CaptureRow {
  id: string;
  file_path: string;
  captured_at: string | null;
  created_at: string;
  angle_label: string | null;
}

const NO_ANGLE = '__sem_angulo__';

function dateKey(c: CaptureRow): string {
  const d = c.captured_at || c.created_at;
  return d.slice(0, 10);
}

// Diferença perceptual simples e HONESTA: reduz ambas as imagens a 32x32 e compara a
// diferença média de luminância por píxel. Não é reconhecimento de cena — só sinaliza
// que o enquadramento/conteúdo mudou de forma acentuada, para o fiscal confirmar.
async function perceptualDiff(urlA: string, urlB: string): Promise<number | null> {
  const SIZE = 32;
  const loadGray = (url: string): Promise<Uint8ClampedArray | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
          const gray = new Uint8ClampedArray(SIZE * SIZE);
          for (let i = 0; i < SIZE * SIZE; i++) {
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
          }
          resolve(gray);
        } catch {
          resolve(null); // ex.: canvas "tainted" por CORS — falha silenciosa só da heurística, não da comparação
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const [a, b] = await Promise.all([loadGray(urlA), loadGray(urlB)]);
  if (!a || !b) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length; // 0..255, quanto maior, mais diferente
}

const DIFF_THRESHOLD = 35; // limiar arbitrário — heurística grosseira, não IA de visão

function PairCell({ label, urlA, urlB }: { label: string; urlA: string | null; urlB: string | null }) {
  const [flagged, setFlagged] = useState<boolean | null>(null);

  useEffect(() => {
    setFlagged(null);
    if (!urlA || !urlB) return;
    let cancelled = false;
    perceptualDiff(urlA, urlB).then((diff) => {
      if (cancelled || diff === null) return;
      setFlagged(diff > DIFF_THRESHOLD);
    });
    return () => { cancelled = true; };
  }, [urlA, urlB]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40">
        <span className="text-sm font-medium">{label}</span>
        {flagged && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="w-3 h-3" /> Enquadramento pode ter mudado
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-border">
        {[urlA, urlB].map((url, i) => (
          <div key={i} className="aspect-video bg-muted flex items-center justify-center">
            {url ? (
              <img src={url} alt={`${label} ${i === 0 ? 'A' : 'B'}`} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs p-2 text-center">
                <ImageOff className="w-5 h-5" />
                <span>Sem captura deste ângulo nesta data</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground px-3 py-1">
        Aviso de enquadramento: heurística de diferença de imagem (não é reconhecimento de cena) — confirme visualmente.
      </p>
    </div>
  );
}

export function CapturePointComparisonModal({ capturePointId, pointCode, open, onOpenChange }: CapturePointComparisonModalProps) {
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [dateA, setDateA] = useState<string>('');
  const [dateB, setDateB] = useState<string>('');

  useEffect(() => {
    if (!open || !capturePointId) return;
    setLoading(true);
    setCaptures([]);
    setDateA(''); setDateB('');
    // angle_label ainda não está nos tipos gerados (coluna nova, migração manual
    // pendente) — cast necessário até o Anderson correr o SQL.
    (supabase as any)
      .from('captures')
      .select('id, file_path, captured_at, created_at, angle_label')
      .eq('capture_point_id', capturePointId)
      .order('captured_at', { ascending: true })
      .then(({ data, error }: any) => {
        if (error) {
          console.error('CapturePointComparisonModal: erro a carregar capturas', error);
          setCaptures([]);
        } else {
          setCaptures((data || []) as CaptureRow[]);
        }
        setLoading(false);
      });
  }, [open, capturePointId]);

  const byDate = useMemo(() => {
    const map = new Map<string, CaptureRow[]>();
    for (const c of captures) {
      const k = dateKey(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }, [captures]);

  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);

  useEffect(() => {
    if (dates.length >= 2 && !dateA && !dateB) {
      setDateA(dates[dates.length - 2]);
      setDateB(dates[dates.length - 1]);
    } else if (dates.length === 1 && !dateA) {
      setDateA(dates[0]);
      setDateB(dates[0]);
    }
  }, [dates, dateA, dateB]);

  // Carregar URLs assinados de todas as capturas relevantes às duas datas escolhidas
  useEffect(() => {
    const relevant = [...(byDate.get(dateA) || []), ...(byDate.get(dateB) || [])];
    const missing = relevant.filter((c) => !signedUrls[c.file_path]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (c) => {
        const { data, error } = await supabase.storage.from('captures').createSignedUrl(c.file_path, 3600);
        if (error || !data?.signedUrl) {
          console.error('CapturePointComparisonModal: falha ao assinar URL', c.file_path, error);
          return null;
        }
        return [c.file_path, data.signedUrl] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const p of pairs) if (p) next[p[0]] = p[1];
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateA, dateB, byDate]);

  const anglesFor = (date: string) => new Map((byDate.get(date) || []).map((c) => [c.angle_label || NO_ANGLE, c]));
  const anglesA = anglesFor(dateA);
  const anglesB = anglesFor(dateB);
  const allAngles = useMemo(() => {
    const set = new Set<string>([...anglesA.keys(), ...anglesB.keys()]);
    return [...set].sort((x, y) => (x === NO_ANGLE ? 1 : y === NO_ANGLE ? -1 : x.localeCompare(y)));
  }, [anglesA, anglesB]);

  const fmt = (d: string) => (d ? format(new Date(d + 'T00:00:00'), "dd 'de' MMMM yyyy", { locale: pt }) : '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comparação temporal — {pointCode || 'Ponto de captura'}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : dates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Ainda não há capturas registadas neste ponto.</p>
        ) : dates.length === 1 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Só há capturas numa data ({fmt(dates[0])}) — a comparação fica disponível quando houver uma segunda data.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data A</Label>
                <Select value={dateA} onValueChange={setDateA}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dates.map((d) => <SelectItem key={d} value={d}>{fmt(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data B</Label>
                <Select value={dateB} onValueChange={setDateB}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dates.map((d) => <SelectItem key={d} value={d}>{fmt(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              {allAngles.map((angle) => {
                const capA = anglesA.get(angle);
                const capB = anglesB.get(angle);
                return (
                  <PairCell
                    key={angle}
                    label={angle === NO_ANGLE ? 'Sem ângulo definido' : angle}
                    urlA={capA ? signedUrls[capA.file_path] || null : null}
                    urlB={capB ? signedUrls[capB.file_path] || null : null}
                  />
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
