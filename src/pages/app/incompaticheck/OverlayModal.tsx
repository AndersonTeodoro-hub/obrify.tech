import { useState, useCallback } from 'react';
import { Layers, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { overlayPlans, type ZoneAnnotation } from '@/utils/annotate-plan-image';
import type { Project } from './types';

interface FindingForOverlay {
  id: string;
  severity: string;
  title: string;
  description: string;
  location?: string;
  zone?: { x_percent: number; y_percent: number; radius_percent: number; source_project: string; description?: string };
  conflicting_projects?: string[];
  specialties?: string[];
}

interface OverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  finding: FindingForOverlay | null;
  projects: Project[];
}

const TINT_OPTIONS: Array<{ label: string; color: [number, number, number] }> = [
  { label: 'Azul', color: [0, 100, 255] },
  { label: 'Vermelho', color: [255, 50, 50] },
  { label: 'Verde', color: [0, 180, 80] },
  { label: 'Laranja', color: [255, 140, 0] },
];

export default function OverlayModal({ isOpen, onClose, finding, projects }: OverlayModalProps) {
  const [opacity, setOpacity] = useState(0.35);
  const [tintIndex, setTintIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveProjects = (): { base: Project; overlay: Project } | null => {
    if (!finding) return null;
    if (finding.conflicting_projects && finding.conflicting_projects.length >= 2) {
      const p1 = projects.find(p => p.name === finding.conflicting_projects![0]);
      const p2 = projects.find(p => p.name === finding.conflicting_projects![1]);
      if (p1 && p2) return { base: p1, overlay: p2 };
    }
    if (finding.specialties && finding.specialties.length >= 2) {
      const typeMap: Record<string, string> = {
        'Estrutural': 'estrutural', 'Fundações': 'fundacoes', 'Rede Enterrada': 'rede_enterrada',
        'Terraplanagem': 'terraplanagem', 'Arquitectura': 'arquitectura', 'AVAC': 'avac',
        'Águas e Esgotos': 'aguas_esgotos', 'Electricidade': 'electricidade',
        'estrutural': 'estrutural', 'fundacoes': 'fundacoes', 'rede_enterrada': 'rede_enterrada',
        'terraplanagem': 'terraplanagem', 'arquitectura': 'arquitectura', 'avac': 'avac',
        'aguas_esgotos': 'aguas_esgotos', 'electricidade': 'electricidade',
      };
      const type1 = typeMap[finding.specialties[0]];
      const type2 = typeMap[finding.specialties[1]];
      if (type1 && type2) {
        const p1 = projects.find(p => p.type === type1);
        const p2 = projects.find(p => p.type === type2);
        if (p1 && p2) return { base: p1, overlay: p2 };
      }
    }
    if (finding.zone?.source_project) {
      const base = projects.find(p => p.name === finding.zone!.source_project);
      if (base) {
        const overlay = projects.find(p => p.id !== base.id && p.type !== base.type);
        if (overlay) return { base, overlay };
      }
    }
    return null;
  };

  const resolved = resolveProjects();

  const downloadPdfBase64 = async (filePath: string): Promise<string> => {
    const { data, error } = await supabase.storage.from('incompaticheck-files').download(filePath);
    if (error || !data) throw new Error('Erro ao descarregar ficheiro');
    const arrayBuffer = await data.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const handleGenerate = useCallback(async () => {
    if (!resolved || !finding) return;
    setProcessing(true);
    setError(null);
    setResultImage(null);
    try {
      const [basePdf, overlayPdf] = await Promise.all([
        downloadPdfBase64(resolved.base.file_path),
        downloadPdfBase64(resolved.overlay.file_path),
      ]);
      const annotations: ZoneAnnotation[] = [];
      if (finding.zone) {
        annotations.push({
          x_percent: finding.zone.x_percent,
          y_percent: finding.zone.y_percent,
          radius_percent: finding.zone.radius_percent,
          label: finding.id,
          severity: finding.severity,
        });
      }
      const result = await overlayPlans(basePdf, overlayPdf, annotations, {
        overlayOpacity: opacity,
        overlayTint: TINT_OPTIONS[tintIndex].color,
        scale: 2.0,
      });
      setResultImage(result);
    } catch (err: any) {
      console.error('Overlay error:', err);
      setError(err.message || 'Erro ao gerar sobreposicao');
    } finally {
      setProcessing(false);
    }
  }, [resolved, finding, opacity, tintIndex]);

  const handleDownload = () => {
    if (!resultImage || !finding) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `Sobreposicao_${finding.id}_${Date.now()}.jpg`;
    link.click();
  };

  const handleClose = () => { setResultImage(null); setError(null); onClose(); };
  const sevLabel = finding?.severity === 'alta' ? 'CRITICA' : finding?.severity === 'media' ? 'MEDIA' : 'BAIXA';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="w-5 h-5 text-primary" />
            Sobreposicao — {finding?.id}
          </DialogTitle>
        </DialogHeader>
        {finding && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant={finding.severity === 'alta' ? 'destructive' : 'secondary'} className="text-[10px]">{sevLabel}</Badge>
                <span className="text-xs text-muted-foreground">{finding.id}</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{finding.title}</p>
              {finding.location && <p className="text-xs text-muted-foreground">Local: {finding.location}</p>}
            </div>
            {resolved ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg border border-border bg-background">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Projecto Base</p>
                  <p className="text-xs font-medium text-foreground truncate">{resolved.base.name}</p>
                </div>
                <div className="p-2.5 rounded-lg border border-border" style={{ background: `rgba(${TINT_OPTIONS[tintIndex].color.join(',')}, 0.05)` }}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Projecto Sobreposto</p>
                  <p className="text-xs font-medium text-foreground truncate">{resolved.overlay.name}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-xs text-amber-600">Nao foi possivel identificar os 2 projectos. Execute nova analise.</p>
              </div>
            )}
            {resolved && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Opacidade: {Math.round(opacity * 100)}%</label>
                    <Slider value={[opacity]} min={0.15} max={0.6} step={0.05} onValueChange={([v]) => setOpacity(v)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Cor</label>
                    <div className="flex gap-2">
                      {TINT_OPTIONS.map((t, i) => (
                        <button key={t.label} onClick={() => setTintIndex(i)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${i === tintIndex ? 'border-foreground scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                          style={{ background: `rgb(${t.color.join(',')})` }} title={t.label} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleGenerate} disabled={processing} className="gap-2">
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                    {processing ? 'A gerar...' : resultImage ? 'Regenerar' : 'Gerar Sobreposicao'}
                  </Button>
                  {resultImage && (
                    <Button variant="outline" onClick={handleDownload} className="gap-2">
                      <Download className="w-4 h-4" /> Descarregar
                    </Button>
                  )}
                </div>
              </>
            )}
            {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">{error}</div>}
            {resultImage && (
              <div className="space-y-2">
                <div className="border border-border rounded-lg overflow-hidden bg-muted">
                  <img src={resultImage} alt={`Sobreposicao ${finding.id}`} className="w-full h-auto max-h-[500px] object-contain" />
                </div>
                {finding.zone?.description && <p className="text-[10px] text-muted-foreground italic px-1">Zona: {finding.zone.description}</p>}
              </div>
            )}
            {processing && (
              <div className="flex flex-col items-center py-6 text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                <p className="text-xs text-muted-foreground">A renderizar e sobrepor as plantas...</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
