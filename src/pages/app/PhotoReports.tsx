import { useState, useEffect, useCallback } from 'react';
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
  Download, Upload,
} from 'lucide-react';
import { generatePhotoReportPDF, type PhotoForExport } from '@/utils/photo-report-pdf';
import { generatePhotoReportDOCX } from '@/utils/photo-report-docx';

type Obra = { id: string; nome: string; cidade: string | null };
type PhotoMeta = { file_path: string; description: string; location: string; sort_order: number };
type Report = {
  id: string; obra_id: string; user_id: string; report_date: string;
  weather: string | null; workers_count: string | null; equipment: string | null;
  works_done: string | null; observations: string | null; photos: PhotoMeta[];
  status: string; created_at: string; updated_at: string;
};

type LocalPhoto = {
  file?: File; file_path?: string; preview: string;
  description: string; location: string; sort_order: number;
};

export default function PhotoReports() {
  const { user } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [selectedObra, setSelectedObra] = useState<Obra | null>(null);
  const [obraModalOpen, setObraModalOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [empreiteiro, setEmpreiteiro] = useState(() => localStorage.getItem('photo_report_contractor') || 'Ferreira Build Power');
  const [fiscalName, setFiscalName] = useState(() => localStorage.getItem('pam_fiscal_name') || '');
  const [fiscalCompany, setFiscalCompany] = useState(() => localStorage.getItem('pam_fiscal_company') || 'DDN');
  const [weatherChecks, setWeatherChecks] = useState<Record<string, boolean>>({ sol: false, nublado: false, chuva: false, vento: false });
  const [temperature, setTemperature] = useState('');
  const [workersCount, setWorkersCount] = useState('');
  const [equipment, setEquipment] = useState('');
  const [worksDone, setWorksDone] = useState('');
  const [observations, setObservations] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Logo state
  const [reportLogo, setReportLogo] = useState<string | null>(() => localStorage.getItem('photo_report_logo'));
  const [clientLogo, setClientLogo] = useState<string | null>(() => localStorage.getItem('photo_report_client_logo'));
  const [exporting, setExporting] = useState(false);

  // Load obras
  useEffect(() => {
    if (!user) return;
    supabase.from('incompaticheck_obras').select('id, nome, cidade').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setObras(data); });
  }, [user]);

  // Load reports
  const loadReports = useCallback(async () => {
    if (!user || !selectedObra) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('photo_reports')
      .select('*')
      .eq('obra_id', selectedObra.id)
      .eq('user_id', user.id)
      .order('report_date', { ascending: false });
    if (data) setReports(data);
    setLoading(false);
  }, [user, selectedObra]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const selectObra = (obra: Obra) => {
    setSelectedObra(obra);
    setObraModalOpen(false);
  };

  const buildWeatherString = () => {
    const parts: string[] = [];
    if (weatherChecks.sol) parts.push('Sol');
    if (weatherChecks.nublado) parts.push('Nublado');
    if (weatherChecks.chuva) parts.push('Chuva');
    if (weatherChecks.vento) parts.push('Vento');
    if (temperature.trim()) parts.push(`${temperature.trim()}°C`);
    return parts.join(', ');
  };

  const parseWeatherString = (w: string | null) => {
    const checks = { sol: false, nublado: false, chuva: false, vento: false };
    let temp = '';
    if (!w) return { checks, temp };
    const lower = w.toLowerCase();
    if (lower.includes('sol')) checks.sol = true;
    if (lower.includes('nublado')) checks.nublado = true;
    if (lower.includes('chuva')) checks.chuva = true;
    if (lower.includes('vento')) checks.vento = true;
    const tempMatch = w.match(/(\d+)\s*°?\s*C/i);
    if (tempMatch) temp = tempMatch[1];
    return { checks, temp };
  };

  // Open form for new report
  const openNewForm = () => {
    setEditingReport(null);
    setReportDate(new Date());
    setEmpreiteiro(localStorage.getItem('photo_report_contractor') || 'Ferreira Build Power');
    setWeatherChecks({ sol: false, nublado: false, chuva: false, vento: false });
    setTemperature('');
    setWorkersCount('');
    setEquipment('');
    setWorksDone('');
    setObservations('');
    setPhotos([]);
    setFormOpen(true);
  };

  // Open form for editing
  const openEditForm = async (report: Report) => {
    setEditingReport(report);
    setReportDate(new Date(report.report_date + 'T00:00:00'));
    setEmpreiteiro((report as any).contractor || localStorage.getItem('photo_report_contractor') || 'Ferreira Build Power');
    const { checks, temp } = parseWeatherString(report.weather);
    setWeatherChecks(checks);
    setTemperature(temp);
    setWorkersCount(report.workers_count || '');
    setEquipment(report.equipment || '');
    setWorksDone(report.works_done || '');
    setObservations(report.observations || '');

    // Load existing photos with signed URLs
    const existingPhotos: LocalPhoto[] = [];
    const photosMeta = report.photos || [];
    for (const p of photosMeta) {
      const { data } = await supabase.storage.from('photo-reports').createSignedUrl(p.file_path, 3600);
      existingPhotos.push({
        file_path: p.file_path,
        preview: data?.signedUrl || '',
        description: p.description,
        location: p.location,
        sort_order: p.sort_order,
      });
    }
    setPhotos(existingPhotos);
    setFormOpen(true);
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
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[index].file) URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated.map((p, i) => ({ ...p, sort_order: i }));
    });
  };

  const movePhoto = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= photos.length) return;
    setPhotos(prev => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated.map((p, i) => ({ ...p, sort_order: i }));
    });
  };

  const updatePhotoField = (index: number, field: 'description' | 'location', value: string) => {
    setPhotos(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setReportLogo(base64);
      localStorage.setItem('photo_report_logo', base64);
      toast.success('Logo guardada');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeLogo = () => {
    setReportLogo(null);
    localStorage.removeItem('photo_report_logo');
  };

  // Save report (returns saved report for chaining with export)
  const handleSave = async (status: 'draft' | 'final'): Promise<Report | null> => {
    if (!user || !selectedObra) return null;
    setSubmitting(true);
    try {
      const reportId = editingReport?.id || crypto.randomUUID();
      const basePath = `${user.id}/${selectedObra.id}/${reportId}`;

      // Upload new photos
      const photosMeta: PhotoMeta[] = [];
      for (const photo of photos) {
        if (photo.file) {
          const filePath = `${basePath}/${Date.now()}_${sanitizeFilename(photo.file.name)}`;
          const { error } = await supabase.storage.from('photo-reports').upload(filePath, photo.file);
          if (error) throw error;
          photosMeta.push({
            file_path: filePath,
            description: photo.description,
            location: photo.location,
            sort_order: photo.sort_order,
          });
        } else if (photo.file_path) {
          photosMeta.push({
            file_path: photo.file_path,
            description: photo.description,
            location: photo.location,
            sort_order: photo.sort_order,
          });
        }
      }

      localStorage.setItem('pam_fiscal_name', fiscalName);
      localStorage.setItem('pam_fiscal_company', fiscalCompany);
      localStorage.setItem('photo_report_contractor', empreiteiro);

      const weatherString = buildWeatherString();

      const record: any = {
        id: reportId,
        obra_id: selectedObra.id,
        user_id: user.id,
        report_date: format(reportDate, 'yyyy-MM-dd'),
        weather: weatherString || null,
        workers_count: workersCount || null,
        equipment: equipment || null,
        works_done: worksDone || null,
        observations: observations || null,
        photos: photosMeta,
        status,
        contractor: empreiteiro || null,
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

  // Delete report
  const handleDelete = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    try {
      const filePaths = (report.photos || []).map(p => p.file_path);
      if (filePaths.length > 0) {
        await supabase.storage.from('photo-reports').remove(filePaths);
      }
      await (supabase as any).from('photo_reports').delete().eq('id', reportId);
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

  const downloadPhotosAsBase64 = async (photosMeta: PhotoMeta[]): Promise<PhotoForExport[]> => {
    const results: PhotoForExport[] = [];
    for (const p of photosMeta) {
      try {
        const { data, error } = await supabase.storage.from('photo-reports').download(p.file_path);
        if (error || !data) continue;
        const base64 = await blobToBase64(data);
        results.push({
          base64,
          description: p.description,
          location: p.location,
          sort_order: p.sort_order,
        });
      } catch {
        // skip failed downloads
      }
    }
    return results.sort((a, b) => a.sort_order - b.sort_order);
  };

  const handleExport = async (report: Report, type: 'pdf' | 'docx') => {
    if (!selectedObra) return;
    setExporting(true);
    try {
      toast.info(`A preparar ${type.toUpperCase()}...`);
      const photoImages = await downloadPhotosAsBase64(report.photos || []);
      const reportData = {
        report_date: report.report_date,
        weather: report.weather,
        workers_count: report.workers_count,
        equipment: report.equipment,
        works_done: report.works_done,
        observations: report.observations,
      };

      // Get fiscal info from localStorage as fallback
      const fn = localStorage.getItem('pam_fiscal_name') || '';
      const fc = localStorage.getItem('pam_fiscal_company') || 'DDN';

      if (type === 'pdf') {
        generatePhotoReportPDF(reportData, selectedObra.nome, selectedObra.cidade || '', (report as any).contractor || '', fn, fc, photoImages, reportLogo);
      } else {
        await generatePhotoReportDOCX(reportData, selectedObra.nome, selectedObra.cidade || '', (report as any).contractor || '', fn, fc, photoImages, reportLogo);
      }
      toast.success(`${type.toUpperCase()} exportado com sucesso`);
    } catch (err: any) {
      toast.error('Erro na exportação: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Export from form (auto-save first)
  const handleExportFromForm = async (type: 'pdf' | 'docx') => {
    const saved = await handleSave('draft');
    if (saved) {
      await handleExport(saved, type);
    }
  };

  // === OBRA SELECTOR ===
  if (!selectedObra) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Camera className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios Fotográficos</h1>
            <p className="text-muted-foreground">Relatório fotográfico diário de obra</p>
          </div>
        </div>

        <Card className="cursor-pointer hover:border-primary/50 transition" onClick={() => setObraModalOpen(true)}>
          <CardContent className="flex items-center gap-4 p-6">
            <Building2 className="w-10 h-10 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Seleccionar Obra</p>
              <p className="text-sm text-muted-foreground">Escolha a obra para gerir os relatórios fotográficos</p>
            </div>
          </CardContent>
        </Card>

        <Dialog open={obraModalOpen} onOpenChange={setObraModalOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Seleccionar Obra</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {obras.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma obra registada. Crie uma no IncompatiCheck.</p>}
              {obras.map(o => (
                <div key={o.id} className="p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition" onClick={() => selectObra(o)}>
                  <p className="font-medium text-foreground">{o.nome}</p>
                  {o.cidade && <p className="text-xs text-muted-foreground">{o.cidade}</p>}
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
          <h1 className="text-xl font-bold text-foreground">{editingReport ? 'Editar Relatório' : 'Novo Relatório Fotográfico'}</h1>
        </div>

        {/* Section 1 — Header */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Cabeçalho</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Logo upload */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Logo da Empresa</label>
              {reportLogo ? (
                <div className="flex items-center gap-4">
                  <div className="border border-border rounded-lg p-2 bg-muted/30">
                    <img src={reportLogo} alt="Logo" className="h-12 max-w-[160px] object-contain" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={removeLogo} className="text-destructive hover:text-destructive">
                    <X className="w-4 h-4 mr-1" /> Remover
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition w-fit">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Carregar logo (PNG, JPG)</span>
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Obra</label>
                <Input value={selectedObra.nome} disabled />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Localização</label>
                <Input value={selectedObra.cidade || '—'} disabled />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Empreiteiro</label>
                <Input value={empreiteiro} onChange={e => setEmpreiteiro(e.target.value)} placeholder="Nome do empreiteiro" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Fiscalização</label>
                <Input value={`${fiscalCompany} — ${fiscalName}`} onChange={e => {
                  const parts = e.target.value.split(' — ');
                  if (parts.length >= 2) { setFiscalCompany(parts[0]); setFiscalName(parts.slice(1).join(' — ')); }
                  else setFiscalName(e.target.value);
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
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reportDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reportDate ? format(reportDate, 'PPP', { locale: pt }) : 'Seleccionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={reportDate} onSelect={d => d && setReportDate(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Temperatura</label>
                <Input value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="ex: 22" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Condições Meteo</label>
              <div className="flex flex-wrap gap-4">
                {(['sol', 'nublado', 'chuva', 'vento'] as const).map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={weatherChecks[key]} onCheckedChange={c => setWeatherChecks(prev => ({ ...prev, [key]: !!c }))} />
                    <span className="text-sm capitalize">{key === 'sol' ? '☀️ Sol' : key === 'nublado' ? '☁️ Nublado' : key === 'chuva' ? '🌧️ Chuva' : '💨 Vento'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Nº Trabalhadores</label>
              <Input value={workersCount} onChange={e => setWorkersCount(e.target.value)} placeholder="ex: 5 (1 encarregado, 2 ajudantes, 1 operador, 1 motorista)" />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Equipamentos em Obra</label>
              <Input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="ex: Escavadora giratória Komatsu PC240 + Camião Mercedes" />
            </div>
          </CardContent>
        </Card>

        {/* Section 3 — Works done */}
        <Card>
          <CardHeader><CardTitle className="text-base">Trabalhos Realizados</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={worksDone} onChange={e => setWorksDone(e.target.value)} placeholder="Descreva os trabalhos realizados no dia..." rows={5} />
          </CardContent>
        </Card>

        {/* Section 4 — Photos */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Camera className="w-4 h-4" /> Registo Fotográfico</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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

            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {photos.map((photo, index) => (
                  <div key={index} className="border border-border rounded-lg overflow-hidden">
                    <div className="relative aspect-video bg-muted">
                      <img src={photo.preview} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => movePhoto(index, 'up')} disabled={index === 0}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => movePhoto(index, 'down')} disabled={index === photos.length - 1}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removePhoto(index)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <Badge className="absolute top-2 left-2 text-xs">{index + 1}</Badge>
                    </div>
                    <div className="p-3 space-y-2">
                      <Input placeholder="Descrição da foto" value={photo.description} onChange={e => updatePhotoField(index, 'description', e.target.value)} />
                      <Input placeholder="Local / Elemento" value={photo.location} onChange={e => updatePhotoField(index, 'location', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 5 — Observations */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="Observações e não-conformidades..." rows={4} />
          </CardContent>
        </Card>

        {/* Section 6 — Buttons */}
        <div className="flex flex-wrap gap-3 justify-end pb-8">
          <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting || exporting}>Cancelar</Button>
          <Button variant="outline" onClick={() => handleExportFromForm('pdf')} disabled={submitting || exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Exportar PDF
          </Button>
          <Button variant="outline" onClick={() => handleExportFromForm('docx')} disabled={submitting || exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} Exportar DOCX
          </Button>
          <Button variant="secondary" onClick={() => handleSave('draft')} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar Rascunho
          </Button>
          <Button onClick={() => handleSave('final')} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar como Final
          </Button>
        </div>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedObra(null)}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatórios Fotográficos</h1>
            <p className="text-sm text-muted-foreground">{selectedObra.nome}{selectedObra.cidade ? ` — ${selectedObra.cidade}` : ''}</p>
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
          {reports.map(report => (
            <Card key={report.id} className="hover:border-primary/30 transition">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {format(new Date(report.report_date + 'T00:00:00'), 'dd MMM yyyy', { locale: pt })}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{(report.photos || []).length} foto{(report.photos || []).length !== 1 ? 's' : ''}</span>
                      <span>•</span>
                      <Badge variant={report.status === 'final' ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                        {report.status === 'final' ? 'Final' : 'Rascunho'}
                      </Badge>
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
                  <Button variant="ghost" size="icon" onClick={() => openEditForm(report)} title="Editar">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(report.id)} title="Eliminar" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
