import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  BookOpen, Upload, FileText, Loader2, Building2, Trash2, CheckCircle2, RotateCcw, ChevronDown, ChevronRight, Brain,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

const PROJECT_SPECIALTIES = [
  'Topografia', 'Arquitectura', 'Estrutural', 'Fundações', 'Rede Enterrada',
  'AVAC', 'Águas e Esgotos', 'Electricidade', 'Telecomunicações', 'Gás',
  'Segurança Contra Incêndios', 'Acústica', 'Térmica',
];

const DOCUMENT_TYPES = [
  'Contrato', 'Caderno de Encargos', 'Condições Técnicas', 'Mapa de Quantidades (MQT)',
  'Memória Descritiva', 'Acta de Reunião', 'Relatório Fotográfico', 'Pormenores Construtivos',
  'Mapa de Acabamentos', 'Plano de Segurança', 'Plano de Qualidade', 'Correspondência', 'Outros',
];

function getFileMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/pdf';
}

interface Obra {
  id: string;
  nome: string;
  cidade: string | null;
  fiscal: string | null;
}

interface KnowledgeDoc {
  id: string;
  obra_id: string;
  document_name: string;
  document_type: string;
  specialty: string;
  summary: string;
  key_elements: any[];
  file_path: string | null;
  file_size: number | null;
  processed: boolean;
  created_at: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectKnowledge() {
  const { user } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [selectedObra, setSelectedObra] = useState<Obra | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [showObraList, setShowObraList] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadSpecialty, setUploadSpecialty] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Load obras
  useEffect(() => {
    if (!user) return;
    supabase
      .from('incompaticheck_obras')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setObras(data as Obra[]);
      });
  }, [user]);

  // Load documents when obra selected
  const loadDocuments = useCallback(async () => {
    if (!selectedObra || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('eng_silva_project_knowledge')
      .select('*')
      .eq('obra_id', selectedObra.id)
      .eq('user_id', user.id)
      .order('specialty', { ascending: true });
    if (!error && data) setDocuments(data as KnowledgeDoc[]);
    setLoading(false);
  }, [selectedObra, user]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Save current obra to Silva's memory
  const syncObraToSilva = useCallback(async (obra: Obra) => {
    try {
      await supabase.functions.invoke('eng-silva-memory', {
        body: {
          action: 'update_profile',
          profile: { current_obra_id: obra.id, current_obra_name: obra.nome },
        },
      });
      console.log('KNOWLEDGE: Synced obra to Silva memory:', obra.nome);
    } catch (err) {
      console.error('KNOWLEDGE: Failed to sync obra:', err);
    }
  }, []);

  const handleSelectObra = (obra: Obra) => {
    setSelectedObra(obra);
    setShowObraList(false);
    syncObraToSilva(obra);
  };

  // Upload
  const handleUpload = async () => {
    if (!selectedObra || !user || !uploadSpecialty || uploadFiles.length === 0) return;
    setUploading(true);

    try {
      for (const file of uploadFiles) {
        const filePath = `${user.id}/${selectedObra.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('project-knowledge')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const mimeType = getFileMimeType(file.name);
        const docType = mimeType.startsWith('image/') ? mimeType.split('/')[1] : 'pdf';

        const { data: insertData, error: insertError } = await supabase
          .from('eng_silva_project_knowledge')
          .insert({
            obra_id: selectedObra.id,
            user_id: user.id,
            document_name: file.name,
            document_type: docType,
            specialty: uploadSpecialty,
            summary: '',
            file_path: filePath,
            file_size: file.size,
            processed: false,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        // Auto-process
        if (insertData) {
          processDocument(insertData.id, file, file.name, uploadSpecialty);
        }
      }

      toast.success(`${uploadFiles.length} documento(s) carregado(s)`);
      setShowUpload(false);
      setUploadFiles([]);
      setUploadSpecialty('');
      loadDocuments();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Erro ao carregar: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const processDocument = async (docId: string, file: File | null, docName: string, specialty: string) => {
    setProcessingId(docId);
    try {
      let file_base64: string | null = null;
      let file_type = 'application/pdf';

      if (file) {
        file_type = getFileMimeType(file.name);
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        file_base64 = btoa(binary);
      } else {
        // Download from storage
        const doc = documents.find(d => d.id === docId);
        if (doc?.file_path) {
          file_type = getFileMimeType(doc.document_name);
          const { data: fileData } = await supabase.storage
            .from('project-knowledge')
            .download(doc.file_path);
          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            file_base64 = btoa(binary);
          }
        }
      }

      if (!file_base64) {
        toast.error('Não foi possível ler o ficheiro');
        return;
      }

      const { data, error } = await supabase.functions.invoke('eng-silva-knowledge', {
        body: {
          action: 'process_document',
          document_id: docId,
          document_name: docName,
          specialty,
          file_base64,
          file_type,
        },
      });

      if (error) throw error;
      toast.success(`"${docName}" processado — ${data?.elements_count || 0} elementos extraídos`);
      loadDocuments();
    } catch (err: any) {
      console.error('Process error:', err);
      toast.error('Erro ao processar: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (doc: KnowledgeDoc) => {
    try {
      if (doc.file_path) {
        await supabase.storage.from('project-knowledge').remove([doc.file_path]);
      }
      await supabase.from('eng_silva_project_knowledge').delete().eq('id', doc.id);
      toast.success('Documento eliminado');
      loadDocuments();
    } catch (err: any) {
      toast.error('Erro ao eliminar');
    }
  };

  const handleBatchProcess = async () => {
    const unprocessed = documents.filter(d => !d.processed);
    if (unprocessed.length === 0) return;
    setBatchProcessing(true);
    for (const doc of unprocessed) {
      await processDocument(doc.id, null, doc.document_name, doc.specialty);
    }
    setBatchProcessing(false);
    toast.success('Todos os documentos processados!');
  };

  const toggleExpand = (id: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group by specialty
  const grouped = documents.reduce<Record<string, KnowledgeDoc[]>>((acc, doc) => {
    if (!acc[doc.specialty]) acc[doc.specialty] = [];
    acc[doc.specialty].push(doc);
    return acc;
  }, {});

  const totalDocs = documents.length;
  const processedCount = documents.filter(d => d.processed).length;
  const pendingCount = totalDocs - processedCount;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/app">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Conhecimento do Projecto</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-7 h-7 text-amber-500" />
            Conhecimento do Projecto
          </h1>
          <p className="text-muted-foreground mt-1">
            Documentos carregados para o Eng. Silva consultar
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowObraList(true)}>
          <Building2 className="w-4 h-4 mr-2" />
          {selectedObra ? selectedObra.nome : 'Selecionar Obra'}
        </Button>
      </div>

      {/* No obra selected */}
      {!selectedObra && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">Selecione uma obra para carregar documentos</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowObraList(true)}>
              Selecionar Obra
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Obra selected */}
      {selectedObra && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{totalDocs}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{processedCount}</p>
                  <p className="text-xs text-muted-foreground">Processados</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Loader2 className="w-8 h-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Carregar Documentos
            </Button>
            {pendingCount > 0 && (
              <Button variant="outline" onClick={handleBatchProcess} disabled={batchProcessing}>
                {batchProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Processar Todos ({pendingCount})
              </Button>
            )}
          </div>

          {/* Documents grouped by specialty */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : totalDocs === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum documento carregado</p>
                <p className="text-sm text-muted-foreground mt-1">Carregue PDFs para o Eng. Silva aprender sobre esta obra</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([specialty, docs]) => (
                <Card key={specialty}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      {specialty}
                      <Badge variant="secondary" className="ml-auto">{docs.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {docs.map(doc => (
                      <Collapsible key={doc.id} open={expandedDocs.has(doc.id)} onOpenChange={() => toggleExpand(doc.id)}>
                        <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-2 flex-1 text-left min-w-0">
                              {expandedDocs.has(doc.id) ? (
                                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                              )}
                              <FileText className="w-4 h-4 shrink-0 text-blue-500" />
                              <span className="font-medium truncate text-sm">{doc.document_name}</span>
                            </button>
                          </CollapsibleTrigger>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatFileSize(doc.file_size)}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(doc.created_at), 'dd/MM/yy', { locale: pt })}
                          </span>
                          {doc.processed ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shrink-0">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Processado
                            </Badge>
                          ) : processingId === doc.id ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse shrink-0">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              A processar...
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="shrink-0">Pendente</Badge>
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            onClick={(e) => { e.stopPropagation(); processDocument(doc.id, null, doc.document_name, doc.specialty); }}
                            disabled={processingId === doc.id}
                            title="Reprocessar"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                            onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <CollapsibleContent>
                          {doc.processed && doc.summary && (
                            <div className="ml-10 mr-3 mb-3 p-3 rounded-lg bg-muted/30 border text-sm space-y-2">
                              <p className="text-foreground leading-relaxed">{doc.summary}</p>
                              {doc.key_elements && doc.key_elements.length > 0 && (
                                <div className="pt-2 border-t">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    {doc.key_elements.length} elementos extraídos
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {doc.key_elements.slice(0, 12).map((el: any, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {el.type}: {el.id}
                                      </Badge>
                                    ))}
                                    {doc.key_elements.length > 12 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{doc.key_elements.length - 12}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Obra selection dialog */}
      <Dialog open={showObraList} onOpenChange={setShowObraList}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {obras.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma obra registada. Crie uma obra no IncompatiCheck primeiro.
              </p>
            ) : (
              obras.map(obra => (
                <button
                  key={obra.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors border"
                  onClick={() => handleSelectObra(obra)}
                >
                  <p className="font-medium">{obra.nome}</p>
                  {obra.cidade && <p className="text-xs text-muted-foreground">{obra.cidade}</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carregar Documentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Especialidade</label>
              <Select value={uploadSpecialty} onValueChange={setUploadSpecialty}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a especialidade" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Ficheiros PDF</label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById('knowledge-file-input')?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {uploadFiles.length > 0
                    ? `${uploadFiles.length} ficheiro(s) seleccionado(s)`
                    : 'Clique para seleccionar PDFs'}
                </p>
                <input
                  id="knowledge-file-input"
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                />
              </div>
              {uploadFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {uploadFiles.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      📄 {f.name} ({formatFileSize(f.size)})
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancelar</Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadSpecialty || uploadFiles.length === 0}
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Carregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
