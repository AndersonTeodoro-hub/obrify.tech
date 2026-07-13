import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Image, Video, View } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { extractExifData } from '@/lib/exif-parser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DropZone } from './DropZone';
import { FilePreviewGrid } from './FilePreviewGrid';
import { SmartCaptureButtons } from './SmartCaptureButtons';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CaptureCategory, CaptureSource, FileWithPreview, CaptureFileMeta } from '@/types/captures';

// Limites de tamanho
const WARN_SIZE_ORIGINAL = 20 * 1024 * 1024; // 20MB - aviso antes de comprimir
const WARN_SIZE_COMPRESSED = 5 * 1024 * 1024; // 5MB - aviso após compressão
const MAX_IMAGE_WIDTH = 1920;
const JPEG_QUALITY = 0.85;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1000; // 1s, 2s, 4s

// Compressão de imagem via Canvas nativo. NÃO queima carimbo: a marca d'água passou
// a ser renderizada a partir dos metadados (ver src/lib/watermark.ts), pelo que o
// original fica LIMPO no storage e permite edição/correção a posteriori.
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    // Não comprimir vídeos ou ficheiros não-imagem
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;

        // Só redimensionar se for maior que o máximo
        if (width > MAX_IMAGE_WIDTH) {
          const ratio = MAX_IMAGE_WIDTH / width;
          width = MAX_IMAGE_WIDTH;
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // fallback: enviar original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // fallback: enviar original
              return;
            }
            // Não reduziu -> manter o original.
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            });
            resolve(compressed);
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      } catch {
        resolve(file); // fallback: enviar original
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback: enviar original
    };

    img.src = url;
  });
}

// Upload com retry e backoff exponencial
async function uploadWithRetry(
  bucket: string,
  filePath: string,
  file: File,
  options: { cacheControl: string; upsert: boolean }
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, options);

    if (!error) return; // sucesso

    lastError = error;
    console.warn(`Upload attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed:`, error.message);

    if (attempt < RETRY_ATTEMPTS - 1) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

interface NewCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_TO_SOURCE: Record<CaptureCategory, CaptureSource> = {
  photo: 'phone_manual',
  video: 'drone_video',
  panorama: 'phone_360',
};

const MAX_FILES = 30;

// Contexto pegajoso: última obra/especialidade/fase/nível escolhidos pelo fiscal.
const STICKY_KEY = 'obrify_capture_context';
type StickyCtx = { siteId?: string; especialidade?: string; fase?: string; nivelId?: string; contextId?: string };
function loadSticky(): StickyCtx {
  try {
    return JSON.parse(localStorage.getItem(STICKY_KEY) || '{}') as StickyCtx;
  } catch {
    return {};
  }
}

export function NewCaptureModal({ open, onOpenChange }: NewCaptureModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Selection state (contexto pegajoso via localStorage)
  const sticky = loadSticky();
  const [selectedSite, setSelectedSite] = useState<string>(sticky.siteId || '');
  const [especialidade, setEspecialidade] = useState<string>(sticky.especialidade || '');
  const [fase, setFase] = useState<string>(sticky.fase || '');
  const [nivelId, setNivelId] = useState<string>(sticky.nivelId || '');
  const [contextId, setContextId] = useState<string>(sticky.contextId || '');
  const [contextSearch, setContextSearch] = useState('');
  const [captureType, setCaptureType] = useState<CaptureCategory>('photo');
  const [notes, setNotes] = useState('');

  // Input escondido para abrir a câmara imediatamente ao escolher um contexto
  const quickInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.preview));
    };
  }, []);

  // Fetch user's organizations and sites
  const { data: sites = [] } = useQuery({
    queryKey: ['user-sites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: memberships } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);

      if (!memberships?.length) return [];

      const orgIds = memberships.map((m) => m.org_id);

      const { data: sites } = await supabase
        .from('sites')
        .select('id, name, org_id, incompaticheck_obra_id')
        .in('org_id', orgIds)
        .order('name');

      return sites || [];
    },
    enabled: !!user && open,
  });

  // Ponte: obra Silva (incompaticheck) desta obra, para carregar o catálogo de níveis
  const selectedSiteObj = sites.find((s) => s.id === selectedSite);
  const obraId = (selectedSiteObj as any)?.incompaticheck_obra_id as string | null | undefined;

  // Catálogo de níveis (Especialidade > Fase > Piso/Cota) da obra
  const { data: niveis = [] } = useQuery({
    queryKey: ['eng-silva-niveis', obraId],
    queryFn: async () => {
      if (!obraId) return [];
      const { data, error } = await supabase
        .from('eng_silva_niveis')
        .select('id, specialty, fase, piso, cota, tipo')
        .eq('obra_id', obraId)
        .order('specialty');
      if (error) {
        console.error('Erro a carregar níveis:', error);
        toast.error('Erro ao carregar níveis: ' + error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!obraId,
  });

  const especialidades = [...new Set(niveis.map((n) => n.specialty).filter(Boolean))] as string[];
  const fases = [...new Set(
    niveis
      .filter((n) => !especialidade || n.specialty === especialidade)
      .map((n) => n.fase)
      .filter(Boolean),
  )] as string[];
  const niveisFiltrados = niveis.filter(
    (n) => (!especialidade || n.specialty === especialidade) && (!fase || n.fase === fase),
  );

  // Contextos de captura da obra (não arquivados), ordenados por uso recente
  const { data: contexts = [] } = useQuery({
    queryKey: ['capture-contexts', selectedSite],
    queryFn: async () => {
      if (!selectedSite) return [];
      const { data, error } = await supabase
        .from('capture_contexts')
        .select('id, especialidade, fase, piso, cota, ambiente, atividade, nivel_id, label')
        .eq('site_id', selectedSite)
        .is('archived_at', null)
        .order('last_used_at', { ascending: false, nullsFirst: false });
      if (error) {
        console.error('Erro a carregar contextos:', error);
        toast.error('Erro ao carregar contextos: ' + error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!selectedSite,
  });

  // Meta do contexto ATIVO (o que a PRÓXIMA foto vai herdar). Recalculado a cada
  // render e guardado num ref, para o handler da câmara ler sempre o valor ACTUAL
  // no momento do disparo — nunca um valor preso do início da sessão.
  const resolveActiveMeta = (): CaptureFileMeta => {
    const ctxSel = contexts.find((c: any) => c.id === contextId) || null;
    const nivelSel = niveisFiltrados.find((n) => n.id === nivelId) || null;
    const especialidadeV = ctxSel ? ctxSel.especialidade : (especialidade || null);
    const faseV = ctxSel ? ctxSel.fase : (fase || null);
    const nivelIdV = ctxSel ? ctxSel.nivel_id : (nivelId || null);
    const pisoV = ctxSel ? ctxSel.piso : (nivelSel?.piso ?? null);
    const cotaV = ctxSel ? ctxSel.cota : (nivelSel?.cota ?? null);
    const ambienteV = ctxSel ? ctxSel.ambiente : null;
    const atividadeV = ctxSel ? ctxSel.atividade : null;
    const label = ctxSel?.label
      || [especialidadeV, faseV ? `Fase ${faseV}` : '', pisoV ? `${pisoV}${cotaV != null ? ` (${cotaV})` : ''}` : '']
        .filter(Boolean).join(' · ');
    return {
      especialidade: especialidadeV, fase: faseV, nivelId: nivelIdV,
      piso: pisoV, cota: cotaV, ambiente: ambienteV, atividade: atividadeV,
      label, contextId: contextId || null,
    };
  };
  const activeMeta = resolveActiveMeta();
  const metaRef = useRef<CaptureFileMeta>(activeMeta);
  metaRef.current = activeMeta;
  const filesLenRef = useRef(0);
  filesLenRef.current = files.length;

  // Confirmação do contexto pegajoso ao (re)abrir o modal — mata o defeito de
  // fotografar com a fase da sessão anterior sem reparar. Enquanto não confirmar,
  // a captura fica bloqueada.
  const [needsStickyConfirm, setNeedsStickyConfirm] = useState(false);
  useEffect(() => {
    if (open) {
      const hasContext = !!(contextId || fase || especialidade || nivelId);
      setNeedsStickyConfirm(hasContext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escolher contexto -> abrir a câmara IMEDIATAMENTE (síncrono; Safari/iOS exige
  // que a abertura da câmara seja resposta directa ao gesto, sem setTimeout).
  const pickContext = (id: string) => {
    setContextId(id);
    quickInputRef.current?.click();
  };

  // Handle file selection
  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    // Snapshot do contexto ATIVO no momento do disparo (via ref: nunca stale).
    const shotMeta = metaRef.current;

    // Limite explícito: nunca descartar fotos em silêncio.
    const available = Math.max(0, MAX_FILES - filesLenRef.current);
    const accepted = newFiles.slice(0, available);
    const dropped = newFiles.length - accepted.length;
    if (dropped > 0) {
      toast.warning(
        `Limite de ${MAX_FILES} fotos por captura — ${dropped} foto(s) não foram adicionadas. Guarde estas e faça outra captura.`,
      );
    }

    const processedFiles: FileWithPreview[] = [];
    for (const file of accepted) {
      const id = crypto.randomUUID();
      const preview = URL.createObjectURL(file);

      // Extract EXIF data for images
      let exifData = null;
      if (file.type.startsWith('image/')) {
        try {
          exifData = await extractExifData(file);
        } catch (e) {
          console.warn('Failed to extract EXIF:', e);
        }
      }

      processedFiles.push({
        id,
        file,
        preview,
        exifData,
        status: 'pending',
        progress: 0,
        meta: shotMeta,
      });
    }

    setFiles((prev) => [...prev, ...processedFiles]);
  }, []);

  // Remove file from list
  const handleRemoveFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user || files.length === 0) throw new Error('Missing required data');

      // Obter org_id a partir da obra seleccionada
      const site = sites.find((s) => s.id === selectedSite);
      if (!site) throw new Error('Selecione a obra');

      // Os metadados (fase/piso/etc.) são POR FOTO — capturados no disparo em
      // fileData.meta — não resolvidos aqui ao nível do lote.
      let successCount = 0;
      let errorCount = 0;

      // Validação de tamanho: avisar sobre ficheiros muito grandes
      const largeFiles = files.filter((f) => f.file.size > WARN_SIZE_ORIGINAL);
      if (largeFiles.length > 0) {
        const names = largeFiles.map((f) => f.file.name).join(', ');
        toast.warning(`Ficheiros grandes detectados (>20MB): ${names}. A comprimir antes de enviar...`);
      }

      for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        setCurrentUploadIndex(i);

        try {
          // Fase 1: Compressão
          const updateFileState = (updates: Partial<import('@/types/captures').FileWithPreview>) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileData.id ? { ...f, ...updates } : f))
            );
          };

          updateFileState({
            status: 'compressing',
            statusText: 'A comprimir...',
            progress: 10,
          });

          // Data/hora da captura (metadado; o carimbo é renderizado depois a partir
          // dos metadados, não queimado nos pixels).
          const capturedAt = fileData.exifData?.dateTime || new Date();
          const compressedFile = await compressImage(fileData.file);

          // Avisar se após compressão ainda for grande
          if (compressedFile.size > WARN_SIZE_COMPRESSED && compressedFile.size < fileData.file.size) {
            console.warn(`Ficheiro ${fileData.file.name} comprimido para ${(compressedFile.size / 1024 / 1024).toFixed(1)}MB (ainda >5MB)`);
          }

          updateFileState({
            status: 'uploading',
            statusText: 'A enviar...',
            progress: 30,
          });

          // Fase 2: Upload com retry
          const timestamp = Date.now();
          const safeName = compressedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const filePath = `${site.org_id}/${selectedSite}/${timestamp}_${fileData.id.slice(0, 8)}_${safeName}`;

          await uploadWithRetry('captures', filePath, compressedFile, {
            cacheControl: '3600',
            upsert: false,
          });

          updateFileState({
            statusText: 'A guardar...',
            progress: 80,
          });

          // Fase 3: Insert na BD (por site_id directo; ponto de captura já não é obrigatório)
          const { error: insertError } = await supabase.from('captures').insert({
            site_id: selectedSite,
            capture_point_id: null,
            user_id: user.id,
            file_path: filePath,
            source_type: CATEGORY_TO_SOURCE[captureType],
            processing_status: 'DONE', // estado neutro: não há processamento automático
            captured_at: capturedAt.toISOString(),
            size_bytes: compressedFile.size,
            mime_type: compressedFile.type,
            notes: notes.trim() || null,
            especialidade: fileData.meta?.especialidade ?? null,
            fase: fileData.meta?.fase ?? null,
            nivel_id: fileData.meta?.nivelId ?? null,
            ambiente: fileData.meta?.ambiente ?? null,
            atividade: fileData.meta?.atividade ?? null,
            context_id: fileData.meta?.contextId ?? null,
          });

          if (insertError) throw insertError;

          // Concluído
          updateFileState({
            status: 'success',
            statusText: 'Concluído',
            progress: 100,
          });
          successCount++;
        } catch (error: any) {
          console.error('Upload/insert error:', error);
          toast.error(`${fileData.file.name}: ${error.message || 'falha ao guardar'}`);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileData.id
                ? { ...f, status: 'error' as const, statusText: 'Erro', error: error.message }
                : f
            )
          );
          errorCount++;
        }

        // Update overall progress
        setOverallProgress(Math.round(((i + 1) / files.length) * 100));
      }

      return { successCount, errorCount };
    },
    onSuccess: ({ successCount, errorCount }) => {
      // Persistir contexto pegajoso para a próxima captura
      localStorage.setItem(
        STICKY_KEY,
        JSON.stringify({ siteId: selectedSite, especialidade, fase, nivelId, contextId }),
      );
      // Marcar uso recente do contexto (ordenação na lista de captura rápida)
      if (contextId && successCount > 0) {
        supabase
          .from('capture_contexts')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', contextId)
          .then(({ error }) => { if (error) console.error('touch context:', error); });
      }
      if (successCount > 0) {
        toast.success(t('captures.uploadComplete'), {
          description: t('captures.uploadSuccessMultiple', { count: successCount }),
        });
      }
      if (errorCount > 0) {
        toast.error(t('captures.uploadError', { count: errorCount }));
      }
      queryClient.invalidateQueries({ queryKey: ['captures'] });
      
      // Close after short delay to show final state
      setTimeout(() => {
        if (errorCount === 0) {
          handleClose();
        }
      }, 1500);
    },
    onError: (error) => {
      toast.error(t('common.error'), {
        description: error.message,
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const handleClose = () => {
    // Cleanup (mantém o contexto pegajoso: obra/especialidade/fase/nível)
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setCaptureType('photo');
    setNotes('');
    setIsUploading(false);
    setCurrentUploadIndex(0);
    setOverallProgress(0);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    setIsUploading(true);
    uploadMutation.mutate();
  };

  const isValid = !!selectedSite && files.length > 0;
  const disabledReason = !selectedSite
    ? 'Falta selecionar a obra'
    : files.length === 0
    ? 'Adicione pelo menos uma foto'
    : '';
  const pendingFiles = files.filter((f) => f.status === 'pending').length;
  const successFiles = files.filter((f) => f.status === 'success').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('captures.new')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Confirmação do contexto pegajoso ao reabrir — antes da 1.ª foto */}
          {needsStickyConfirm && (
            <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">Confirma o contexto antes de fotografar</p>
              <p className="text-xs text-muted-foreground">
                Contexto da sessão anterior:{' '}
                <span className="font-medium text-foreground">{activeMeta.label || 'sem contexto'}</span>. Ainda estás aqui?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setNeedsStickyConfirm(false)}>Sim, continuar</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEspecialidade('');
                    setFase('');
                    setNivelId('');
                    setContextId('');
                    setNeedsStickyConfirm(false);
                  }}
                >
                  Mudar contexto
                </Button>
              </div>
            </div>
          )}

          {/* Site selection */}
          <div className="space-y-2">
            <Label>{t('captures.selectSite')} *</Label>
            <Select
              value={selectedSite}
              onValueChange={(v) => {
                setSelectedSite(v);
                setEspecialidade('');
                setFase('');
                setNivelId('');
                setContextId('');
                setContextSearch('');
              }}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('captures.selectSite')} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Badge grande e sempre visível: contexto/fase que a PRÓXIMA foto herda */}
          {selectedSite && (
            <div
              className={`rounded-lg p-3 border-2 ${
                activeMeta.fase || activeMeta.especialidade || activeMeta.piso
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-destructive/40 bg-destructive/10'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A fotografar em</p>
              <p className="text-lg font-bold text-foreground leading-tight break-words">
                {activeMeta.label || 'Sem contexto — as fotos ficam SEM fase'}
              </p>
            </div>
          )}

          {/* Input escondido: câmara imediata ao escolher contexto (mobile) */}
          <input
            ref={quickInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFilesSelected(Array.from(e.target.files));
              e.target.value = '';
            }}
          />

          {/* Captura rápida: lista de contextos da obra (1 toque -> câmara) */}
          {selectedSite && contexts.length > 0 && (
            <div className="space-y-2">
              <Label>Contexto</Label>
              <Input
                placeholder="Pesquisar contexto..."
                value={contextSearch}
                onChange={(e) => setContextSearch(e.target.value)}
                disabled={isUploading}
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {contexts
                  .filter((c: any) => c.label.toLowerCase().includes(contextSearch.toLowerCase()))
                  .map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickContext(c.id)}
                      disabled={isUploading || needsStickyConfirm}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                        contextId === c.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Escolher um contexto abre a câmara e as fotos herdam os metadados.
              </p>
            </div>
          )}

          {/* Especialidade (opcional — fallback quando a obra não tem contextos) */}
          {selectedSite && contexts.length === 0 && especialidades.length > 0 && (
            <div className="space-y-2">
              <Label>Especialidade (opcional)</Label>
              <Select
                value={especialidade}
                onValueChange={(v) => {
                  setEspecialidade(v);
                  setFase('');
                  setNivelId('');
                }}
                disabled={isUploading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Especialidade" />
                </SelectTrigger>
                <SelectContent>
                  {especialidades.map((esp) => (
                    <SelectItem key={esp} value={esp}>
                      {esp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fase (opcional) */}
          {selectedSite && contexts.length === 0 && fases.length > 0 && (
            <div className="space-y-2">
              <Label>Fase (opcional)</Label>
              <Select
                value={fase}
                onValueChange={(v) => {
                  setFase(v);
                  setNivelId('');
                }}
                disabled={isUploading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fase" />
                </SelectTrigger>
                <SelectContent>
                  {fases.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Piso / Cota (opcional) */}
          {selectedSite && contexts.length === 0 && niveisFiltrados.length > 0 && (
            <div className="space-y-2">
              <Label>Piso / Cota (opcional)</Label>
              <Select value={nivelId} onValueChange={setNivelId} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Piso / Cota" />
                </SelectTrigger>
                <SelectContent>
                  {niveisFiltrados.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.piso || '—'}
                      {n.cota != null ? ` (${String(n.cota).replace('.', ',')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sem contextos nem catálogo de níveis para esta obra — captura na mesma */}
          {selectedSite && contexts.length === 0 && obraId && niveis.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem contextos definidos para esta obra — pode criar a captura na mesma ou definir a Estrutura da Obra.
            </p>
          )}

          {/* Capture type */}
          <div className="space-y-2">
            <Label>{t('captures.captureType')}</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as CaptureCategory)}
              className="flex gap-4"
              disabled={isUploading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="photo" id="photo" />
                <Label htmlFor="photo" className="flex items-center gap-1 cursor-pointer">
                  <Image className="w-4 h-4 text-green-500" />
                  {t('captures.photo')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="video" id="video" />
                <Label htmlFor="video" className="flex items-center gap-1 cursor-pointer">
                  <Video className="w-4 h-4 text-blue-500" />
                  {t('captures.video')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="panorama" id="panorama" />
                <Label htmlFor="panorama" className="flex items-center gap-1 cursor-pointer">
                  <View className="w-4 h-4 text-purple-500" />
                  {t('captures.panorama')}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Smart capture buttons for mobile */}
          {isMobile && (
            <div className="space-y-2">
              <Label>{t('captures.captureType')}</Label>
              <SmartCaptureButtons
                onFilesSelected={handleFilesSelected}
                disabled={isUploading || needsStickyConfirm}
              />
            </div>
          )}

          {/* Drop zone */}
          <div className="space-y-2">
            <Label>{isMobile ? t('captures.upload') : `${t('captures.upload')} *`}</Label>
            <DropZone
              onFilesSelected={handleFilesSelected}
              maxFiles={MAX_FILES}
              currentFileCount={files.length}
              disabled={isUploading || needsStickyConfirm}
            />
          </div>

          {/* File previews */}
          <FilePreviewGrid
            files={files}
            onRemove={handleRemoveFile}
            disabled={isUploading}
          />

          {/* Overall progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{t('captures.uploadProgress', { current: currentUploadIndex + 1, total: files.length })}</span>
                <span className="text-muted-foreground">
                  {files[currentUploadIndex]?.statusText || ''} {overallProgress}%
                </span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('captures.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('captures.notesPlaceholder')}
              rows={2}
              disabled={isUploading}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {files.length > 0 && (
              <span>
                {pendingFiles} {t('captures.remaining')}
                {successFiles > 0 && ` • ${successFiles} ✓`}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isUploading}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || isUploading}
                className="bg-gradient-to-r from-primary to-accent"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('captures.uploading')}
                  </>
                ) : (
                  t('common.create')
                )}
              </Button>
            </div>
            {!isValid && !isUploading && disabledReason && (
              <p className="text-xs text-muted-foreground">{disabledReason}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
