import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Loader2, AlertTriangle, CheckCircle2, RotateCcw, SkipForward, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// Sequência de ângulos guiada (ponto 9 do âmbito): dispara automaticamente, por
// temporizador de software, um frame por ângulo predefinido do ponto de captura.
// O avanço de ângulo depende só do temporizador — não do hardware — para que um
// futuro braço mecânico motorizado possa ser ligado sem tocar nesta lógica.

interface SequenceCapturePoint {
  id: string;
  code: string;
  angle_sequence?: string[] | null;
}

interface SequenceCaptureModalProps {
  point: SequenceCapturePoint | null;
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type AngleState = 'pending' | 'countdown' | 'captured' | 'skipped' | 'error';

interface AngleSlot {
  label: string;
  state: AngleState;
  blob?: Blob;
  previewUrl?: string;
  error?: string;
}

const COUNTDOWN_SECONDS = 3;

export function SequenceCaptureModal({ point, siteId, open, onOpenChange, onComplete }: SequenceCaptureModalProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [slots, setSlots] = useState<AngleSlot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  const sequence = point?.angle_sequence || [];

  // Reset ao abrir/mudar de ponto
  useEffect(() => {
    if (!open || !point) return;
    setSlots(sequence.map((label) => ({ label, state: 'pending' as AngleState })));
    setCurrentIndex(0);
    setCountdown(null);
    setCameraError(null);
    setCameraReady(false);
    setFinished(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, point?.id]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Pedir câmara ao abrir (só se houver sequência definida)
  useEffect(() => {
    if (!open || sequence.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
        setCameraError(null);
      } catch (err: any) {
        console.error('SequenceCaptureModal: getUserMedia falhou', err);
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Permissão de câmara negada. Autorize o acesso à câmara ou use o carregamento manual abaixo.'
            : `Câmara indisponível (${err?.message || err?.name || 'erro desconhecido'}). Use o carregamento manual abaixo.`,
        );
        toast.error('Não foi possível abrir a câmara — use o carregamento manual para não perder a sequência.');
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sequence.length]);

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  const snapFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        resolve(null);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    });
  }, []);

  const setSlot = (index: number, patch: Partial<AngleSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const captureCurrentAngle = useCallback(async () => {
    const idx = currentIndex;
    const blob = await snapFrame();
    if (!blob) {
      setSlot(idx, { state: 'error', error: 'Falha ao capturar frame da câmara' });
      toast.error(`Ângulo "${sequence[idx]}": falha ao capturar — pode recapturar abaixo.`);
      return;
    }
    setSlot(idx, { state: 'captured', blob, previewUrl: URL.createObjectURL(blob) });
  }, [currentIndex, snapFrame, sequence]);

  // Contagem decrescente automática por ângulo, enquanto a câmara estiver pronta
  useEffect(() => {
    if (!open || !cameraReady || finished) return;
    if (currentIndex >= sequence.length) return;
    if (slots[currentIndex]?.state !== 'pending') return;

    setCountdown(COUNTDOWN_SECONDS);
    setSlot(currentIndex, { state: 'countdown' });
    let remaining = COUNTDOWN_SECONDS;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        captureCurrentAngle();
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraReady, currentIndex, finished]);

  // Avançar automaticamente para o ângulo seguinte assim que o actual for capturado/saltado
  useEffect(() => {
    if (currentIndex >= sequence.length) return;
    const state = slots[currentIndex]?.state;
    if (state === 'captured' || state === 'skipped') {
      if (currentIndex + 1 < sequence.length) {
        const t = setTimeout(() => setCurrentIndex((i) => i + 1), 600);
        return () => clearTimeout(t);
      } else {
        setFinished(true);
      }
    }
  }, [slots, currentIndex, sequence.length]);

  const retryAngle = (index: number) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { label: s.label, state: 'pending' } : s)));
    setCurrentIndex(index);
    setFinished(false);
  };

  const skipAngle = () => {
    setSlot(currentIndex, { state: 'skipped' });
    toast.warning(`Ângulo "${sequence[currentIndex]}" saltado — fica registado como em falta.`);
  };

  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSlot(currentIndex, { state: 'captured', blob: file, previewUrl: URL.createObjectURL(file) });
  };

  const missing = slots.filter((s) => s.state === 'skipped' || s.state === 'error');
  const captured = slots.filter((s) => s.state === 'captured');
  const allDone = slots.length > 0 && slots.every((s) => s.state === 'captured' || s.state === 'skipped' || s.state === 'error');

  const handleFinish = async () => {
    if (!point || !user) return;
    setSubmitting(true);
    try {
      const { data: site, error: siteErr } = await supabase
        .from('sites')
        .select('org_id')
        .eq('id', siteId)
        .single();
      if (siteErr || !site) throw new Error(siteErr?.message || 'Obra não encontrada para gravar o caminho de upload');

      let uploaded = 0;
      const uploadErrors: string[] = [];

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.state !== 'captured' || !slot.blob) continue;
        try {
          const timestamp = Date.now();
          const randomId = crypto.randomUUID().slice(0, 8);
          const safeLabel = slot.label.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `${site.org_id}/${siteId}/${timestamp}_${randomId}_${safeLabel}.jpg`;
          const { error: upErr } = await supabase.storage.from('captures').upload(filePath, slot.blob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
          });
          if (upErr) throw upErr;

          // angle_label ainda não está nos tipos gerados (coluna nova, migração
          // manual pendente) — cast necessário até o Anderson correr o SQL.
          const { error: insErr } = await (supabase as any).from('captures').insert({
            site_id: siteId,
            capture_point_id: point.id,
            user_id: user.id,
            file_path: filePath,
            source_type: 'phone_manual',
            angle_label: slot.label,
            processing_status: 'DONE',
            captured_at: new Date().toISOString(),
            mime_type: 'image/jpeg',
            size_bytes: slot.blob.size,
          });
          if (insErr) {
            // Órfão evitado: se o insert falhar, remove o ficheiro já enviado.
            await supabase.storage.from('captures').remove([filePath]);
            throw insErr;
          }
          uploaded++;
        } catch (err: any) {
          console.error('SequenceCaptureModal: falha ao gravar ângulo', slot.label, err);
          uploadErrors.push(`${slot.label}: ${err.message || 'erro desconhecido'}`);
        }
      }

      if (uploadErrors.length > 0) {
        toast.error(`${uploadErrors.length} ângulo(s) não guardado(s): ${uploadErrors.join('; ')}`);
      }
      if (uploaded > 0) {
        toast.success(`${uploaded} de ${sequence.length} ângulo(s) do ponto ${point.code} guardado(s).`);
      }
      if (missing.length > 0) {
        toast.warning(`Em falta: ${missing.map((m) => m.label).join(', ')}. Pode repetir agora, ainda na obra.`);
      }
      onComplete?.();
      if (missing.length === 0 && uploadErrors.length === 0) {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error('Erro ao gravar sequência: ' + (err.message || 'erro desconhecido'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!point) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sequência guiada — {point.code}</DialogTitle>
        </DialogHeader>

        {sequence.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
            <p className="font-medium">Este ponto não tem sequência de ângulos definida.</p>
            <p className="text-sm text-muted-foreground">
              Edite o ponto na planta e defina os rótulos de ângulo (ex.: Norte, Sul, Este, Oeste) antes de usar a captura guiada.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progresso */}
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s, i) => (
                <Badge
                  key={i}
                  variant={i === currentIndex && !finished ? 'default' : 'outline'}
                  className={
                    s.state === 'captured' ? 'border-green-500 text-green-600' :
                    s.state === 'skipped' || s.state === 'error' ? 'border-destructive text-destructive' : ''
                  }
                >
                  {s.state === 'captured' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                  {(s.state === 'skipped' || s.state === 'error') && <AlertTriangle className="w-3 h-3 mr-1" />}
                  {s.label}
                </Badge>
              ))}
            </div>

            {!finished ? (
              <>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Ângulo {currentIndex + 1} de {sequence.length}
                  </p>
                  <p className="text-xl font-bold">{sequence[currentIndex]}</p>
                </div>

                {/* Preview de câmara */}
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                  {cameraError ? (
                    <div className="text-center p-6 text-white/80 space-y-3">
                      <AlertTriangle className="w-8 h-8 mx-auto text-amber-400" />
                      <p className="text-sm">{cameraError}</p>
                      <Button size="sm" onClick={() => fallbackInputRef.current?.click()}>
                        <Camera className="w-4 h-4 mr-2" /> Carregar foto manualmente para "{sequence[currentIndex]}"
                      </Button>
                    </div>
                  ) : (
                    <>
                      <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                      {countdown !== null && countdown > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="text-6xl font-bold text-white drop-shadow-lg">{countdown}</span>
                        </div>
                      )}
                      {!cameraReady && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                      )}
                    </>
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <input
                  ref={fallbackInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFallbackFile}
                />

                {slots[currentIndex]?.state === 'captured' && slots[currentIndex]?.previewUrl && (
                  <div className="flex items-center gap-3 rounded-md border p-2">
                    <img src={slots[currentIndex].previewUrl} alt={sequence[currentIndex]} className="h-16 w-24 object-cover rounded" />
                    <p className="text-sm text-muted-foreground flex-1">Capturado. A avançar para o próximo ângulo…</p>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={skipAngle} disabled={slots[currentIndex]?.state === 'captured'}>
                    <SkipForward className="w-4 h-4 mr-1" /> Saltar este ângulo
                  </Button>
                  {slots[currentIndex]?.state === 'captured' && (
                    <Button variant="outline" size="sm" onClick={() => retryAngle(currentIndex)}>
                      <RotateCcw className="w-4 h-4 mr-1" /> Recapturar
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border p-4 space-y-1">
                  <p className="font-medium">
                    {captured.length} de {sequence.length} ângulos capturados.
                  </p>
                  {missing.length > 0 && (
                    <p className="text-sm text-destructive">
                      Em falta: {missing.map((m) => m.label).join(', ')} — pode recapturar agora, ainda na obra.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((s, i) => (
                    <div key={i} className="space-y-1">
                      {s.previewUrl ? (
                        <img src={s.previewUrl} alt={s.label} className="w-full aspect-video object-cover rounded border" />
                      ) : (
                        <div className="w-full aspect-video rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                          Sem imagem
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs">{s.label}</span>
                        {(s.state === 'skipped' || s.state === 'error') && (
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => retryAngle(i)}>
                            Repetir
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            <X className="w-4 h-4 mr-1" /> {finished ? 'Fechar sem guardar' : 'Cancelar'}
          </Button>
          {finished && (
            <Button onClick={handleFinish} disabled={submitting || captured.length === 0}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar {captured.length} foto(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
