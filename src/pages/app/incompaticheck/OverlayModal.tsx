import { useState, useCallback } from 'react';
import { Layers, Loader2, Download, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { overlayPlans, type ZoneAnnotation } from '@/utils/annotate-plan-image';
import type { Project } from './types';

interface OverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    zone?: { x_percent: number; y_percent: number; radius_percent: number; source_project: string };
  }>;
}

const TINT_OPTIONS: Array<{ label: string; color: [number, number, number] }> = [
  { label: 'Azul', color: [0, 100, 255] },
  { label: 'Vermelho', color: [255, 50, 50] },
  { label: 'Verde', color: [0, 180, 80] },
  { label: 'Laranja', color: [255, 140, 0] },
  { label: 'Roxo', color: [150, 50, 255] },
];

export default function OverlayModal({ isOpen, onClose, projects, findings }: OverlayModalProps) {
  const [baseProjectId, setBaseProjectId] = useState<string>('');
  const [overlayProjectId, setOverlayProjectId] = useState<string>('');
  const [opacity, setOpacity] = useState(0.35);
  const [tintIndex, setTintIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pdfProjects = projects.filter(p => p.format === 'pdf' || p.name.toLowerCase().endsWith('.pdf'));

  const downloadPdfBase64 = async (filePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('incompaticheck-files')
      .download(filePath);
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
    if (!baseProjectId || !overlayProjectId) return;

    const baseProject = projects.find(p => p.id === baseProjectId);
    const overlayProject = projects.find(p => p.id === overlayProjectId);
    if (!baseProject || !overlayProject) return;

    setProcessing(true);
    setError(null);
    setResultImage(null);

    try {
      // Download both PDFs
      const [basePdf, overlayPdf] = await Promise.all([
        downloadPdfBase64(baseProject.file_path),
        downloadPdfBase64(overlayProject.file_path),
      ]);

      // Get relevant annotations (findings that reference either project)
      const relevantAnnotations: ZoneAnnotation[] = findings
        .filter(f => f.zone && (
          f.zone.source_project === baseProject.name ||
          f.zone.source_project === overlayProject.name
        ))
        .map(f => ({
          x_percent: f.zone!.x_percent,
          y_percent: f.zone!.y_percent,
          radius_percent: f.zone!.radius_percent,
          label: f.id,
          severity: f.severity,
        }));

      // Generate overlay
      const result = await overlayPlans(basePdf, overlayPdf, relevantAnnotations, {
        overlayOpacity: opacity,
        overlayTint: TINT_OPTIONS[tintIndex].color,
        scale: 2.0,
      });

      setResultImage(result);
    } catch (err: any) {
      console.error('Overlay error:', err);
      setError(err.message || 'Erro ao gerar sobreposição');
    } finally {
      setProcessing(false);
    }
  }, [baseProjectId, overlayProjectId, opacity, tintIndex, projects, findings]);

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `Sobreposicao_${Date.now()}.jpg`;
    link.click();
  };

  const handleClose = () => {
    setResultImage(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Sobreposição de Projectos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Project selection */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Projecto Base (opaco)</label>
              <Select value={baseProjectId} onValueChange={setBaseProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar projecto base..." />
                </SelectTrigger>
                <SelectContent>
                  {pdfProjects.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === overlayProjectId}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center pb-1">
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Projecto Sobreposto (transparente)</label>
              <Select value={overlayProjectId} onValueChange={setOverlayProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar projecto a sobrepor..." />
                </SelectTrigger>
                <SelectContent>
                  {pdfProjects.map(p => (
                    <SelectItem key={p.id} value={p.id} disabled={p.id === baseProjectId}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Opacidade da sobreposição: {Math.round(opacity * 100)}%
              </label>
              <Slider
                value={[opacity]}
                min={0.1}
                max={0.7}
                step={0.05}
                onValueChange={([v]) => setOpacity(v)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Cor da sobreposição</label>
              <div className="flex gap-2">
                {TINT_OPTIONS.map((t, i) => (
                  <button
                    key={t.label}
                    onClick={() => setTintIndex(i)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      i === tintIndex ? 'border-foreground scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ background: `rgb(${t.color.join(',')})` }}
                    title={t.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={!baseProjectId || !overlayProjectId || processing || baseProjectId === overlayProjectId}
              className="gap-2"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              {processing ? 'A gerar sobreposição...' : 'Gerar Sobreposição'}
            </Button>

            {resultImage && (
              <Button variant="outline" onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Descarregar Imagem
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Result preview */}
          {resultImage && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">Resultado da Sobreposição</p>
                {findings.filter(f => f.zone).length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {findings.filter(f => f.zone).length} conflitos marcados
                  </Badge>
                )}
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-muted">
                <img
                  src={resultImage}
                  alt="Sobreposição de projectos"
                  className="w-full h-auto max-h-[500px] object-contain"
                />
              </div>
            </div>
          )}

          {/* Processing info */}
          {processing && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
              <p className="text-sm text-foreground font-medium">A gerar sobreposição...</p>
              <p className="text-xs text-muted-foreground mt-1">
                A renderizar os PDFs e a sobrepor as plantas. Pode demorar alguns segundos.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
