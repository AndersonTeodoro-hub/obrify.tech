import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Camera, Plus, Trash2, Building2, ArrowLeft, CalendarIcon,
  Loader2, ArrowUp, ArrowDown, X, ImageIcon, Edit, FileText,
  Download, Upload, GraduationCap, Lock, Eye, AlertTriangle, View, CheckCircle2,
} from 'lucide-react';
import { generatePhotoReportPDF, type PhotoForExport, type OpenNC } from '@/utils/photo-report-pdf';
import { generatePhotoReportDOCX } from '@/utils/photo-report-docx';
import { toBase64UnderLimit } from '@/lib/capture-image';
import { buildWatermarkLines, stampImageBase64 } from '@/lib/watermark';

type Site = { id: string; name: string; address: string | null };

// Contexto da captura de origem (para a legenda do Silva). Guardado no JSON photos.
type CaptureMeta = {
  capture_id?: string;
  especialidade?: string | null;
  fase?: string | null;
  piso?: string | null;
  cota?: number | null;
  ambiente?: string | null;
  atividade?: string | null;
  notes?: string | null;
  captured_at?: string | null;
  // Marca a foto como proveniente de uma captura 360°/panorâmica — entra no relatório
  // identificada como tal, nunca como fotografia normal (ponto 11 do âmbito).
  source_type?: string | null;
};
type PhotoMeta = {
  file_path: string; description: string; location: string; sort_order: number; capture?: CaptureMeta;
  // Proveniência da legenda: gerada por IA (Eng. Silva) ou escrita/corrigida pelo fiscal.
  // Enquanto uma legenda de IA não for marcada como revista, a exportação fica bloqueada.
  caption_source?: 'ai' | 'manual' | null;
  caption_reviewed?: boolean;
};
type Report = {
  id: string; site_id: string; user_id: string; report_date: string;
  weather: string | null; temperature_c: number | null; weather_conditions: string[] | null;
  workers_count: string | null; equipment: string | null;
  works_done: string | null; observations: string | null; photos: PhotoMeta[];
  status: string; created_at: string; updated_at: string;
  document_number: string | null; version: number | null; issued_at: string | null;
  fiscal_name: string | null; fiscal_company: string | null;
  fiscal_logo_base64: string | null; client_logo_base64: string | null;
  contractor: string | null;
};

type LocalPhoto = {
  file?: File; file_path?: string; preview: string;
  description: string; location: string; sort_order: number;
  capture?: CaptureMeta;
  captionStatus?: 'idle' | 'pending' | 'done' | 'error';
  captionSource?: 'ai' | 'manual' | null;
  captionReviewed?: boolean;
};

const WEATHER_OPTIONS = ['sol', 'nublado', 'chuva', 'vento'] as const;

// Rascunho local recuperável — chave por obra+relatório (ou "new" para relatório novo).
const draftKey = (siteId: string, reportId: string | null) => `photo_report_draft_${siteId}_${reportId || 'new'}`;

export default function PhotoReports() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNCs, setOpenNCs] = useState<OpenNC[]>([]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [empreiteiro, setEmpreiteiro] = useState('');
  const [fiscalName, setFiscalName] = useState('');
  const [fiscalCompany, setFiscalCompany] = useState('DDN');
  const [weatherChecks, setWeatherChecks] = useState<Record<string, boolean>>({ sol: false, nublado: false, chuva: false, vento: false });
  const [temperature, setTemperature] = useState('');
  const [workersCount, setWorkersCount] = useState('');
  const [equipment, setEquipment] = useState('');
  const [worksDone, setWorksDone] = useState('');
  const [observations, setObservations] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Identidade do documento — gravada no próprio relatório, nunca em localStorage.
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [docVersion, setDocVersion] = useState<number>(1);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);

  // Logo state (base64 gravado no próprio relatório)
  const [reportLogo, setReportLogo] = useState<string | null>(null);
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Recuperação de rascunho
  const [recoveryAvailable, setRecoveryAvailable] = useState<{ savedAt: string; key: string } | null>(null);

  // Importação de capturas + geração de legendas em lote
  const [importing, setImporting] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [captionProgress, setCaptionProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Edição pós-captura (data/piso/fase) — seleção por índice + campos de lote
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [batchFase, setBatchFase] = useState('');
  const [batchPiso, setBatchPiso] = useState('');
  const [batchDate, setBatchDate] = useState('');

  const markDirty = () => setDirty(true);

  // Load sites — sem filtro manual por org: a RLS de `sites` já devolve exactamente as
  // obras a que o utilizador tem acesso (admin de org -> todas; outros -> só as suas).
  useEffect(() => {
    if (!user) return;
    supabase.from('sites').select('id, name, address').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao carregar obras: ' + error.message); return; }
        if (data) setSites(data as any);
      });
  }, [user]);

  // Load reports — sem filtro por user_id: a RLS de photo_reports já devolve os
  // relatórios finais de toda a obra + os rascunhos do próprio autor.
  const loadReports = useCallback(async () => {
    if (!user || !selectedSite) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('photo_reports')
      .select('*')
      .eq('site_id', selectedSite.id)
      .order('report_date', { ascending: false });
    if (error) toast.error('Erro ao carregar relatórios: ' + error.message);
    if (data) setReports(data);
    setLoading(false);
  }, [user, selectedSite]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Não-conformidades abertas nesta obra — ligação visível no relatório (ponto 12).
  useEffect(() => {
    if (!selectedSite) { setOpenNCs([]); return; }
    supabase
      .from('nonconformities')
      .select('title, severity, status, due_date')
      .eq('site_id', selectedSite.id)
      .in('status', ['OPEN', 'IN_PROGRESS'])
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar não-conformidades:', error);
          toast.error('Erro ao carregar não-conformidades abertas: ' + error.message);
          return;
        }
        setOpenNCs((data || []) as OpenNC[]);
      });
  }, [selectedSite]);

  const selectSite = (site: Site) => {
    setSelectedSite(site);
    setSiteModalOpen(false);
  };

  // ── Aviso ao sair com alterações por gravar ──
  useEffect(() => {
    if (!formOpen || readOnly || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [formOpen, readOnly, dirty]);

  // ── Autosave do rascunho local (recuperável) ──
  useEffect(() => {
    if (!formOpen || readOnly || !selectedSite) return;
    const key = draftKey(selectedSite.id, editingReport?.id || null);
    const t = setTimeout(() => {
      try {
        const snapshot = {
          savedAt: new Date().toISOString(),
          reportDate: reportDate.toISOString(),
          empreiteiro, fiscalName, fiscalCompany, weatherChecks, temperature,
          workersCount, equipment, worksDone, observations,
          // Ficheiros novos (File) não são serializáveis — guardamos só metadados das
          // fotos já persistidas/importadas; fotos locais por gravar exigem reimportação
          // manual se o browser fechar antes do autosave gravar o ficheiro no storage.
          photosMeta: photos.filter(p => p.file_path).map(p => ({
            file_path: p.file_path, description: p.description, location: p.location,
            sort_order: p.sort_order, capture: p.capture,
          })),
        };
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch (e) {
        console.error('Autosave falhou:', e);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [formOpen, readOnly, selectedSite, editingReport, reportDate, empreiteiro, fiscalName, fiscalCompany, weatherChecks, temperature, workersCount, equipment, worksDone, observations, photos]);

  const clearDraft = () => {
    if (!selectedSite) return;
    localStorage.removeItem(draftKey(selectedSite.id, editingReport?.id || null));
  };

  const checkRecoverableDraft = (siteId: string, reportId: string | null) => {
    try {
      const raw = localStorage.getItem(draftKey(siteId, reportId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.savedAt) setRecoveryAvailable({ savedAt: parsed.savedAt, key: draftKey(siteId, reportId) });
    } catch {
      // rascunho corrompido — ignora, não bloqueia a criação de um novo relatório
    }
  };

  const applyRecoveredDraft = () => {
    if (!recoveryAvailable) return;
    try {
      const raw = localStorage.getItem(recoveryAvailable.key);
      if (!raw) { setRecoveryAvailable(null); return; }
      const parsed = JSON.parse(raw);
      setReportDate(new Date(parsed.reportDate));
      setEmpreiteiro(parsed.empreiteiro || '');
      setFiscalName(parsed.fiscalName || '');
      setFiscalCompany(parsed.fiscalCompany || 'DDN');
      setWeatherChecks(parsed.weatherChecks || { sol: false, nublado: false, chuva: false, vento: false });
      setTemperature(parsed.temperature || '');
      setWorkersCount(parsed.workersCount || '');
      setEquipment(parsed.equipment || '');
      setWorksDone(parsed.worksDone || '');
      setObservations(parsed.observations || '');
      if (Array.isArray(parsed.photosMeta) && parsed.photosMeta.length) {
        setPhotos((prev) => {
          const existingPaths = new Set(prev.map(p => p.file_path).filter(Boolean));
          const restored: LocalPhoto[] = parsed.photosMeta
            .filter((p: any) => !existingPaths.has(p.file_path))
            .map((p: any) => ({ file_path: p.file_path, preview: '', description: p.description, location: p.location, sort_order: p.sort_order, capture: p.capture, captionStatus: 'idle' as const }));
          return [...prev, ...restored];
        });
      }
      toast.success('Rascunho recuperado.');
      markDirty();
    } catch (e: any) {
      toast.error('Falha ao recuperar rascunho: ' + e.message);
    } finally {
      setRecoveryAvailable(null);
    }
  };

  const discardRecoveredDraft = () => {
    if (recoveryAvailable) localStorage.removeItem(recoveryAvailable.key);
    setRecoveryAvailable(null);
  };

  // Open form for new report
  const openNewForm = async () => {
    if (!selectedSite) return;
    setEditingReport(null);
    setReadOnly(false);
    setReportDate(new Date());
    setWeatherChecks({ sol: false, nublado: false, chuva: false, vento: false });
    setTemperature('');
    setWorkersCount('');
    setEquipment('');
    setWorksDone('');
    setObservations('');
    setPhotos([]);
    setDocumentNumber(null);
    setDocVersion(1);
    setIssuedAt(null);
    setDirty(false);

    // Persistência entre relatórios: herdar fiscal/empreiteiro/logos do último
    // relatório DESTA obra (nunca de um global em localStorage).
    const { data: last } = await (supabase as any)
      .from('photo_reports')
      .select('fiscal_name, fiscal_company, contractor, fiscal_logo_base64, client_logo_base64')
      .eq('site_id', selectedSite.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setEmpreiteiro(last?.contractor || '');
    setFiscalName(last?.fiscal_name || '');
    setFiscalCompany(last?.fiscal_company || 'DDN');
    setReportLogo(last?.fiscal_logo_base64 || null);
    setClientLogo(last?.client_logo_base64 || null);

    setFormOpen(true);
    checkRecoverableDraft(selectedSite.id, null);
  };

  // Open form for editing/viewing
  const openEditForm = async (report: Report) => {
    setEditingReport(report);
    const isFinal = report.status === 'final';
    setReadOnly(isFinal);
    setReportDate(new Date(report.report_date + 'T00:00:00'));
    setEmpreiteiro(report.contractor || '');
    setFiscalName(report.fiscal_name || '');
    setFiscalCompany(report.fiscal_company || 'DDN');
    setReportLogo(report.fiscal_logo_base64 || null);
    setClientLogo(report.client_logo_base64 || null);
    setDocumentNumber(report.document_number || null);
    setDocVersion(report.version || 1);
    setIssuedAt(report.issued_at || null);

    // Meteo estruturada (colunas novas). Fallback só para relatórios antigos gravados
    // antes da migração, que só têm o texto livre em `weather`.
    if (report.weather_conditions || report.temperature_c != null) {
      const checks = { sol: false, nublado: false, chuva: false, vento: false };
      for (const c of report.weather_conditions || []) if (c in checks) (checks as any)[c] = true;
      setWeatherChecks(checks);
      setTemperature(report.temperature_c != null ? String(report.temperature_c) : '');
    } else if (report.weather) {
      const lower = report.weather.toLowerCase();
      setWeatherChecks({
        sol: lower.includes('sol'), nublado: lower.includes('nublado'),
        chuva: lower.includes('chuva'), vento: lower.includes('vento'),
      });
      const m = report.weather.match(/(\d+)\s*°?\s*C/i);
      setTemperature(m ? m[1] : '');
    } else {
      setWeatherChecks({ sol: false, nublado: false, chuva: false, vento: false });
      setTemperature('');
    }

    setWorkersCount(report.workers_count || '');
    setEquipment(report.equipment || '');
    setWorksDone(report.works_done || '');
    setObservations(report.observations || '');

    // Load existing photos with signed URLs
    const existingPhotos: LocalPhoto[] = [];
    const photosMeta = report.photos || [];
    for (const p of photosMeta) {
      const { data, error } = await supabase.storage.from('photo-reports').createSignedUrl(p.file_path, 3600);
      if (error) console.error('Falha ao gerar URL da foto', p.file_path, error);
      existingPhotos.push({
        file_path: p.file_path,
        preview: data?.signedUrl || '',
        description: p.description,
        location: p.location,
        sort_order: p.sort_order,
        capture: p.capture,
        captionStatus: 'idle',
        captionSource: p.caption_source,
        captionReviewed: p.caption_reviewed,
      });
    }
    setPhotos(existingPhotos);
    setDirty(false);
    setFormOpen(true);
    if (!isFinal) checkRecoverableDraft(selectedSite!.id, report.id);
  };

  // Photo upload handler
  const handlePhotoFiles = (files: FileList | null) => {
    if (!files) return;
    const newPhotos: LocalPhoto[] = Array.from(files).map((file, i) => ({
      file,
      preview: URL.createObjectURL(file),
      description: '',
      location: '',
      sort_order: photos.length + i,
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
    markDirty();
  };

  const removePhoto = (index: number) => {
    setSelectedIdx(new Set()); // índices mudam após remover
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[index].file) URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated.map((p, i) => ({ ...p, sort_order: i }));
    });
    markDirty();
  };

  const movePhoto = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= photos.length) return;
    setSelectedIdx(new Set()); // índices mudam após reordenar
    setPhotos(prev => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated.map((p, i) => ({ ...p, sort_order: i }));
    });
    markDirty();
  };

  const updatePhotoField = (index: number, field: 'description' | 'location', value: string) => {
    setPhotos(prev => prev.map((p, i) => {
      if (i !== index) return p;
      // Editar a descrição manualmente conta como revisão da legenda (mesmo que a
      // legenda tenha vindo da IA): o fiscal leu-a e interveio nela.
      const next: LocalPhoto = { ...p, [field]: value };
      if (field === 'description') {
        next.captionSource = next.captionSource === 'ai' ? 'ai' : 'manual';
        next.captionReviewed = true;
      }
      return next;
    }));
    markDirty();
  };

  const markCaptionReviewed = (index: number) => {
    setPhotos(prev => prev.map((p, i) => (i === index ? { ...p, captionReviewed: true } : p)));
    markDirty();
  };

  // Editar os metadados do carimbo de uma foto (cria o objeto capture se faltar).
  const updatePhotoCapture = (index: number, patch: Partial<CaptureMeta>) => {
    setPhotos(prev => prev.map((p, i) => (i === index ? { ...p, capture: { ...(p.capture || {}), ...patch } } : p)));
    markDirty();
  };

  const toggleSelect = (index: number) => {
    setSelectedIdx(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  // Aplicar correção em lote (só os campos preenchidos) às fotos selecionadas.
  const applyBatch = () => {
    if (selectedIdx.size === 0) return;
    const patch: Partial<CaptureMeta> = {};
    if (batchFase.trim()) patch.fase = batchFase.trim();
    if (batchPiso.trim()) patch.piso = batchPiso.trim();
    if (batchDate) patch.captured_at = new Date(batchDate + 'T12:00:00').toISOString();
    if (Object.keys(patch).length === 0) {
      toast.info('Preencha fase, piso ou data para aplicar.');
      return;
    }
    setPhotos(prev => prev.map((p, i) => (selectedIdx.has(i) ? { ...p, capture: { ...(p.capture || {}), ...patch } } : p)));
    toast.success(`Aplicado a ${selectedIdx.size} foto(s). Guarde o relatório para registar.`);
    setSelectedIdx(new Set());
    setBatchFase(''); setBatchPiso(''); setBatchDate('');
    markDirty();
  };

  // Descarregar UMA foto com o carimbo renderizado on-the-fly (partilha avulsa).
  const downloadStamped = async (photo: LocalPhoto, index: number) => {
    try {
      let blob: Blob | null = photo.file || null;
      if (!blob && photo.file_path) {
        const { data, error } = await supabase.storage.from('photo-reports').download(photo.file_path);
        if (error) throw error;
        blob = data || null;
      }
      if (!blob) throw new Error('Sem imagem disponível');
      const dataUrl = await blobToBase64(blob);
      const lines = photo.capture ? buildWatermarkLines(photo.capture, format(reportDate, 'dd/MM/yyyy')) : [];
      const stamped = lines.length ? await stampImageBase64(dataUrl, lines) : dataUrl;
      const a = document.createElement('a');
      a.href = stamped;
      a.download = `foto_${index + 1}_carimbada.jpg`;
      a.click();
    } catch (e: any) {
      console.error('Descarregar com carimbo:', e);
      toast.error('Erro ao gerar foto carimbada: ' + e.message);
    }
  };

  const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Logo upload (gravado no PRÓPRIO relatório ao guardar — nunca só em localStorage)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReportLogo(reader.result as string);
      markDirty();
    };
    reader.onerror = () => toast.error('Falha ao ler o ficheiro do logo.');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeLogo = () => { setReportLogo(null); markDirty(); };

  const buildWeatherDisplay = () => {
    const parts: string[] = [];
    if (weatherChecks.sol) parts.push('Sol');
    if (weatherChecks.nublado) parts.push('Nublado');
    if (weatherChecks.chuva) parts.push('Chuva');
    if (weatherChecks.vento) parts.push('Vento');
    if (temperature.trim()) parts.push(`${temperature.trim()}°C`);
    return parts.join(', ');
  };

  // Legendas de IA por rever: bloqueiam gravação como final e exportação (ponto 3).
  const unreviewedAiCaptions = () => photos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.captionSource === 'ai' && !p.captionReviewed);

  const blockOnUnreviewedCaptions = (): boolean => {
    const pending = unreviewedAiCaptions();
    if (pending.length === 0) return false;
    const list = pending.map(({ i }) => `#${i + 1}`).join(', ');
    toast.error(`${pending.length} legenda(s) gerada(s) por IA ainda não revista(s): foto(s) ${list}. Reveja-as antes de finalizar/exportar.`);
    return true;
  };

  // Save report (returns saved report for chaining with export)
  const handleSave = async (status: 'draft' | 'final'): Promise<Report | null> => {
    if (!user || !selectedSite) return null;
    if (readOnly) { toast.error('Este relatório está marcado como Final e não pode ser editado.'); return null; }
    if (status === 'final' && blockOnUnreviewedCaptions()) return null;

    setSubmitting(true);
    const uploadedThisBatch: string[] = [];
    try {
      const reportId = editingReport?.id || crypto.randomUUID();
      const basePath = `${user.id}/${selectedSite.id}/${reportId}`;

      // Upload new photos — em caso de falha a meio do lote, remove as já enviadas
      // NESTA gravação para não deixar ficheiros órfãos no storage.
      const photosMeta: PhotoMeta[] = [];
      try {
        for (const photo of photos) {
          if (photo.file) {
            const filePath = `${basePath}/${Date.now()}_${sanitizeFilename(photo.file.name)}`;
            const { error } = await supabase.storage.from('photo-reports').upload(filePath, photo.file);
            if (error) throw error;
            uploadedThisBatch.push(filePath);
            photosMeta.push({
              file_path: filePath,
              description: photo.description,
              location: photo.location,
              sort_order: photo.sort_order,
              capture: photo.capture,
              caption_source: photo.captionSource ?? null,
              caption_reviewed: !!photo.captionReviewed,
            });
          } else if (photo.file_path) {
            photosMeta.push({
              file_path: photo.file_path,
              description: photo.description,
              location: photo.location,
              sort_order: photo.sort_order,
              capture: photo.capture,
              caption_source: photo.captionSource ?? null,
              caption_reviewed: !!photo.captionReviewed,
            });
          }
        }
      } catch (uploadErr) {
        if (uploadedThisBatch.length > 0) {
          const { error: rollbackErr } = await supabase.storage.from('photo-reports').remove(uploadedThisBatch);
          if (rollbackErr) console.error('Rollback de upload falhou (podem ficar ficheiros órfãos):', rollbackErr);
        }
        throw uploadErr;
      }

      // Identidade do documento: gerada uma vez, versão incrementada a cada gravação,
      // data de emissão fixada na primeira vez que o relatório passa a Final.
      let docNumber = documentNumber;
      if (!docNumber) {
        const { count } = await (supabase as any)
          .from('photo_reports')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', selectedSite.id);
        docNumber = `RFD-${format(reportDate, 'yyyyMMdd')}-${String((count || 0) + 1).padStart(3, '0')}`;
      }
      const nextVersion = editingReport ? docVersion + 1 : 1;
      const nextIssuedAt = status === 'final' ? (issuedAt || new Date().toISOString()) : issuedAt;

      const record: any = {
        id: reportId,
        site_id: selectedSite.id,
        user_id: user.id,
        report_date: format(reportDate, 'yyyy-MM-dd'),
        weather: buildWeatherDisplay() || null,
        temperature_c: temperature.trim() ? Number(temperature.trim()) : null,
        weather_conditions: WEATHER_OPTIONS.filter((k) => weatherChecks[k]),
        workers_count: workersCount || null,
        equipment: equipment || null,
        works_done: worksDone || null,
        observations: observations || null,
        photos: photosMeta,
        status,
        contractor: empreiteiro || null,
        fiscal_name: fiscalName || null,
        fiscal_company: fiscalCompany || null,
        fiscal_logo_base64: reportLogo,
        client_logo_base64: clientLogo,
        document_number: docNumber,
        version: nextVersion,
        issued_at: nextIssuedAt,
        updated_at: new Date().toISOString(),
      };

      if (editingReport) {
        const { error } = await (supabase as any).from('photo_reports').update(record).eq('id', editingReport.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('photo_reports').insert(record);
        if (error) throw error;
      }

      toast.success(status === 'draft' ? 'Rascunho guardado' : 'Relatório guardado como final');
      clearDraft();
      setDirty(false);
      setFormOpen(false);
      await loadReports();
      return { ...record, created_at: editingReport?.created_at || new Date().toISOString() } as Report;
    } catch (err: any) {
      toast.error('Erro ao guardar: ' + err.message);
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Delete report — só apaga o registo se a limpeza do storage tiver sucesso, para
  // nunca deixar ficheiros órfãos nem um registo inconsistente.
  const handleDelete = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    try {
      const filePaths = (report.photos || []).map(p => p.file_path);
      if (filePaths.length > 0) {
        const { error: storageErr } = await supabase.storage.from('photo-reports').remove(filePaths);
        if (storageErr) throw new Error('Falha ao eliminar ficheiros do storage: ' + storageErr.message + ' — registo mantido, tente novamente.');
      }
      const { error } = await (supabase as any).from('photo_reports').delete().eq('id', reportId);
      if (error) throw error;
      toast.success('Relatório eliminado');
      setDeleteConfirm(null);
      await loadReports();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  // ── Export helpers ──
  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const downloadPhotosAsBase64 = async (
    photosMeta: PhotoMeta[], fallbackDate: string,
  ): Promise<{ results: PhotoForExport[]; failed: { index: number; reason: string }[] }> => {
    const results: PhotoForExport[] = [];
    const failed: { index: number; reason: string }[] = [];
    for (let i = 0; i < photosMeta.length; i++) {
      const p = photosMeta[i];
      try {
        const { data, error } = await supabase.storage.from('photo-reports').download(p.file_path);
        if (error || !data) { failed.push({ index: i, reason: error?.message || 'download vazio' }); continue; }
        let base64 = await blobToBase64(data);
        // Marca d'água RENDERIZADA a partir dos metadados (só fotos com contexto de
        // captura; o original no storage fica limpo). Falha do carimbo não bloqueia.
        const lines = p.capture ? buildWatermarkLines(p.capture, fallbackDate) : [];
        if (lines.length > 0) {
          try {
            base64 = await stampImageBase64(base64, lines);
          } catch (e) {
            console.error('Carimbo falhou para', p.file_path, e);
          }
        }
        const is360 = p.capture?.source_type === 'phone_360' || p.capture?.source_type === 'phone_360_auto';
        results.push({
          base64,
          description: p.description,
          location: is360 ? `[360°] ${p.location || ''}`.trim() : p.location,
          sort_order: p.sort_order,
        });
      } catch (e: any) {
        failed.push({ index: i, reason: e?.message || 'erro desconhecido' });
      }
    }
    return { results: results.sort((a, b) => a.sort_order - b.sort_order), failed };
  };

  const handleExport = async (report: Report, type: 'pdf' | 'docx') => {
    if (!selectedSite) return;
    const pendingCaptions = (report.photos || []).filter(p => p.caption_source === 'ai' && !p.caption_reviewed);
    if (pendingCaptions.length > 0) {
      toast.error(`Exportação bloqueada: ${pendingCaptions.length} legenda(s) de IA por rever neste relatório. Abra-o em edição e reveja-as.`);
      return;
    }
    setExporting(true);
    try {
      toast.info(`A preparar ${type.toUpperCase()}...`);
      const fallbackDate = new Date(report.report_date + 'T00:00:00').toLocaleDateString('pt-PT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const { results: photoImages, failed } = await downloadPhotosAsBase64(report.photos || [], fallbackDate);
      if (failed.length > 0) {
        const totalPhotos = (report.photos || []).length;
        const proceed = window.confirm(
          `${failed.length} de ${totalPhotos} foto(s) não puderam ser carregadas e vão FICAR DE FORA do ${type.toUpperCase()}:\n\n` +
          failed.map(f => `• Foto #${f.index + 1}: ${f.reason}`).join('\n') +
          `\n\nContinuar mesmo assim?`,
        );
        if (!proceed) { setExporting(false); return; }
      }
      const reportData = {
        report_date: report.report_date,
        weather: report.weather,
        workers_count: report.workers_count,
        equipment: report.equipment,
        works_done: report.works_done,
        observations: report.observations,
      };
      const docIdentity = { documentNumber: report.document_number, version: report.version, issuedAt: report.issued_at, status: report.status };

      if (type === 'pdf') {
        generatePhotoReportPDF(reportData, selectedSite.name, selectedSite.address || '', report.contractor || '', report.fiscal_name || '', report.fiscal_company || 'DDN', photoImages, report.fiscal_logo_base64, report.client_logo_base64, docIdentity, openNCs);
      } else {
        await generatePhotoReportDOCX(reportData, selectedSite.name, selectedSite.address || '', report.contractor || '', report.fiscal_name || '', report.fiscal_company || 'DDN', photoImages, report.fiscal_logo_base64, report.client_logo_base64, docIdentity, openNCs);
      }
      toast.success(`${type.toUpperCase()} exportado com sucesso${failed.length ? ` (${failed.length} foto(s) omitida(s))` : ''}`);
    } catch (err: any) {
      toast.error('Erro na exportação: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Export from form (auto-save first)
  const handleExportFromForm = async (type: 'pdf' | 'docx') => {
    if (blockOnUnreviewedCaptions()) return;
    const saved = await handleSave('draft');
    if (saved) {
      await handleExport(saved, type);
    }
  };

  // ── Importar capturas do período (site_id directo — já não precisa de ponte) ──
  const importCaptures = async () => {
    if (!user || !selectedSite) return;
    setImporting(true);
    try {
      const day = format(reportDate, 'yyyy-MM-dd');
      const { data: caps, error: capErr } = await supabase
        .from('captures')
        .select('id, file_path, captured_at, fase, especialidade, ambiente, atividade, notes, source_type, eng_silva_niveis!captures_nivel_id_fkey ( piso, cota )')
        .eq('site_id', selectedSite.id)
        .gte('captured_at', `${day}T00:00:00`)
        .lte('captured_at', `${day}T23:59:59`)
        .order('captured_at', { ascending: true });
      if (capErr) throw capErr;
      if (!caps?.length) {
        toast.info('Sem capturas para esta obra nesta data.');
        return;
      }

      const imported: LocalPhoto[] = [];
      for (const c of caps as any[]) {
        const { data: blob, error: dErr } = await supabase.storage.from('captures').download(c.file_path);
        if (dErr || !blob) {
          console.error('Falha download captura', c.id, dErr);
          toast.error(`Captura ${c.id}: ${dErr?.message || 'download falhou'}`);
          continue;
        }
        const piso = (c.eng_silva_niveis?.piso ?? null) as string | null;
        const cota = (c.eng_silva_niveis?.cota ?? null) as number | null;
        const is360 = c.source_type === 'phone_360' || c.source_type === 'phone_360_auto';
        imported.push({
          file: new File([blob], `${c.id}.jpg`, { type: blob.type || 'image/jpeg' }),
          preview: URL.createObjectURL(blob),
          description: '',
          location: [is360 ? '360°' : null, c.especialidade, piso ? `${piso}${cota != null ? ` (${cota})` : ''}` : '', c.ambiente, c.atividade]
            .filter(Boolean)
            .join(' — '),
          sort_order: photos.length + imported.length,
          capture: {
            capture_id: c.id,
            especialidade: c.especialidade,
            fase: c.fase,
            piso,
            cota,
            ambiente: c.ambiente,
            atividade: c.atividade,
            notes: c.notes,
            captured_at: c.captured_at,
            source_type: c.source_type,
          },
          captionStatus: 'idle',
        });
      }
      if (imported.length) {
        setPhotos((prev) => [...prev, ...imported]);
        markDirty();
        toast.success(`${imported.length} captura(s) importada(s).`);
      }
    } catch (err: any) {
      console.error('Importar capturas:', err);
      toast.error('Erro ao importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Gerar legendas com o Eng. Silva (modo caption) ──
  const captionOne = async (photo: LocalPhoto): Promise<string> => {
    const blob = photo.file
      ? photo.file
      : (await supabase.storage.from('photo-reports').download(photo.file_path!)).data;
    if (!blob) throw new Error('Sem imagem para legendar');
    const base64 = await toBase64UnderLimit(blob);
    const meta = {
      obra: selectedSite?.name,
      especialidade: photo.capture?.especialidade,
      fase: photo.capture?.fase,
      piso: photo.capture?.piso,
      cota: photo.capture?.cota,
      ambiente: photo.capture?.ambiente,
      atividade: photo.capture?.atividade,
      notas: photo.capture?.notes,
      data: photo.capture?.captured_at
        ? new Date(photo.capture.captured_at).toLocaleDateString('pt-PT')
        : format(reportDate, 'dd/MM/yyyy'),
    };
    const { data, error } = await supabase.functions.invoke('eng-silva-chat', {
      body: { mode: 'caption', image: base64, meta, user_id: user!.id },
    });
    if (error || !data?.caption) throw new Error(error?.message || 'Silva não devolveu legenda');
    return data.caption as string;
  };

  const generateCaptions = async (onlyFailed = false) => {
    const targets = photos
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (onlyFailed ? p.captionStatus === 'error' : true));
    if (!targets.length) {
      toast.info('Nada para legendar.');
      return;
    }
    setCaptioning(true);
    setCaptionProgress({ done: 0, total: targets.length });
    let ok = 0;
    let fail = 0;
    for (const { i } of targets) {
      setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, captionStatus: 'pending' } : p)));
      try {
        const caption = await captionOne(photos[i]);
        // Legenda gerada por IA fica marcada como NÃO revista até o fiscal a validar.
        setPhotos((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, description: caption, captionStatus: 'done', captionSource: 'ai', captionReviewed: false } : p)),
        );
        ok++;
      } catch (err: any) {
        console.error('Legenda falhou (foto', i, '):', err);
        toast.error(`Foto ${i + 1}: ${err.message}`);
        setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, captionStatus: 'error' } : p)));
        fail++;
      }
      setCaptionProgress((cp) => ({ ...cp, done: cp.done + 1 }));
    }
    setCaptioning(false);
    markDirty();
    if (ok) toast.success(`${ok} legenda(s) gerada(s) — marcadas como "por rever".`);
    if (fail) toast.error(`${fail} falhada(s) — use "Repetir falhadas".`);
  };

  // === SITE SELECTOR ===
  if (!selectedSite) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Camera className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios Fotográficos</h1>
            <p className="text-muted-foreground">Relatório fotográfico diário de obra</p>
          </div>
        </div>

        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => setSiteModalOpen(true)}>
          <CardContent className="flex items-center gap-4 p-6">
            <Building2 className="w-10 h-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Seleccionar Obra</p>
              <p className="text-sm text-muted-foreground">Escolha a obra para gerir os relatórios fotográficos</p>
            </div>
          </CardContent>
        </Card>

        <Dialog open={siteModalOpen} onOpenChange={setSiteModalOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Seleccionar Obra</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sites.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma obra acessível. Peça a um administrador para o adicionar a uma obra.</p>}
              {sites.map(s => (
                <div key={s.id} className="p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition" onClick={() => selectSite(s)}>
                  <p className="font-medium text-foreground">{s.name}</p>
                  {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // === FORM VIEW ===
  if (formOpen) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            {readOnly ? <><Lock className="w-4 h-4" /> Relatório Final (só leitura)</> : editingReport ? 'Editar Relatório' : 'Novo Relatório Fotográfico'}
          </h1>
        </div>

        {readOnly && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-sm text-foreground">
            Este relatório foi marcado como <strong>Final</strong> e está fechado a edição. Só pode ser exportado.
          </div>
        )}

        {recoveryAvailable && (
          <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 space-y-2">
            <p className="text-sm font-semibold text-foreground">Existe um rascunho não guardado deste relatório</p>
            <p className="text-xs text-muted-foreground">Guardado automaticamente em {format(new Date(recoveryAvailable.savedAt), 'dd/MM/yyyy HH:mm')}. Recuperar?</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={applyRecoveredDraft}>Recuperar rascunho</Button>
              <Button size="sm" variant="outline" onClick={discardRecoveredDraft}>Descartar</Button>
            </div>
          </div>
        )}

        {documentNumber && (
          <p className="text-xs text-muted-foreground">
            Documento {documentNumber} · versão {docVersion}{issuedAt ? ` · emitido em ${format(new Date(issuedAt), 'dd/MM/yyyy HH:mm')}` : ''}
          </p>
        )}

        {/* Section 1 — Header */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Cabeçalho</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Logo uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Logo da Empresa (Fiscalização)</label>
                {reportLogo ? (
                  <div className="flex items-center gap-4">
                    <div className="border border-border rounded-lg p-2 bg-muted/30">
                      <img src={reportLogo} alt="Logo" className="h-12 max-w-[160px] object-contain" />
                    </div>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" onClick={removeLogo} className="text-destructive hover:text-destructive">
                        <X className="w-4 h-4 mr-1" /> Remover
                      </Button>
                    )}
                  </div>
                ) : !readOnly ? (
                  <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition w-fit">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Carregar logo (PNG, JPG)</span>
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
                  </label>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Logo do Cliente / Dono de Obra</label>
                {clientLogo ? (
                  <div className="flex items-center gap-4">
                    <div className="border border-border rounded-lg p-2 bg-muted/30">
                      <img src={clientLogo} alt="Logo Cliente" className="h-12 max-w-[160px] object-contain" />
                    </div>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" onClick={() => { setClientLogo(null); markDirty(); }} className="text-destructive hover:text-destructive">
                        <X className="w-4 h-4 mr-1" /> Remover
                      </Button>
                    )}
                  </div>
                ) : !readOnly ? (
                  <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition w-fit">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Carregar logo (PNG, JPG)</span>
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => { setClientLogo(reader.result as string); markDirty(); };
                      reader.onerror = () => toast.error('Falha ao ler o ficheiro do logo.');
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }} />
                  </label>
                ) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Obra</label>
                <Input value={selectedSite.name} disabled />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Localização</label>
                <Input value={selectedSite.address || '—'} disabled />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Empreiteiro</label>
                <Input value={empreiteiro} disabled={readOnly} onChange={e => { setEmpreiteiro(e.target.value); markDirty(); }} placeholder="Nome do empreiteiro" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Fiscalização</label>
                <Input value={`${fiscalCompany} — ${fiscalName}`} disabled={readOnly} onChange={e => {
                  const parts = e.target.value.split(' — ');
                  if (parts.length >= 2) { setFiscalCompany(parts[0]); setFiscalName(parts.slice(1).join(' — ')); }
                  else setFiscalName(e.target.value);
                  markDirty();
                }} placeholder="DDN — Nome do fiscal" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — Manual data */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Dia</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Data</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" disabled={readOnly} className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reportDate ? format(reportDate, 'PPP', { locale: pt }) : 'Seleccionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={reportDate} onSelect={d => { if (d) { setReportDate(d); markDirty(); } }} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Temperatura (°C)</label>
                <Input type="number" value={temperature} disabled={readOnly} onChange={e => { setTemperature(e.target.value); markDirty(); }} placeholder="ex: 22" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Condições Meteo</label>
              <div className="flex flex-wrap gap-4">
                {WEATHER_OPTIONS.map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={weatherChecks[key]} disabled={readOnly} onCheckedChange={c => { setWeatherChecks(prev => ({ ...prev, [key]: !!c })); markDirty(); }} />
                    <span className="text-sm capitalize">{key === 'sol' ? '☀️ Sol' : key === 'nublado' ? '☁️ Nublado' : key === 'chuva' ? '🌧️ Chuva' : '💨 Vento'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Nº Trabalhadores</label>
              <Input value={workersCount} disabled={readOnly} onChange={e => { setWorkersCount(e.target.value); markDirty(); }} placeholder="ex: 5 (1 encarregado, 2 ajudantes, 1 operador, 1 motorista)" />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Equipamentos em Obra</label>
              <Input value={equipment} disabled={readOnly} onChange={e => { setEquipment(e.target.value); markDirty(); }} placeholder="ex: Escavadora giratória Komatsu PC240 + Camião Mercedes" />
            </div>
          </CardContent>
        </Card>

        {/* Section 3 — Works done */}
        <Card>
          <CardHeader><CardTitle className="text-base">Trabalhos Realizados</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={worksDone} disabled={readOnly} onChange={e => { setWorksDone(e.target.value); markDirty(); }} placeholder="Descreva os trabalhos realizados no dia..." rows={5} />
          </CardContent>
        </Card>

        {/* Section 4 — Photos */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4" /> Registo Fotográfico</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!readOnly && (
              <>
                {/* Importar capturas + gerar legendas */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={importCaptures} disabled={importing || captioning}>
                    {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Importar capturas do período
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => generateCaptions(false)} disabled={captioning || photos.length === 0}>
                    {captioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GraduationCap className="w-4 h-4 mr-2" />}
                    Gerar legendas (Eng. Silva)
                  </Button>
                  {photos.some((p) => p.captionStatus === 'error') && (
                    <Button variant="ghost" size="sm" onClick={() => generateCaptions(true)} disabled={captioning}>
                      Repetir falhadas
                    </Button>
                  )}
                  {captioning && (
                    <span className="text-xs text-muted-foreground self-center">
                      {captionProgress.done}/{captionProgress.total}
                    </span>
                  )}
                </div>

                {/* Upload area */}
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handlePhotoFiles(e.dataTransfer.files); }}
                >
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Arraste fotos ou clique para seleccionar</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, HEIC</p>
                  <input id="photo-upload" type="file" multiple accept="image/*,.heic" className="hidden" onChange={e => handlePhotoFiles(e.target.files)} />
                </div>

                {/* Barra de correção em lote (data / piso / fase) */}
                {photos.length > 0 && selectedIdx.size > 0 && (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">Corrigir {selectedIdx.size} foto(s) selecionada(s)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <Input placeholder="Fase (ex: 2.1)" value={batchFase} onChange={e => setBatchFase(e.target.value)} />
                      <Input placeholder="Piso (ex: Piso -6)" value={batchPiso} onChange={e => setBatchPiso(e.target.value)} />
                      <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} />
                      <Button onClick={applyBatch}>Aplicar aos selecionados</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Só os campos preenchidos são aplicados. Fica registado ao guardar o relatório.</p>
                  </div>
                )}
              </>
            )}

            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {photos.map((photo, index) => {
                  const wmLines = photo.capture ? buildWatermarkLines(photo.capture, format(reportDate, 'dd/MM/yyyy')) : [];
                  const capDate = photo.capture?.captured_at ? format(new Date(photo.capture.captured_at), 'yyyy-MM-dd') : '';
                  const is360 = photo.capture?.source_type === 'phone_360' || photo.capture?.source_type === 'phone_360_auto';
                  const needsReview = photo.captionSource === 'ai' && !photo.captionReviewed;
                  return (
                    <div key={index} className={cn('border rounded-lg overflow-hidden', selectedIdx.has(index) ? 'border-primary ring-1 ring-primary' : needsReview ? 'border-amber-500' : 'border-border')}>
                      <div className="relative aspect-video bg-muted">
                        <img src={photo.preview} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        {is360 && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-purple-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <View className="w-3 h-3" /> 360°
                          </div>
                        )}
                        {/* Carimbo RENDERIZADO (overlay não-destrutivo) */}
                        {wmLines.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/55 px-2 py-1">
                            {wmLines.map((ln, i) => (
                              <p key={i} className="text-[10px] leading-tight text-white truncate">{ln}</p>
                            ))}
                          </div>
                        )}
                        {!readOnly && (
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => movePhoto(index, 'up')} disabled={index === 0}>
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => movePhoto(index, 'down')} disabled={index === photos.length - 1}>
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => downloadStamped(photo, index)} title="Descarregar com carimbo">
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removePhoto(index)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        <div className="absolute top-2 left-2 flex items-center gap-2">
                          {!readOnly && (
                            <span className="bg-background/80 rounded p-0.5">
                              <Checkbox checked={selectedIdx.has(index)} onCheckedChange={() => toggleSelect(index)} />
                            </span>
                          )}
                          <Badge className="text-xs">{index + 1}</Badge>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {needsReview && (
                          <div className="flex items-center justify-between gap-2 rounded bg-amber-500/10 border border-amber-500/40 px-2 py-1">
                            <span className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Legenda gerada por IA — por rever
                            </span>
                            {!readOnly && (
                              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => markCaptionReviewed(index)}>
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Marcar revista
                              </Button>
                            )}
                          </div>
                        )}
                        <Input placeholder="Descrição da foto" value={photo.description} disabled={readOnly} onChange={e => updatePhotoField(index, 'description', e.target.value)} />
                        <Input placeholder="Local / Elemento" value={photo.location} disabled={readOnly} onChange={e => updatePhotoField(index, 'location', e.target.value)} />
                        {/* Localização preenchida automaticamente a partir da captura (piso/fase/data);
                            mantém-se editável apenas para correcção pontual. */}
                        <div className="grid grid-cols-3 gap-2">
                          <Input placeholder="Fase" value={photo.capture?.fase || ''} disabled={readOnly} onChange={e => updatePhotoCapture(index, { fase: e.target.value || null })} />
                          <Input placeholder="Piso" value={photo.capture?.piso || ''} disabled={readOnly} onChange={e => updatePhotoCapture(index, { piso: e.target.value || null })} />
                          <Input type="date" value={capDate} disabled={readOnly} onChange={e => updatePhotoCapture(index, { captured_at: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null })} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 4b — Não-conformidades abertas nesta obra (ponto 12) */}
        {openNCs.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Não-Conformidades Abertas nesta Obra</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {openNCs.map((nc, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <span className="text-foreground">{nc.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{nc.severity}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{nc.status}</Badge>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Incluído automaticamente na exportação PDF/DOCX.</p>
            </CardContent>
          </Card>
        )}

        {/* Section 5 — Observations */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={observations} disabled={readOnly} onChange={e => { setObservations(e.target.value); markDirty(); }} placeholder="Observações e não-conformidades..." rows={4} />
          </CardContent>
        </Card>

        {/* Section 6 — Buttons */}
        <div className="flex flex-wrap gap-3 justify-end pb-8">
          <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting || exporting}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          <Button variant="outline" onClick={() => handleExportFromForm('pdf')} disabled={submitting || exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Exportar PDF
          </Button>
          <Button variant="outline" onClick={() => handleExportFromForm('docx')} disabled={submitting || exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} Exportar DOCX
          </Button>
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={() => handleSave('draft')} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar Rascunho
              </Button>
              <Button onClick={() => handleSave('final')} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar como Final
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedSite(null)}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatórios Fotográficos</h1>
            <p className="text-sm text-muted-foreground">{selectedSite.name}{selectedSite.address ? ` — ${selectedSite.address}` : ''}</p>
          </div>
        </div>
        <Button onClick={openNewForm}><Plus className="w-4 h-4 mr-2" /> Novo Relatório</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Camera className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum relatório fotográfico ainda</p>
            <Button onClick={openNewForm}><Plus className="w-4 h-4 mr-2" /> Criar Primeiro Relatório</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const isFinal = report.status === 'final';
            const isMine = report.user_id === user?.id;
            return (
              <Card key={report.id} className="hover:border-primary/30 transition">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {format(new Date(report.report_date + 'T00:00:00'), 'dd MMM yyyy', { locale: pt })}
                        {report.document_number ? <span className="text-xs text-muted-foreground ml-2">{report.document_number}</span> : null}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{(report.photos || []).length} foto{(report.photos || []).length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <Badge variant={isFinal ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                          {isFinal ? 'Final' : 'Rascunho'}
                        </Badge>
                        {!isMine && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">de outro fiscal</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleExport(report, 'pdf')} title="Exportar PDF" disabled={exporting}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleExport(report, 'docx')} title="Exportar DOCX" disabled={exporting}>
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditForm(report)} title={isFinal ? 'Ver (final, fechado a edição)' : 'Editar'}>
                      {isFinal ? <Eye className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                    </Button>
                    {isMine && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(report.id)} title="Eliminar" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar Relatório?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acção é irreversível. Todas as fotos serão eliminadas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
