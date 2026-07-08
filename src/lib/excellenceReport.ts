import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderPageWithMark } from './evidenceImage';
import { invokeNoisy } from './invokeNoisy';
import type { CrossFinding, SelfFinding, ElementRow } from '@/pages/app/incompaticheck/types';

interface UnifiedFinding {
  id: string;
  kind: 'cross' | 'self';
  severity: 'alta' | 'media' | 'baixa';
  tipo: string;
  title: string;
  description: string;
  impact: string | null;
  location: string | null;
  recommendation: string | null;
  status: string;
  element_a_id: string;
  element_b_id: string | null;
}

export interface ExcellenceOpts {
  obra: { id: string; nome: string; cidade?: string | null; fiscal?: string | null };
  crossFindings: CrossFinding[];
  selfFindings: SelfFinding[];
  elementsMap: Record<string, ElementRow>;
  projectFiles: Record<string, string>; // project_id -> file_path
  clientLogo: string | null;
  fiscalLogo: string | null;
  tone: 'fiscalizacao' | 'projetista';
  onProgress?: (step: string) => void;
}

const SEV_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
const sevLabel = (s: string) => (s === 'alta' ? 'ALTA' : s === 'media' ? 'MEDIA' : 'BAIXA');
const sevColor = (s: string): [number, number, number] => (s === 'alta' ? [220, 38, 38] : s === 'media' ? [217, 119, 6] : [37, 99, 235]);
const statusLabel = (s: string) => (s === 'confirmado' ? 'Confirmado' : s === 'rejeitado' ? 'Rejeitado' : 'Novo');

function sanitize(text: string): string {
  return (text || '')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/←/g, '<-')
    .replace(/Ø/g, 'O/').replace(/ø/g, 'o/').replace(/±/g, '+/-').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/×/g, 'x').replace(/÷/g, '/').replace(/€/g, 'EUR').replace(/°/g, 'o').replace(/…/g, '...')
    .replace(/–/g, '-').replace(/—/g, ' - ')
    .replace(/“/g, '"').replace(/”/g, '"').replace(/‘/g, "'").replace(/’/g, "'")
    .replace(/[^\x00-\x7F\xC0-\xFF]/g, (ch) => (ch.charCodeAt(0) >= 0x100 ? '?' : ch));
}

export async function generateExcellenceReport(opts: ExcellenceOpts): Promise<void> {
  const { obra, crossFindings, selfFindings, elementsMap, projectFiles, clientLogo, fiscalLogo, tone, onProgress } = opts;

  const unified: UnifiedFinding[] = [
    ...crossFindings.map<UnifiedFinding>((f) => ({
      id: f.id, kind: 'cross', severity: f.severity, tipo: f.tipo_conflito, title: f.title,
      description: f.description, impact: f.impact, location: f.location, recommendation: f.recommendation,
      status: f.status, element_a_id: f.element_a_id, element_b_id: f.element_b_id,
    })),
    ...selfFindings.map<UnifiedFinding>((f) => ({
      id: f.id, kind: 'self', severity: f.severity, tipo: f.tipo_problema, title: f.title,
      description: f.description, impact: f.impact, location: f.location, recommendation: f.recommendation,
      status: f.status, element_a_id: f.element_a_id, element_b_id: f.element_b_id,
    })),
  ].filter((f) => f.status !== 'rejeitado')
    .sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (a.status === 'confirmado' ? -1 : 1));

  onProgress?.('A montar o resumo...');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ---- Pagina 1: resumo executivo ----
  if (fiscalLogo) { try { doc.addImage(fiscalLogo, 'PNG', margin, 10, 28, 18); } catch { /* skip */ } }
  if (clientLogo) { try { doc.addImage(clientLogo, 'PNG', pageWidth - margin - 35, 8, 35, 20); } catch { /* skip */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(30, 30, 30);
  doc.text('Relatorio de Incompatibilidades', pageWidth / 2, 18, { align: 'center' });
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(margin, 32, pageWidth - margin, 32);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  let y = 40;
  doc.text(sanitize(`Obra: ${obra.nome}`), margin, y);
  if (obra.cidade) { y += 6; doc.text(sanitize(`Localizacao: ${obra.cidade}`), margin, y); }
  if (obra.fiscal) { y += 6; doc.text(sanitize(`Fiscal: ${obra.fiscal}`), margin, y); }
  y += 6; doc.text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, margin, y);

  const alta = unified.filter((f) => f.severity === 'alta').length;
  const media = unified.filter((f) => f.severity === 'media').length;
  const baixa = unified.filter((f) => f.severity === 'baixa').length;
  const confirmados = unified.filter((f) => f.status === 'confirmado').length;
  y += 12;
  doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  doc.text(`Total: ${unified.length}   Alta: ${alta}   Media: ${media}   Baixa: ${baixa}   Confirmados: ${confirmados}`, margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Sev.', 'Titulo', 'Localizacao', 'Estado']],
    body: unified.map((f, i) => [
      String(i + 1), sevLabel(f.severity), sanitize(f.title),
      sanitize(f.location || '-'), statusLabel(f.status),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [255, 107, 53], fontSize: 8, textColor: [255, 255, 255] },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 16 }, 2: { cellWidth: 78 }, 3: { cellWidth: 44 }, 4: { cellWidth: 24 } },
    margin: { left: margin, right: margin },
  });

  // ---- Paginas de evidencia (2 findings por pagina) ----
  const imageForElement = async (elId: string | null): Promise<{ dataUrl: string; caption?: string } | null> => {
    if (!elId) return null;
    const el = elementsMap[elId];
    if (!el) return null;
    const filePath = projectFiles[el.project_id];
    if (!filePath || !el.source_page) return null;
    const positions = el.position ? [el.position] : [];
    const dataUrl = await renderPageWithMark(filePath, el.source_page, positions);
    return { dataUrl, caption: el.position ? undefined : 'Posicao nao capturada - re-extrair o projeto para ativar a marcacao.' };
  };

  const addImageFitted = (dataUrl: string, atY: number, maxH: number): number => {
    const props = doc.getImageProperties(dataUrl);
    const w = contentWidth;
    let h = (props.height / props.width) * w;
    let drawW = w;
    if (h > maxH) { h = maxH; drawW = (props.width / props.height) * maxH; }
    doc.addImage(dataUrl, 'JPEG', margin + (contentWidth - drawW) / 2, atY, drawW, h);
    return atY + h;
  };

  for (let i = 0; i < unified.length; i++) {
    const f = unified[i];
    onProgress?.(`A gerar evidencia ${i + 1}/${unified.length}...`);
    if (i % 2 === 0) { doc.addPage(); y = margin; }

    // Cabecalho do finding
    const col = sevColor(f.severity);
    doc.setFillColor(col[0], col[1], col[2]);
    doc.roundedRect(margin, y, 20, 6, 1, 1, 'F');
    doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    doc.text(sevLabel(f.severity), margin + 2.5, y + 4);
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(sanitize(f.tipo), margin + 24, y + 4);
    y += 10;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.splitTextToSize(sanitize(f.title), contentWidth).forEach((ln: string) => { doc.text(ln, margin, y); y += 5; });

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
    doc.splitTextToSize(sanitize(f.description), contentWidth).forEach((ln: string) => { doc.text(ln, margin, y); y += 4.5; });
    if (f.impact) { doc.setTextColor(120, 60, 20); doc.splitTextToSize(sanitize(`Impacto: ${f.impact}`), contentWidth).forEach((ln: string) => { doc.text(ln, margin, y); y += 4.5; }); }
    if (f.recommendation) { doc.setTextColor(20, 90, 40); doc.splitTextToSize(sanitize(`Recomendacao: ${f.recommendation}`), contentWidth).forEach((ln: string) => { doc.text(ln, margin, y); y += 4.5; }); }
    y += 2;

    // Imagens (partilha pagina se mesmo projeto+pagina)
    const elA = elementsMap[f.element_a_id];
    const elB = f.element_b_id ? elementsMap[f.element_b_id] : null;
    const maxImgH = 78;
    try {
      if (elA && elB && elA.project_id === elB.project_id && elA.source_page === elB.source_page) {
        const filePath = projectFiles[elA.project_id];
        if (filePath && elA.source_page) {
          const positions = [elA.position, elB.position].filter(Boolean) as { x: number; y: number }[];
          const dataUrl = await renderPageWithMark(filePath, elA.source_page, positions);
          y = addImageFitted(dataUrl, y, maxImgH) + 4;
          if (positions.length === 0) { doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.text('Posicao nao capturada - re-extrair o projeto para ativar a marcacao.', margin, y); y += 4; }
        }
      } else {
        for (const elId of [f.element_a_id, f.element_b_id]) {
          const res = await imageForElement(elId);
          if (res) {
            y = addImageFitted(res.dataUrl, y, maxImgH) + 3;
            if (res.caption) { doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.text(sanitize(res.caption), margin, y); y += 4; }
          }
        }
      }
    } catch (imgErr: any) {
      doc.setFontSize(8); doc.setTextColor(200, 40, 40);
      doc.splitTextToSize(sanitize(`Evidencia visual indisponivel: ${imgErr?.message || 'erro'}`), contentWidth).forEach((ln: string) => { doc.text(ln, margin, y); y += 4.5; });
    }
    y += 6;
  }

  // ---- Pagina final: corpo de email ----
  onProgress?.('A gerar o corpo de email...');
  doc.addPage(); y = margin;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 30, 30);
  doc.text('Corpo de Email', margin, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);

  let emailText: string;
  try {
    const data = await invokeNoisy('incompaticheck-report-email', {
      obra_id: obra.id, finding_ids: unified.map((f) => f.id), tone,
    });
    emailText = data?.email_body || '';
    if (!emailText) throw new Error('resposta vazia');
  } catch (err: any) {
    emailText = `Email nao gerado: ${err?.message || 'erro desconhecido'}`;
    doc.setTextColor(200, 40, 40);
  }
  doc.splitTextToSize(sanitize(emailText), contentWidth).forEach((ln: string) => {
    if (y > pageHeight - 15) { doc.addPage(); y = margin; }
    doc.text(ln, margin, y); y += 5;
  });

  // Rodape
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`Obrify IncompatiCheck - ${new Date().toLocaleDateString('pt-PT')}`, margin, pageHeight - 8);
    doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  onProgress?.('A guardar...');
  doc.save(`Relatorio_${obra.nome.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
