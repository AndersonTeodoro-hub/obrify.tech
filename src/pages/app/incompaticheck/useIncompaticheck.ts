import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import type { Obra, Project, Analysis, Finding, ChatMessage } from './types';
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
    // Delete storage files for this obra
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
    }
    await supabase.from('incompaticheck_obras').delete().eq('id', id);
    setObras(prev => prev.filter(o => o.id !== id));
    if (obraAtiva?.id === id) {
      setObraAtiva(null);
      setProjects([]);
      setFindings([]);
      setAnalysis(null);
      setChatMessages([]);
    }
  }, [user, obraAtiva]);

  const selectObra = useCallback(async (obra: Obra) => {
    setObraAtiva(obra);
    await Promise.all([
      loadProjects(obra.id),
      loadChat(obra.id),
      loadLatestAnalysis(obra.id),
    ]);
  }, []);

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

  // ---- REPORT ----
  const generateReport = useCallback(async (clientLogoBase64?: string | null) => {
    if (!obraAtiva || !analysis || !user) return null;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(10, 12, 16);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 107, 53);
    doc.setFontSize(18);
    doc.text('IncompatiCheck', 20, 20);
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text('Relatório de Incompatibilidades', 20, 30);

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
      doc.text(`Gerado automaticamente por IncompatiCheck — ${new Date().toLocaleDateString('pt-PT')}`, 20, 285);
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
    clientLogoBase64?: string | null
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
    doc.setTextColor(255, 107, 53);
    doc.setFontSize(18);
    doc.text('IncompatiCheck', margin, 20);
    doc.setFontSize(11);
    doc.setTextColor(200, 200, 200);
    doc.text('Relatório de Incompatibilidades com Anotações', margin, 30);

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
      doc.text(`Gerado automaticamente por IncompatiCheck — ${new Date().toLocaleDateString('pt-PT')}`, margin, 285);
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
    // Actions
    loadObras,
    createObra,
    deleteObra,
    selectObra,
    uploadProject,
    deleteProject,
    runAnalysis,
    sendUserMessage,
    generateReport,
    generateReportWithAnnotations,
    setUploadProgress,
  };
}
