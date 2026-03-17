import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import type { Obra, Project, Analysis, Finding, ChatMessage, PdeDocument, PdeAnalysis, PdeDocType } from './types';
import { analyzeText, crossAnalyze, getFileExtension, generateAgentResponseFromFindings } from './helpers';
import { EXTRACTABLE_FORMATS, ZIP_FORMATS, ACCEPTED_FORMATS, FILE_SIZE_LIMIT } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export function useIncompaticheck() {
  const { user } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraAtiva, setObraAtiva] = useState<Obra | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // PDE state
  const [pdeDocuments, setPdeDocuments] = useState<PdeDocument[]>([]);
  const [pdeAnalyses, setPdeAnalyses] = useState<PdeAnalysis[]>([]);
  const [analyzingProposal, setAnalyzingProposal] = useState(false);

  // Knowledge state
  const [knowledgeNames, setKnowledgeNames] = useState<Set<string>>(new Set());

  // ---- OBRAS ----
  const loadObras = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('incompaticheck_obras')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setObras(data as unknown as Obra[]);
  }, [user]);

  const createObra = useCallback(async (nome: string, cidade: string, fiscal: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('incompaticheck_obras')
      .insert({ user_id: user.id, nome, cidade, fiscal })
      .select()
      .single();
    if (error) { console.error('Create obra error:', error); return null; }
    const obra = data as unknown as Obra;
    setObras(prev => [obra, ...prev]);
    return obra;
  }, [user]);

  const deleteObra = useCallback(async (id: string) => {
    // Delete storage files for this obra (projects)
    if (user) {
      const { data: projectFiles } = await supabase
        .from('incompaticheck_projects')
        .select('file_path')
        .eq('obra_id', id);
      if (projectFiles && projectFiles.length > 0) {
        const paths = projectFiles.map((p: any) => p.file_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('incompaticheck-files').remove(paths);
        }
      }
      // Delete PDE storage files
      const { data: pdeFiles } = await (supabase as any)
        .from('incompaticheck_pde_documents')
        .select('file_path')
        .eq('obra_id', id);
      if (pdeFiles && pdeFiles.length > 0) {
        const pdePaths = pdeFiles.map((p: any) => p.file_path).filter(Boolean);
        if (pdePaths.length > 0) {
          await supabase.storage.from('incompaticheck-files').remove(pdePaths);
        }
      }
    }
    await supabase.from('incompaticheck_obras').delete().eq('id', id);
    setObras(prev => prev.filter(o => o.id !== id));
    if (obraAtiva?.id === id) {
      setObraAtiva(null);
      setProjects([]);
      setFindings([]);
      setAnalysis(null);
      setChatMessages([]);
      setPdeDocuments([]);
      setPdeAnalyses([]);
    }
  }, [user, obraAtiva]);

  const loadKnowledgeNames = useCallback(async (obraId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('eng_silva_project_knowledge')
      .select('document_name')
      .eq('obra_id', obraId)
      .eq('user_id', user.id)
      .eq('processed', true);
    setKnowledgeNames(new Set(data?.map(k => k.document_name) || []));
  }, [user]);

  const selectObra = useCallback(async (obra: Obra) => {
    setObraAtiva(obra);
    await Promise.all([
      loadProjects(obra.id),
      loadChat(obra.id),
      loadLatestAnalysis(obra.id),
      loadPdeDocuments(obra.id),
      loadPdeAnalyses(obra.id),
      loadKnowledgeNames(obra.id),
    ]);
  }, [loadKnowledgeNames]);

  // ---- PROJECTS ----
  const loadProjects = useCallback(async (obraId: string) => {
    const { data } = await supabase
      .from('incompaticheck_projects')
      .select('*')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data) setProjects(data as unknown as Project[]);
  }, []);

  const uploadProject = useCallback(async (file: File, type: string, obraId: string) => {
    if (!user) return;
    if (file.size > FILE_SIZE_LIMIT) {
      throw new Error('Ficheiro excede o limite de 2GB.');
    }
    const ext = getFileExtension(file.name);
    if (!ACCEPTED_FORMATS.includes(ext)) {
      throw new Error('Formato não suportado.');
    }

    const isZip = ZIP_FORMATS.includes(ext);

    if (isZip) {
      await uploadZip(file, type, obraId);
      return;
    }

    setUploadProgress(`A enviar ${file.name}...`);
    const timestamp = Date.now();
    const path = `${user.id}/${obraId}/${timestamp}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('incompaticheck-files')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setUploadProgress(null);
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    const { error: insertError } = await supabase
      .from('incompaticheck_projects')
      .insert({
        user_id: user.id,
        obra_id: obraId,
        name: file.name,
        type,
        format: ext,
        file_path: path,
        file_size: file.size,
        from_zip: false,
      });

    if (insertError) {
      console.error('Insert project error:', insertError);
    }

    setUploadProgress(null);
    await loadProjects(obraId);
  }, [user, loadProjects]);

  const uploadZip = useCallback(async (file: File, type: string, obraId: string) => {
    if (!user) return;

    setUploadProgress('A ler ficheiro ZIP...');

    // Upload ZIP to storage as backup
    const timestamp = Date.now();
    const zipPath = `${user.id}/${obraId}/${timestamp}_${file.name}`;
    await supabase.storage.from('incompaticheck-files').upload(zipPath, file, { upsert: true });

    // Extract with JSZip
    const zip = await JSZip.loadAsync(file);
    const entries = Object.entries(zip.files).filter(([name, entry]) => {
      if (entry.dir) return false;
      const ext = getFileExtension(name);
      return EXTRACTABLE_FORMATS.includes(ext);
    });

    if (entries.length === 0) {
      setUploadProgress(null);
      throw new Error('O ZIP não contém ficheiros válidos (PDF/DWG/DWF/IFC).');
    }

    for (let i = 0; i < entries.length; i++) {
      const [name, entry] = entries[i];
      setUploadProgress(`A extrair ficheiro ${i + 1} de ${entries.length}: ${name.split('/').pop()}`);

      const blob = await entry.async('blob');
      const ext = getFileExtension(name);
      const cleanName = name.split('/').pop() || name;
      const entryPath = `${user.id}/${obraId}/${timestamp}_${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from('incompaticheck-files')
        .upload(entryPath, blob, { upsert: true });

      if (!upErr) {
        await supabase.from('incompaticheck_projects').insert({
          user_id: user.id,
          obra_id: obraId,
          name: cleanName,
          type,
          format: ext,
          file_path: entryPath,
          file_size: blob.size,
          from_zip: true,
        });
      }
    }

    setUploadProgress(null);
    await loadProjects(obraId);
  }, [user, loadProjects]);

  const deleteProject = useCallback(async (id: string, filePath: string) => {
    await supabase.storage.from('incompaticheck-files').remove([filePath]);
    await supabase.from('incompaticheck_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  // ---- ANALYSIS ----
  const loadLatestAnalysis = useCallback(async (obraId: string) => {
    const { data: analysisData } = await supabase
      .from('incompaticheck_analyses')
      .select('*')
      .eq('obra_id', obraId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (analysisData) {
      const a = analysisData as unknown as Analysis;
      setAnalysis(a);
      // Load findings
      const { data: findingsData } = await supabase
        .from('incompaticheck_findings')
        .select('*')
        .eq('analysis_id', a.id)
        .order('created_at', { ascending: true });
      if (findingsData) setFindings(findingsData as unknown as Finding[]);
    } else {
      setAnalysis(null);
      setFindings([]);
    }
  }, []);

  const runAnalysis = useCallback(async (obraId: string) => {
    if (!user) return;
    setAnalyzing(true);

    // Create analysis record
    const { data: analysisRow, error: createErr } = await supabase
      .from('incompaticheck_analyses')
      .insert({ user_id: user.id, obra_id: obraId, status: 'running', total_projects: projects.length })
      .select()
      .single();

    if (createErr || !analysisRow) {
      console.error('Create analysis error:', createErr);
      setAnalyzing(false);
      return;
    }

    const analysisId = (analysisRow as any).id;

    try {
      // Extract text from PDFs
      const projectsData: Array<{ type: string; name: string; format: string; data: ReturnType<typeof analyzeText> | null }> = [];

      for (const project of projects) {
        if (project.format === 'pdf') {
          setUploadProgress(`A analisar ${project.name}...`);
          try {
            const { data: fileData, error: dlErr } = await supabase.storage
              .from('incompaticheck-files')
              .download(project.file_path);

            if (dlErr || !fileData) {
              projectsData.push({ type: project.type, name: project.name, format: project.format, data: null });
              continue;
            }

            const arrayBuffer = await fileData.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((item: any) => item.str).join(' ');
              fullText += pageText + '\n';
            }
            projectsData.push({ type: project.type, name: project.name, format: project.format, data: analyzeText(fullText) });
          } catch (pdfErr: any) {
            console.error('PDF parse error:', pdfErr);
            projectsData.push({ type: project.type, name: project.name, format: project.format, data: null });
            // Register failed PDF as an info finding later
          }
        } else {
          projectsData.push({ type: project.type, name: project.name, format: project.format, data: null });
        }
      }

      setUploadProgress('A cruzar informações entre projetos...');

      // Cross-analyze
      const newFindings = crossAnalyze(projectsData as any);

      // Insert findings
      if (newFindings.length > 0) {
        const findingsToInsert = newFindings.map(f => ({
          analysis_id: analysisId,
          severity: f.severity,
          title: f.title,
          description: f.description,
          location: f.location,
          tags: f.tags,
          resolved: false,
        }));

        await supabase.from('incompaticheck_findings').insert(findingsToInsert);
      }

      // Update analysis
      const criticalCount = newFindings.filter(f => f.severity === 'critical').length;
      const warningCount = newFindings.filter(f => f.severity === 'warning').length;
      const infoCount = newFindings.filter(f => f.severity === 'info').length;

      await supabase.from('incompaticheck_analyses').update({
        status: 'completed',
        critical_count: criticalCount,
        warning_count: warningCount,
        info_count: infoCount,
        total_projects: projects.length,
        completed_at: new Date().toISOString(),
      }).eq('id', analysisId);

      await loadLatestAnalysis(obraId);

    } catch (err) {
      console.error('Analysis error:', err);
      await supabase.from('incompaticheck_analyses').update({ status: 'failed' }).eq('id', analysisId);
    }

    setUploadProgress(null);
    setAnalyzing(false);
  }, [user, projects, loadLatestAnalysis]);

  // ---- CHAT ----
  const loadChat = useCallback(async (obraId: string) => {
    const { data } = await supabase
      .from('incompaticheck_chat')
      .select('*')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: true });
    if (data) setChatMessages(data as unknown as ChatMessage[]);
    else setChatMessages([]);
  }, []);

  const sendMessage = useCallback(async (content: string, role: 'user' | 'agent', obraId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('incompaticheck_chat')
      .insert({ user_id: user.id, obra_id: obraId, role, content })
      .select()
      .single();
    if (data) {
      setChatMessages(prev => [...prev, data as unknown as ChatMessage]);
    }
  }, [user]);

  const [agentThinking, setAgentThinking] = useState(false);

  const sendUserMessage = useCallback(async (content: string): Promise<string | undefined> => {
    // Persist chat only if obra is active
    if (obraAtiva && user) {
      await sendMessage(content, 'user', obraAtiva.id);
    }

    setAgentThinking(true);
    try {
      const recentMessages = chatMessages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
      recentMessages.push({ role: 'user', content });

      const { data, error } = await supabase.functions.invoke('incompaticheck-agent', {
        body: {
          messages: recentMessages,
          findings: obraAtiva ? findings.map(f => ({ severity: f.severity, title: f.title, description: f.description, location: f.location })) : [],
          obraName: obraAtiva?.nome || undefined,
        },
      });

      if (error) {
        console.error('Agent function error:', error);
        const errMsg = 'Desculpe, ocorreu um erro de comunicação. Tente novamente.';
        if (obraAtiva && user) await sendMessage(errMsg, 'agent', obraAtiva.id);
        return errMsg;
      }

      const reply = data?.reply || data?.error || 'Sem resposta. Tente novamente.';
      if (obraAtiva && user) await sendMessage(reply, 'agent', obraAtiva.id);
      return reply;
    } catch (err) {
      console.error('Agent response error:', err);
      const errMsg = 'Erro de comunicação. Tente novamente.';
      if (obraAtiva && user) await sendMessage(errMsg, 'agent', obraAtiva.id);
      return errMsg;
    } finally {
      setAgentThinking(false);
    }
  }, [obraAtiva, user, findings, chatMessages, sendMessage]);

  // ---- PDE / DESENHOS DE PREPARAÇÃO ----
  const loadPdeDocuments = useCallback(async (obraId: string) => {
    const { data } = await (supabase as any)
      .from('incompaticheck_pde_documents')
      .select('*')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data) setPdeDocuments(data as PdeDocument[]);
    else setPdeDocuments([]);
  }, []);

  const loadPdeAnalyses = useCallback(async (obraId: string) => {
    const { data } = await (supabase as any)
      .from('incompaticheck_pde_analyses')
      .select('*')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false });
    if (data) setPdeAnalyses(data as PdeAnalysis[]);
    else setPdeAnalyses([]);
  }, []);

  const uploadPdeDocument = useCallback(async (file: File, docType: PdeDocType, obraId: string) => {
    if (!user) return;
    const timestamp = Date.now();
    const path = `${user.id}/${obraId}/pde/${timestamp}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('incompaticheck-files')
      .upload(path, file, { upsert: true });

    if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

    const { error: insertError } = await (supabase as any)
      .from('incompaticheck_pde_documents')
      .insert({
        user_id: user.id,
        obra_id: obraId,
        doc_type: docType,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
      });

    if (insertError) {
      console.error('Insert PDE doc error:', insertError);
      throw new Error('Erro ao guardar documento.');
    }

    await loadPdeDocuments(obraId);
  }, [user, loadPdeDocuments]);

  const deletePdeDocument = useCallback(async (id: string, filePath: string) => {
    await supabase.storage.from('incompaticheck-files').remove([filePath]);
    await (supabase as any).from('incompaticheck_pde_documents').delete().eq('id', id);
    setPdeDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const analyzeProposals = useCallback(async (obraId: string) => {
    if (!user) return;
    setAnalyzingProposal(true);

    const pdeDocs = pdeDocuments.filter(d => d.doc_type === 'pde');
    const desenhoDocs = pdeDocuments.filter(d => d.doc_type === 'desenho_preparacao');

    // Fetch knowledge data for original projects
    const { data: knowledgeData } = await supabase
      .from('eng_silva_project_knowledge')
      .select('document_name, specialty, summary, key_elements')
      .eq('obra_id', obraId)
      .eq('user_id', user.id)
      .eq('processed', true);

    const knowledgePayload = knowledgeData?.map(k => ({
      project_name: k.document_name,
      specialty: k.specialty,
      summary: k.summary,
      key_elements: k.key_elements,
    })) || [];

    // Create analysis record
    const { data: analysisRow, error: createErr } = await (supabase as any)
      .from('incompaticheck_pde_analyses')
      .insert({
        user_id: user.id,
        obra_id: obraId,
        status: 'analyzing',
        pde_document_ids: pdeDocs.map(d => d.id),
        desenho_document_ids: desenhoDocs.map(d => d.id),
      })
      .select()
      .single();

    if (createErr || !analysisRow) {
      console.error('Create PDE analysis error:', createErr);
      setAnalyzingProposal(false);
      throw new Error('Erro ao iniciar análise.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('incompaticheck-analyze-proposal', {
        body: {
          obra_id: obraId,
          pde_documents: pdeDocs.map(d => ({ file_path: d.file_path, name: d.file_name })),
          desenho_documents: desenhoDocs.map(d => ({ file_path: d.file_path, name: d.file_name })),
          original_projects: projects.map(p => ({ file_path: p.file_path, name: p.name, type: p.type })),
          existing_findings: findings.map(f => ({
            severity: f.severity,
            title: f.title,
            description: f.description,
            location: f.location,
          })),
          knowledge_data: knowledgePayload,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await (supabase as any)
        .from('incompaticheck_pde_analyses')
        .update({
          status: 'completed',
          verdict: data.verdict,
          ai_analysis: data,
          completed_at: new Date().toISOString(),
        })
        .eq('id', analysisRow.id);

      await loadPdeAnalyses(obraId);
    } catch (err: any) {
      console.error('PDE analysis error:', err);
      await (supabase as any)
        .from('incompaticheck_pde_analyses')
        .update({ status: 'failed' })
        .eq('id', analysisRow.id);
      await loadPdeAnalyses(obraId);
    } finally {
      setAnalyzingProposal(false);
    }
  }, [user, pdeDocuments, projects, findings, loadPdeAnalyses]);

  // ---- REPORT ----
  const generateReport = useCallback(async (clientLogoBase64?: string | null, fiscalLogoBase64?: string | null) => {
    if (!obraAtiva || !analysis || !user) return null;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(10, 12, 16);
    doc.rect(0, 0, pageWidth, 40, 'F');

    let titleX = 20;
    if (fiscalLogoBase64) {
      try {
        doc.addImage(fiscalLogoBase64, 'PNG', 15, 5, 25, 15);
        titleX = 45;
      } catch { /* skip */ }
    }

    doc.setTextColor(255, 107, 53);
    doc.setFontSize(18);
    doc.text('IncompatiCheck', titleX, 20);
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text('Relatório de Incompatibilidades', titleX, 30);

    if (clientLogoBase64) {
      try {
        doc.addImage(clientLogoBase64, 'PNG', pageWidth - 20 - 40, 5, 40, 16);
      } catch { /* skip */ }
    }

    // Obra info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    let y = 50;
    doc.text(`Obra: ${obraAtiva.nome}`, 20, y);
    if (obraAtiva.cidade) doc.text(`Localização: ${obraAtiva.cidade}`, 20, y + 6);
    if (obraAtiva.fiscal) doc.text(`Fiscal: ${obraAtiva.fiscal}`, 20, y + 12);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, 20, y + 18);

    // Summary
    y += 30;
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text('Resumo', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`${analysis.critical_count} incompatibilidades críticas`, 20, y);
    doc.text(`${analysis.warning_count} alertas`, 20, y + 6);
    doc.text(`${analysis.info_count} observações`, 20, y + 12);
    doc.text(`${analysis.total_projects} projetos analisados`, 20, y + 18);

    // Findings table
    y += 30;
    const tableData = findings.map(f => [
      f.severity === 'critical' ? 'CRÍTICA' : f.severity === 'warning' ? 'ALERTA' : 'INFO',
      f.title,
      f.description.substring(0, 120) + (f.description.length > 120 ? '...' : ''),
      f.location || '-',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Severidade', 'Título', 'Descrição', 'Localização']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [255, 107, 53], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 40 },
        2: { cellWidth: 80 },
        3: { cellWidth: 28 },
      },
      margin: { left: 20, right: 20 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado por IncompatiCheck — ${new Date().toLocaleDateString('pt-PT')}`, 20, 285);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 40, 285);
    }

    // Upload to storage
    const pdfBlob = doc.output('blob');
    const pdfPath = `${user.id}/${obraAtiva.id}/relatorios/relatorio_${Date.now()}.pdf`;
    await supabase.storage.from('incompaticheck-files').upload(pdfPath, pdfBlob, { upsert: true });

    // Insert report record
    await supabase.from('incompaticheck_reports').insert({
      user_id: user.id,
      analysis_id: analysis.id,
      obra_id: obraAtiva.id,
      pdf_path: pdfPath,
      shared_via: [],
    });

    return pdfBlob;
  }, [obraAtiva, analysis, findings, user]);

  // ---- REPORT WITH ANNOTATIONS ----
  const generateReportWithAnnotations = useCallback(async (
    analysisResult: { findings: any[]; analyzed_at: string; projects_analyzed: any[] },
    annotatedImages: Map<string, string>,
    clientLogoBase64?: string | null,
    fiscalLogoBase64?: string | null
  ) => {
    if (!obraAtiva || !user) return null;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;

    // Header
    doc.setFillColor(10, 12, 16);
    doc.rect(0, 0, pageWidth, 40, 'F');

    let titleX = margin;
    if (fiscalLogoBase64) {
      try {
        doc.addImage(fiscalLogoBase64, 'PNG', 15, 5, 25, 15);
        titleX = 45;
      } catch { /* skip */ }
    }

    doc.setTextColor(255, 107, 53);
    doc.setFontSize(18);
    doc.text('IncompatiCheck', titleX, 20);
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text('Relatório de Incompatibilidades com Anotações', titleX, 30);

    if (clientLogoBase64) {
      try {
        doc.addImage(clientLogoBase64, 'PNG', pageWidth - margin - 40, 5, 40, 16);
      } catch { /* skip */ }
    }

    // Obra info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    let y = 50;
    doc.text(`Obra: ${obraAtiva.nome}`, margin, y);
    if (obraAtiva.cidade) { y += 6; doc.text(`Localização: ${obraAtiva.cidade}`, margin, y); }
    if (obraAtiva.fiscal) { y += 6; doc.text(`Fiscal: ${obraAtiva.fiscal}`, margin, y); }
    y += 6; doc.text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, margin, y);
    y += 6; doc.text(`Analisado em: ${new Date(analysisResult.analyzed_at).toLocaleString('pt-PT')}`, margin, y);

    // Summary counts
    const altaCount = analysisResult.findings.filter((f: any) => f.severity === 'alta').length;
    const mediaCount = analysisResult.findings.filter((f: any) => f.severity === 'media').length;
    const baixaCount = analysisResult.findings.filter((f: any) => f.severity === 'baixa').length;

    y += 12;
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text('Resumo', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`${altaCount} incompatibilidades críticas`, margin, y);
    doc.text(`${mediaCount} alertas`, margin, y + 6);
    doc.text(`${baixaCount} observações`, margin, y + 12);
    doc.text(`${analysisResult.projects_analyzed.length} projetos analisados`, margin, y + 18);
    y += 30;

    const checkNewPage = (needed: number) => {
      if (y + needed > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
    };

    // Detailed findings
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text('Incompatibilidades Detectadas', margin, y);
    y += 10;

    for (const finding of analysisResult.findings) {
      checkNewPage(60);

      // Severity badge
      const sevColor = finding.severity === 'alta' ? [220, 38, 38] : finding.severity === 'media' ? [217, 119, 6] : [37, 99, 235];
      const sevLabel = finding.severity === 'alta' ? 'ALTA' : finding.severity === 'media' ? 'MÉDIA' : 'BAIXA';

      doc.setFillColor(sevColor[0], sevColor[1], sevColor[2]);
      doc.roundedRect(margin, y - 4, 18, 6, 1, 1, 'F');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(sevLabel, margin + 2, y);

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(finding.id, margin + 22, y);

      y += 6;

      // Title
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(finding.title, contentWidth);
      titleLines.forEach((line: string) => {
        checkNewPage(8);
        doc.text(line, margin, y);
        y += 5;
      });

      // Description
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const descLines = doc.splitTextToSize(finding.description, contentWidth);
      descLines.forEach((line: string) => {
        checkNewPage(6);
        doc.text(line, margin, y);
        y += 4.5;
      });
      y += 2;

      // Location
      if (finding.location && finding.location !== 'N/A') {
        checkNewPage(8);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`📍 ${finding.location}`, margin, y);
        y += 5;
      }

      // Recommendation box
      if (finding.recommendation) {
        checkNewPage(15);
        doc.setFillColor(245, 245, 245);
        const recLines = doc.splitTextToSize(`Recomendação: ${finding.recommendation}`, contentWidth - 10);
        const recHeight = recLines.length * 4.5 + 4;
        doc.roundedRect(margin, y - 3, contentWidth, recHeight, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        recLines.forEach((line: string) => {
          doc.text(line, margin + 4, y);
          y += 4.5;
        });
        y += 3;
      }

      // Annotated image
      if (annotatedImages.has(finding.id)) {
        const imgData = annotatedImages.get(finding.id)!;
        try {
          checkNewPage(100);
          const imgProps = doc.getImageProperties(imgData);
          const imgWidth = contentWidth - 10;
          const imgHeight = (imgProps.height / imgProps.width) * imgWidth;
          const maxImgHeight = 100;
          const finalHeight = Math.min(imgHeight, maxImgHeight);
          const finalWidth = (finalHeight === maxImgHeight) ? (imgProps.width / imgProps.height) * maxImgHeight : imgWidth;

          doc.addImage(imgData, 'JPEG', margin + 5, y, finalWidth, finalHeight);
          y += finalHeight + 3;

          if (finding.zone?.description) {
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.setFont('helvetica', 'italic');
            const captionLines = doc.splitTextToSize(`Zona identificada: ${finding.zone.description}`, contentWidth - 15);
            captionLines.forEach((line: string) => {
              doc.text(line, margin + 5, y);
              y += 4;
            });
            doc.setFont('helvetica', 'normal');
          }
          y += 5;
        } catch (imgErr) {
          console.error('Failed to add image to PDF:', imgErr);
        }
      }

      // Separator
      y += 4;
      checkNewPage(5);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado por IncompatiCheck — ${new Date().toLocaleDateString('pt-PT')}`, margin, 285);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 40, 285);
    }

    // Save PDF
    doc.save(`IncompatiCheck_${obraAtiva.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`);

    // Also upload to storage
    const pdfBlob = doc.output('blob');
    const pdfPath = `${user.id}/${obraAtiva.id}/relatorios/relatorio_anotado_${Date.now()}.pdf`;
    await supabase.storage.from('incompaticheck-files').upload(pdfPath, pdfBlob, { upsert: true });

    return pdfBlob;
  }, [obraAtiva, user]);

  // ---- INIT ----
  useEffect(() => {
    if (user) loadObras();
  }, [user, loadObras]);

  const deleteAnalysis = useCallback(async (analysisId: string) => {
    await supabase.from('incompaticheck_analyses').delete().eq('id', analysisId);
    setAnalysis(null);
    setFindings([]);
  }, []);

  // ---- PDE REPORT ----
  const generatePdeReport = useCallback(async (
    pdeAnalysis: PdeAnalysis,
    pdeDocsList: PdeDocument[],
    clientLogoBase64?: string | null,
    fiscalLogoBase64?: string | null
  ) => {
    if (!obraAtiva) return;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // Header
    doc.setFillColor(10, 12, 16);
    doc.rect(0, 0, pageWidth, 40, 'F');

    let titleX = margin;
    if (fiscalLogoBase64) {
      try {
        doc.addImage(fiscalLogoBase64, 'PNG', 15, 5, 25, 15);
        titleX = 45;
      } catch { /* skip */ }
    }

    doc.setTextColor(255, 107, 53);
    doc.setFontSize(16);
    doc.text('Parecer Técnico — Proposta do Empreiteiro', titleX, 18);
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text('IncompatiCheck · Esclarecimentos & Propostas', titleX, 28);

    if (clientLogoBase64) {
      try {
        doc.addImage(clientLogoBase64, 'PNG', pageWidth - margin - 40, 5, 40, 16);
      } catch { /* skip */ }
    }

    // Obra info
    let y = 50;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.text(`Obra: ${obraAtiva.nome}`, margin, y);
    if (obraAtiva.cidade) { y += 6; doc.text(`Localização: ${obraAtiva.cidade}`, margin, y); }
    if (obraAtiva.fiscal) { y += 6; doc.text(`Fiscal: ${obraAtiva.fiscal}`, margin, y); }
    y += 6; doc.text(`Data do Parecer: ${pdeAnalysis.completed_at ? new Date(pdeAnalysis.completed_at).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT')}`, margin, y);

    // Verdict
    y += 15;
    const verdictLabel = pdeAnalysis.verdict === 'approved' ? 'APROVADO' : pdeAnalysis.verdict === 'approved_with_reservations' ? 'APROVADO COM RESERVAS' : 'REJEITADO';
    const verdictColor: [number, number, number] = pdeAnalysis.verdict === 'approved' ? [34, 197, 94] : pdeAnalysis.verdict === 'approved_with_reservations' ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(...verdictColor);
    doc.roundedRect(margin, y, 50, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(verdictLabel, margin + 25, y + 7, { align: 'center' });

    // Summary
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text('Resumo', margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const summaryLines = doc.splitTextToSize(pdeAnalysis.ai_analysis?.summary || '', pageWidth - margin * 2);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 4.5 + 5;

    // Documents analyzed
    const pdeDocs = pdeDocsList.filter(d => d.doc_type === 'pde');
    const desenhoDocs = pdeDocsList.filter(d => d.doc_type === 'desenho_preparacao');
    const respostaDocs = pdeDocsList.filter(d => d.doc_type === 'resposta_pde');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text('Documentos Analisados', margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (pdeDocs.length > 0) { doc.text(`PDE: ${pdeDocs.map(d => d.file_name).join(', ')}`, margin, y); y += 5; }
    if (desenhoDocs.length > 0) { doc.text(`Desenhos de Preparação: ${desenhoDocs.map(d => d.file_name).join(', ')}`, margin, y); y += 5; }
    if (respostaDocs.length > 0) { doc.text(`Respostas ao PDE: ${respostaDocs.map(d => d.file_name).join(', ')}`, margin, y); y += 5; }
    y += 5;

    // Findings addressed
    if (pdeAnalysis.ai_analysis?.findings_addressed?.length) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('Incompatibilidades Abordadas', margin, y);
      y += 7;

      for (const fa of pdeAnalysis.ai_analysis.findings_addressed) {
        if (y > 270) { doc.addPage(); y = 20; }
        const icon = fa.resolved ? '✓' : '✗';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(fa.resolved ? 34 : 239, fa.resolved ? 197 : 68, fa.resolved ? 94 : 68);
        doc.text(icon, margin, y);
        doc.setTextColor(30, 30, 30);
        doc.text(fa.finding_title, margin + 6, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const commentLines = doc.splitTextToSize(fa.comment, pageWidth - margin * 2 - 6);
        doc.text(commentLines, margin + 6, y);
        y += commentLines.length * 4 + 3;
      }
      y += 5;
    }

    // New issues
    if (pdeAnalysis.ai_analysis?.new_issues?.length) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(239, 68, 68);
      doc.text('Novos Problemas Detectados', margin, y);
      y += 7;

      for (const ni of pdeAnalysis.ai_analysis.new_issues) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        doc.text(`[${ni.severity.toUpperCase()}] ${ni.title}`, margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const descLines = doc.splitTextToSize(ni.description, pageWidth - margin * 2);
        doc.text(descLines, margin, y);
        y += descLines.length * 4 + 3;
        if (ni.location) { doc.text(`Local: ${ni.location}`, margin, y); y += 5; }
      }
      y += 5;
    }

    // Technical notes
    if (pdeAnalysis.ai_analysis?.technical_notes?.length) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('Notas Técnicas', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      for (const note of pdeAnalysis.ai_analysis.technical_notes) {
        if (y > 270) { doc.addPage(); y = 20; }
        const noteLines = doc.splitTextToSize(`• ${note}`, pageWidth - margin * 2);
        doc.text(noteLines, margin, y);
        y += noteLines.length * 4 + 2;
      }
      y += 5;
    }

    // Recommendation
    if (pdeAnalysis.ai_analysis?.recommendation) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('Recomendação Final', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const recLines = doc.splitTextToSize(pdeAnalysis.ai_analysis.recommendation, pageWidth - margin * 2);
      doc.text(recLines, margin, y);
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado por IncompatiCheck — ${new Date().toLocaleDateString('pt-PT')}`, margin, 285);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, 285, { align: 'right' });
    }

    doc.save(`Parecer_PDE_${obraAtiva.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
  }, [obraAtiva]);

  return {
    // State
    obras,
    obraAtiva,
    projects,
    analysis,
    findings,
    chatMessages,
    loading,
    analyzing,
    uploadProgress,
    agentThinking,
    // PDE State
    pdeDocuments,
    pdeAnalyses,
    analyzingProposal,
    // Knowledge
    knowledgeNames,
    // Actions
    loadObras,
    createObra,
    deleteObra,
    selectObra,
    uploadProject,
    deleteProject,
    runAnalysis,
    deleteAnalysis,
    sendUserMessage,
    generateReport,
    generateReportWithAnnotations,
    generatePdeReport,
    setUploadProgress,
    // PDE Actions
    uploadPdeDocument,
    deletePdeDocument,
    analyzeProposals,
  };
}
