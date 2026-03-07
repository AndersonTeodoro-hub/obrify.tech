import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  FileCheck, Plus, Upload, ChevronDown, ChevronUp, Trash2, CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, Building2, ArrowLeft, FileText, Award, Factory, X, Download, ScrollText, FileSignature,
} from 'lucide-react';
import { generateMaterialApprovalPDF } from '@/utils/material-approval-pdf';

const CATEGORIES = [
  'Betão (classes)', 'Aço (armaduras)', 'Cofragem', 'Impermeabilização',
  'Isolamento Térmico', 'Isolamento Acústico', 'Revestimentos', 'Tubagens e Acessórios',
  'Equipamentos AVAC', 'Equipamentos Eléctricos', 'Caixilharia', 'Tintas e Acabamentos',
  'Elementos Pré-fabricados', 'Outros',
];

type Obra = { id: string; nome: string; cidade: string | null };
type FiscalNote = { note: string; created_at: string };
type Approval = {
  id: string; obra_id: string; pdm_name: string; pdm_file_path: string; pdm_file_size: number | null;
  mqt_name: string | null; mqt_file_path: string | null; mqt_file_size: number | null;
  contract_file_path: string | null; contract_file_name: string | null;
  material_category: string; status: string; ai_analysis: any; ai_recommendation: string | null;
  reviewer_notes: string | null; final_decision: string | null; decided_by: string | null;
  decided_at: string | null; created_at: string; updated_at: string;
  certificates?: Array<{ name: string; path: string; size: number }>;
  manufacturer_docs?: Array<{ name: string; path: string; size: number }>;
  fiscal_notes?: FiscalNote[] | null;
};

export default function MaterialApprovals() {
  const { user } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [selectedObra, setSelectedObra] = useState<Obra | null>(null);
  const [obraModalOpen, setObraModalOpen] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);

  // New approval modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [pdmFile, setPdmFile] = useState<File | null>(null);
  const [mqtFile, setMqtFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [certFiles, setCertFiles] = useState<File[]>([]);
  const [mfgFiles, setMfgFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Decision
  const [decisionNotes, setDecisionNotes] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{ id: string; decision: string } | null>(null);

  // Fiscal notes
  const [fiscalNote, setFiscalNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Load obras
  useEffect(() => {
    if (!user) return;
    supabase.from('incompaticheck_obras').select('id, nome, cidade').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setObras(data); });
  }, [user]);

  // Load approvals
  const loadApprovals = useCallback(async () => {
    if (!user || !selectedObra) return;
    setLoading(true);
    const { data } = await supabase
      .from('material_approvals')
      .select('*')
      .eq('obra_id', selectedObra.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setApprovals(data as unknown as Approval[]);
    setLoading(false);
  }, [user, selectedObra]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // Select obra + save to Silva memory
  const selectObra = async (obra: Obra) => {
    setSelectedObra(obra);
    setObraModalOpen(false);
    try {
      await supabase.functions.invoke('eng-silva-memory', {
        body: { action: 'update_profile', profile: { current_obra_id: obra.id, current_obra_name: obra.nome } },
      });
    } catch {}
  };

  const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Submit new approval
  const handleSubmit = async () => {
    if (!user || !selectedObra || !pdmFile || !category) return;
    setSubmitting(true);
    try {
      const ts = Date.now();
      const basePath = `${user.id}/${selectedObra.id}/${ts}`;

      // 1. Upload PAM
      const pdmPath = `${basePath}_pam_${sanitizeFilename(pdmFile.name)}`;
      const { error: upErr } = await supabase.storage.from('material-approvals').upload(pdmPath, pdmFile);
      if (upErr) throw upErr;

      // 2. Upload MQT (optional)
      let mqtPath: string | null = null;
      if (mqtFile) {
        mqtPath = `${basePath}_mqt_${sanitizeFilename(mqtFile.name)}`;
        const { error } = await supabase.storage.from('material-approvals').upload(mqtPath, mqtFile);
        if (error) throw error;
      }

      // 3. Upload Contract (optional)
      let contractPath: string | null = null;
      if (contractFile) {
        contractPath = `${basePath}_contract_${sanitizeFilename(contractFile.name)}`;
        const { error } = await supabase.storage.from('material-approvals').upload(contractPath, contractFile);
        if (error) throw error;
      }

      // 4. Upload certificates
      const certificatesJson: Array<{ name: string; path: string; size: number }> = [];
      for (const cf of certFiles) {
        const cfPath = `${basePath}_cert_${sanitizeFilename(cf.name)}`;
        const { error } = await supabase.storage.from('material-approvals').upload(cfPath, cf);
        if (error) throw error;
        certificatesJson.push({ name: cf.name, path: cfPath, size: cf.size });
      }

      // 5. Upload manufacturer docs
      const mfgDocsJson: Array<{ name: string; path: string; size: number }> = [];
      for (const mf of mfgFiles) {
        const mfPath = `${basePath}_mfg_${sanitizeFilename(mf.name)}`;
        const { error } = await supabase.storage.from('material-approvals').upload(mfPath, mf);
        if (error) throw error;
        mfgDocsJson.push({ name: mf.name, path: mfPath, size: mf.size });
      }

      // 6. Insert record
      const { data: record, error: insErr } = await supabase.from('material_approvals').insert({
        obra_id: selectedObra.id,
        user_id: user.id,
        pdm_name: pdmFile.name,
        pdm_file_path: pdmPath,
        pdm_file_size: pdmFile.size,
        mqt_name: mqtFile?.name || null,
        mqt_file_path: mqtPath,
        mqt_file_size: mqtFile?.size || null,
        contract_file_path: contractPath,
        contract_file_name: contractFile?.name || null,
        material_category: category,
        status: 'pending',
        certificates: certificatesJson as any,
        manufacturer_docs: mfgDocsJson as any,
      } as any).select().single();
      if (insErr) throw insErr;

      setNewModalOpen(false);
      setPdmFile(null);
      setMqtFile(null);
      setContractFile(null);
      setCertFiles([]);
      setMfgFiles([]);
      setCategory('');
      toast.success('Pedido criado. A iniciar análise...');
      await loadApprovals();

      processApproval(record as unknown as Approval);
    } catch (err: any) {
      toast.error('Erro ao submeter: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const processApproval = async (approval: Approval) => {
    try {
      // Download PAM
      const { data: pdmData } = await supabase.storage.from('material-approvals').download(approval.pdm_file_path);
      if (!pdmData) throw new Error('Failed to download PAM');
      const pdmBase64 = await blobToBase64(pdmData);

      // Download MQT (if exists)
      let mqtBase64: string | null = null;
      if (approval.mqt_file_path) {
        try {
          const { data } = await supabase.storage.from('material-approvals').download(approval.mqt_file_path);
          if (data) mqtBase64 = await blobToBase64(data);
        } catch { /* skip */ }
      }

      // Download Contract (if exists)
      let contractBase64: string | null = null;
      if (approval.contract_file_path) {
        try {
          const { data } = await supabase.storage.from('material-approvals').download(approval.contract_file_path);
          if (data) contractBase64 = await blobToBase64(data);
        } catch { /* skip */ }
      }

      // Download certificates
      const certificatesBase64: Array<{ name: string; base64: string; type: string }> = [];
      const certs = (approval as any).certificates || [];
      for (const cert of certs) {
        try {
          const { data } = await supabase.storage.from('material-approvals').download(cert.path);
          if (data) {
            const b64 = await blobToBase64(data);
            certificatesBase64.push({ name: cert.name, base64: b64, type: data.type });
          }
        } catch { /* skip failed downloads */ }
      }

      // Download manufacturer docs
      const mfgDocsBase64: Array<{ name: string; base64: string; type: string }> = [];
      const mfgDocs = (approval as any).manufacturer_docs || [];
      for (const mdoc of mfgDocs) {
        try {
          const { data } = await supabase.storage.from('material-approvals').download(mdoc.path);
          if (data) {
            const b64 = await blobToBase64(data);
            mfgDocsBase64.push({ name: mdoc.name, base64: b64, type: data.type });
          }
        } catch { /* skip failed downloads */ }
      }

      console.log("PAM: Sending to edge function:", JSON.stringify({
        has_pdm: !!pdmBase64,
        has_mqt: !!mqtBase64,
        has_contract: !!contractBase64,
        certs: certificatesBase64.length,
        mfg_docs: mfgDocsBase64.length,
      }));

      await supabase.functions.invoke('analyze-material-approval', {
        body: {
          approval_id: approval.id,
          pdm_base64: pdmBase64,
          mqt_base64: mqtBase64,
          contract_base64: contractBase64,
          certificates_base64: certificatesBase64,
          manufacturer_docs_base64: mfgDocsBase64,
          material_category: approval.material_category,
          obra_id: approval.obra_id,
        },
      });

      toast.success('Análise concluída!');
      await loadApprovals();
    } catch (err: any) {
      toast.error('Erro na análise: ' + err.message);
      await supabase.from('material_approvals').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', approval.id);
      await loadApprovals();
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // Decision actions
  const handleDecision = async (id: string, decision: string, notes: string) => {
    await supabase.from('material_approvals').update({
      final_decision: decision,
      decided_by: user?.email || user?.id,
      decided_at: new Date().toISOString(),
      reviewer_notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setPendingDecision(null);
    setDecisionNotes('');
    toast.success('Decisão registada');
    await loadApprovals();
  };

  const handleSaveFiscalNote = async (approvalId: string) => {
    if (!fiscalNote.trim()) return;
    setSavingNote(true);
    try {
      const approval = approvals.find(a => a.id === approvalId);
      const existing: FiscalNote[] = (approval?.fiscal_notes as FiscalNote[]) || [];
      const updated = [...existing, { note: fiscalNote.trim(), created_at: new Date().toISOString() }];
      await supabase.from('material_approvals').update({
        fiscal_notes: updated as any,
        updated_at: new Date().toISOString(),
      }).eq('id', approvalId);
      setFiscalNote('');
      toast.success('Observação guardada');
      await loadApprovals();
    } catch (err: any) {
      toast.error('Erro ao guardar: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDelete = async (approval: Approval) => {
    const pathsToRemove = [approval.pdm_file_path];
    if (approval.mqt_file_path) pathsToRemove.push(approval.mqt_file_path);
    if (approval.contract_file_path) pathsToRemove.push(approval.contract_file_path);
    const certs = (approval as any).certificates || [];
    certs.forEach((c: any) => { if (c.path) pathsToRemove.push(c.path); });
    const mfgDocs = (approval as any).manufacturer_docs || [];
    mfgDocs.forEach((m: any) => { if (m.path) pathsToRemove.push(m.path); });

    await supabase.storage.from('material-approvals').remove(pathsToRemove);
    await supabase.from('material_approvals').delete().eq('id', approval.id);
    toast.success('Pedido eliminado');
    await loadApprovals();
  };

  // Stats
  const stats = {
    total: approvals.length,
    approved: approvals.filter(a => a.status === 'approved' || a.final_decision === 'approved').length,
    reservations: approvals.filter(a => a.status === 'approved_with_reservations' || a.final_decision === 'approved_with_reservations').length,
    rejected: approvals.filter(a => a.status === 'rejected' || a.final_decision === 'rejected').length,
    pending: approvals.filter(a => a.status === 'pending' || a.status === 'analyzing').length,
  };

  const statusBadge = (status: string, finalDecision?: string | null) => {
    const s = finalDecision || status;
    switch (s) {
      case 'pending': return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
      case 'analyzing': return <Badge className="gap-1 bg-amber-500 text-white animate-pulse"><Loader2 className="w-3 h-3 animate-spin" /> A analisar...</Badge>;
      case 'approved': return <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Aprovado ✓</Badge>;
      case 'approved_with_reservations': return <Badge className="gap-1 bg-amber-500 text-white"><AlertTriangle className="w-3 h-3" /> Aprovado c/ Reservas ⚠</Badge>;
      case 'rejected': return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejeitado ✗</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  // Upload box component
  const UploadBox = ({ icon: Icon, title, subtitle, accept, multiple, files, onFilesChange }: {
    icon: any; title: string; subtitle: string; accept: string; multiple?: boolean;
    files: File | File[] | null; onFilesChange: (files: File | File[] | null) => void;
  }) => {
    const inputId = `upload-${title.replace(/\s/g, '')}`;
    const fileList = Array.isArray(files) ? files : files ? [files] : [];

    return (
      <div>
        <div
          className="border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition flex items-center gap-3"
          style={{ minHeight: '72px' }}
          onClick={() => document.getElementById(inputId)?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (multiple) {
              onFilesChange([...(Array.isArray(files) ? files : []), ...droppedFiles]);
            } else {
              onFilesChange(droppedFiles[0] || null);
            }
          }}
        >
          <input
            id={inputId}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={e => {
              const selected = Array.from(e.target.files || []);
              if (multiple) {
                onFilesChange([...(Array.isArray(files) ? files : []), ...selected]);
              } else {
                onFilesChange(selected[0] || null);
              }
              e.target.value = '';
            }}
          />
          <Icon className="w-6 h-6 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        {fileList.length > 0 && (
          <div className="mt-2 space-y-1">
            {fileList.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-foreground">{f.name}</span>
                <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (multiple && Array.isArray(files)) {
                      const updated = [...files];
                      updated.splice(i, 1);
                      onFilesChange(updated);
                    } else {
                      onFilesChange(null);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // No obra selected
  if (!selectedObra) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-primary" /> Aprovação de Materiais
          </h1>
          <p className="text-muted-foreground mt-1">Análise automática de PAM com base no projecto</p>
        </div>
        <Card className="max-w-lg mx-auto mt-12">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Selecione uma obra para gerir aprovações de materiais</p>
            <Button onClick={() => setObraModalOpen(true)}>Selecionar Obra</Button>
          </CardContent>
        </Card>
        <Dialog open={obraModalOpen} onOpenChange={setObraModalOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Selecionar Obra</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {obras.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma obra encontrada. Crie uma no IncompatiCheck primeiro.</p>}
              {obras.map(o => (
                <button key={o.id} onClick={() => selectObra(o)} className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition">
                  <p className="font-medium text-foreground">{o.nome}</p>
                  {o.cidade && <p className="text-xs text-muted-foreground">{o.cidade}</p>}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => setSelectedObra(null)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> Trocar obra
          </button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-primary" /> Aprovação de Materiais
          </h1>
          <p className="text-muted-foreground text-sm">{selectedObra.nome}{selectedObra.cidade ? ` — ${selectedObra.cidade}` : ''}</p>
        </div>
        <Button onClick={() => setNewModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Pedido
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Aprovados', value: stats.approved, color: 'text-green-500' },
          { label: 'C/ Reservas', value: stats.reservations, color: 'text-amber-500' },
          { label: 'Rejeitados', value: stats.rejected, color: 'text-destructive' },
          { label: 'Pendentes', value: stats.pending, color: 'text-muted-foreground' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approvals list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : approvals.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum pedido de aprovação. Clique em "+ Novo Pedido" para começar.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {approvals.map(a => {
            const expanded = expandedId === a.id;
            const analysis = a.ai_analysis;
            return (
              <Card key={a.id} className="overflow-hidden">
                <button className="w-full text-left p-4 flex items-center gap-4 hover:bg-accent/30 transition" onClick={() => setExpandedId(expanded ? null : a.id)}>
                  <Badge variant="outline" className="shrink-0">{a.material_category}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{a.pdm_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString('pt-PT')}</p>
                  </div>
                  {statusBadge(a.status, a.final_decision)}
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {(!analysis || a.status === 'pending' || a.status === 'analyzing') ? (
                      <div className="text-center py-4 text-muted-foreground">
                        {a.status === 'analyzing' ? (
                          <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> A analisar documento...</div>
                        ) : (
                          <div className="space-y-2">
                            <p>Análise pendente</p>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); processApproval(a); }}>Analisar agora</Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Material proposed */}
                        {analysis.material_proposed && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">Material Proposto</h4>
                            <div className="text-sm text-muted-foreground space-y-0.5">
                              <p><span className="font-medium text-foreground">Nome:</span> {analysis.material_proposed.name}</p>
                              <p><span className="font-medium text-foreground">Fabricante:</span> {analysis.material_proposed.manufacturer}</p>
                              <p><span className="font-medium text-foreground">Modelo:</span> {analysis.material_proposed.model}</p>
                              {analysis.material_proposed.specifications?.length > 0 && (
                                <p><span className="font-medium text-foreground">Especificações:</span> {analysis.material_proposed.specifications.join(', ')}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Material specified */}
                        {analysis.material_specified && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">Especificação do Projecto</h4>
                            <p className="text-sm text-muted-foreground">{analysis.material_specified.description}</p>
                            {analysis.material_specified.requirements?.length > 0 && (
                              <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                                {analysis.material_specified.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                              </ul>
                            )}
                          </div>
                        )}

                        <Separator />

                        {/* Compliance checks */}
                        {analysis.compliance_checks?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-2">Verificações de Conformidade</h4>
                            <div className="space-y-1">
                              {analysis.compliance_checks.map((c: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  {c.status === 'conforme' ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> :
                                   c.status === 'não_conforme' ? <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /> :
                                   <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                                  <div>
                                    <span className="font-medium text-foreground">{c.aspect}:</span>{' '}
                                    <span className="text-muted-foreground">{c.detail}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Issues */}
                        {analysis.issues?.length > 0 && analysis.issues[0] && (
                          <div className="bg-destructive/10 rounded-lg p-3">
                            <h4 className="text-sm font-semibold text-destructive mb-1">Problemas Identificados</h4>
                            <ul className="text-sm text-destructive/80 list-disc list-inside">
                              {analysis.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
                            </ul>
                          </div>
                        )}

                        {/* Conditions */}
                        {analysis.conditions?.length > 0 && analysis.conditions[0] && (
                          <div className="bg-amber-500/10 rounded-lg p-3">
                            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1">Condições</h4>
                            <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
                              {analysis.conditions.map((c: string, i: number) => <li key={i}>{c}</li>)}
                            </ul>
                          </div>
                        )}

                        {/* Justification */}
                        {analysis.justification && (
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">Justificação</h4>
                            <p className="text-sm text-muted-foreground">{analysis.justification}</p>
                          </div>
                        )}

                        {/* Norms + Confidence */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {analysis.norms_referenced?.map((n: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{n}</Badge>
                          ))}
                        </div>
                        {analysis.confidence && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">Confiança:</span>
                            <Progress value={analysis.confidence} className="flex-1 h-2" />
                            <span className="text-xs font-medium text-foreground">{analysis.confidence}%</span>
                          </div>
                        )}

                        <Separator />

                        {/* OBSERVAÇÕES DO FISCAL */}
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-2">Observações do Fiscal</h4>
                          <div className="flex gap-2">
                            <Textarea
                              placeholder="Escreva uma observação..."
                              value={expandedId === a.id ? fiscalNote : ''}
                              onChange={e => setFiscalNote(e.target.value)}
                              rows={2}
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 self-end"
                              disabled={!fiscalNote.trim() || savingNote}
                              onClick={() => handleSaveFiscalNote(a.id)}
                            >
                              {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                            </Button>
                          </div>
                          {((a.fiscal_notes as FiscalNote[]) || []).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {([...((a.fiscal_notes as FiscalNote[]) || [])]).reverse().map((fn, i) => (
                                <div key={i} className="text-sm bg-muted/50 rounded px-3 py-1.5">
                                  <span className="text-xs text-muted-foreground">{new Date(fn.created_at).toLocaleDateString('pt-PT')} {new Date(fn.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span className="mx-2 text-muted-foreground">—</span>
                                  <span className="text-foreground">{fn.note}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* DECISÃO FINAL */}
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-2">Decisão Final</h4>
                          {a.final_decision ? (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-sm"><span className="font-medium text-foreground">Decisão:</span> {a.final_decision === 'approved' ? 'Aprovado' : a.final_decision === 'approved_with_reservations' ? 'Aprovado c/ Reservas' : 'Rejeitado'}</p>
                              {a.decided_by && <p className="text-xs text-muted-foreground">Por: {a.decided_by} em {a.decided_at ? new Date(a.decided_at).toLocaleDateString('pt-PT') : ''}</p>}
                              {a.reviewer_notes && <p className="text-sm text-muted-foreground mt-1">Justificação: {a.reviewer_notes}</p>}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" className={`gap-1 ${pendingDecision?.id === a.id && pendingDecision.decision === 'approved' ? 'bg-green-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`} onClick={() => setPendingDecision({ id: a.id, decision: 'approved' })}>
                                  <CheckCircle2 className="w-3 h-3" /> Aprovado
                                </Button>
                                <Button size="sm" className={`gap-1 ${pendingDecision?.id === a.id && pendingDecision.decision === 'approved_with_reservations' ? 'bg-amber-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`} onClick={() => setPendingDecision({ id: a.id, decision: 'approved_with_reservations' })}>
                                  <AlertTriangle className="w-3 h-3" /> Aprovado c/ Reservas
                                </Button>
                                <Button size="sm" variant="destructive" className={`gap-1 ${pendingDecision?.id === a.id && pendingDecision.decision === 'rejected' ? 'ring-2 ring-destructive' : ''}`} onClick={() => setPendingDecision({ id: a.id, decision: 'rejected' })}>
                                  <XCircle className="w-3 h-3" /> Rejeitado
                                </Button>
                              </div>
                              {pendingDecision?.id === a.id && (
                                <div className="space-y-2">
                                  <Textarea
                                    placeholder="Justificação da decisão (opcional)..."
                                    value={decisionNotes}
                                    onChange={e => setDecisionNotes(e.target.value)}
                                    rows={2}
                                  />
                                  <Button size="sm" onClick={() => handleDecision(a.id, pendingDecision.decision, decisionNotes)}>
                                    Confirmar Decisão
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Export + Delete */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => generateMaterialApprovalPDF(a, analysis, selectedObra.nome)}
                          >
                            <Download className="w-3 h-3" /> Exportar PDF
                          </Button>
                        </div>
                      </>
                    )}

                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(a)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New approval modal */}
      <Dialog open={newModalOpen} onOpenChange={setNewModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Pedido de Aprovação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Categoria do Material</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <UploadBox
              icon={FileText}
              title="PAM / Ficha Técnica *"
              subtitle="PDF do pedido de aprovação do empreiteiro"
              accept=".pdf"
              files={pdmFile}
              onFilesChange={(f) => setPdmFile(f as File | null)}
            />

            <UploadBox
              icon={ScrollText}
              title="MQT / Caderno de Encargos"
              subtitle="Mapa de quantidades e trabalhos (opcional)"
              accept=".pdf"
              files={mqtFile}
              onFilesChange={(f) => setMqtFile(f as File | null)}
            />

            <UploadBox
              icon={FileSignature}
              title="Contrato da Obra"
              subtitle="Contrato de empreitada (opcional)"
              accept=".pdf"
              files={contractFile}
              onFilesChange={(f) => setContractFile(f as File | null)}
            />

            <UploadBox
              icon={Award}
              title="Certificados e Laudos"
              subtitle="Certificados CE, laudos, relatórios de ensaio"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              files={certFiles}
              onFilesChange={(f) => setCertFiles(f as File[])}
            />

            <UploadBox
              icon={Factory}
              title="Documentos do Fabricante"
              subtitle="Fichas técnicas, catálogos, declarações de desempenho"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              files={mfgFiles}
              onFilesChange={(f) => setMfgFiles(f as File[])}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!category || !pdmFile || submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> A submeter...</> : 'Submeter para Análise'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
