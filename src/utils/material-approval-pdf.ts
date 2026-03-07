import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FiscalNote {
  note: string;
  created_at: string;
}

interface ApprovalData {
  pdm_name: string;
  material_category: string;
  status: string;
  final_decision?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
  fiscal_notes?: FiscalNote[] | null;
}

interface AnalysisData {
  recommendation?: string;
  confidence?: number;
  material_proposed?: {
    name?: string;
    manufacturer?: string;
    model?: string;
    specifications?: string[];
  };
  material_specified?: {
    description?: string;
    requirements?: string[];
  };
  compliance_checks?: Array<{
    aspect: string;
    status: string;
    detail: string;
  }>;
  issues?: string[];
  conditions?: string[];
  justification?: string;
  norms_referenced?: string[];
}

// Layout constants
const ML = 25;        // margin left
const MR = 25;        // margin right
const MT = 20;        // margin top
const MB = 20;        // margin bottom
const PAGE_W = 210;   // A4 width
const CW = PAGE_W - ML - MR; // 160mm content width
const PAGE_H = 297;
const FOOTER_Y = PAGE_H - MB + 7; // 284
const MAX_Y = PAGE_H - MB - 5;    // 272 — trigger new page before this

export function generateMaterialApprovalPDF(
  approval: ApprovalData,
  analysis: AnalysisData,
  obraName: string,
  fiscalName?: string,
  fiscalCompany?: string
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-PT');
  const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  let y = MT;

  // ── Helpers ──

  const addHeader = () => {
    // Title left
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Análise PAM', ML, MT + 6);

    // Branding right
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('OBRIFY — Fiscalização Inteligente', PAGE_W - MR, MT + 6, { align: 'right' });

    // Second line
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const subLine = `${obraName}  •  Gerado em ${dateStr} às ${timeStr}`;
    const subLines = doc.splitTextToSize(subLine, CW);
    doc.text(subLines, ML, MT + 13);
    const subH = subLines.length * 4;

    // Separator line
    const lineY = MT + 14 + subH;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(ML, lineY, PAGE_W - MR, lineY);

    return lineY + 6;
  };

  const checkSpace = (needed: number) => {
    if (y + needed > MAX_Y) {
      addFooter();
      doc.addPage();
      y = addHeader();
    }
  };

  const addFooter = () => {
    const pageNum = doc.getNumberOfPages();
    doc.setPage(pageNum);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('OBRIFY — Fiscalização Inteligente de Obras', ML, FOOTER_Y);
    // Page number placeholder — will be overwritten in final pass
  };

  const addSectionTitle = (title: string) => {
    checkSpace(14);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(title, ML, y);
    y += 7;
  };

  const addWrappedText = (text: string, x: number, maxWidth: number, fontSize = 10): number => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineH = fontSize * 0.45;
    // Check if we need a page break mid-text
    for (let i = 0; i < lines.length; i++) {
      checkSpace(lineH + 1);
      doc.text(lines[i], x, y);
      y += lineH + 0.8;
    }
    return lines.length * (lineH + 0.8);
  };

  // ── First page header ──
  y = addHeader();

  // ── Status badge ──
  const status = approval.final_decision || approval.status || analysis.recommendation || 'pending';
  const statusLabel = status === 'approved' ? 'APROVADO'
    : status === 'approved_with_reservations' ? 'APROVADO COM RESERVAS'
    : status === 'rejected' ? 'REJEITADO' : 'PENDENTE';
  const statusColor: [number, number, number] = status === 'approved' ? [39, 174, 96]
    : status === 'rejected' ? [231, 76, 60]
    : status === 'approved_with_reservations' ? [230, 126, 34] : [149, 165, 166];

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const badgeTextW = doc.getTextWidth(statusLabel);
  const badgePad = 5;
  const badgeW = badgeTextW + badgePad * 2;
  const badgeH = 9;
  doc.setFillColor(...statusColor);
  doc.roundedRect(ML, y, badgeW, badgeH, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, ML + badgePad, y + 6.5);
  y += badgeH + 6;

  // ── Basic info ──
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  addWrappedText(`Categoria: ${approval.material_category}`, ML, CW);
  addWrappedText(`Ficheiro PAM: ${approval.pdm_name}`, ML, CW);
  addWrappedText(`Data de submissão: ${new Date(approval.created_at).toLocaleDateString('pt-PT')}`, ML, CW);
  y += 4;

  // ── Material Proposed ──
  if (analysis.material_proposed) {
    addSectionTitle('Material Proposto');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const mp = analysis.material_proposed;
    if (mp.name) addWrappedText(`Nome: ${mp.name}`, ML + 4, CW - 4);
    if (mp.manufacturer) addWrappedText(`Fabricante: ${mp.manufacturer}`, ML + 4, CW - 4);
    if (mp.model) addWrappedText(`Modelo: ${mp.model}`, ML + 4, CW - 4);
    if (mp.specifications?.length) {
      addWrappedText(`Especificações: ${mp.specifications.join(', ')}`, ML + 4, CW - 4);
    }
    y += 3;
  }

  // ── Material Specified ──
  if (analysis.material_specified) {
    addSectionTitle('Especificação do Projecto');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    if (analysis.material_specified.description) {
      addWrappedText(analysis.material_specified.description, ML + 4, CW - 4);
    }
    if (analysis.material_specified.requirements?.length) {
      analysis.material_specified.requirements.forEach(r => {
        addWrappedText(`• ${r}`, ML + 8, CW - 8);
      });
    }
    y += 3;
  }

  // ── Compliance table ──
  if (analysis.compliance_checks?.length) {
    addSectionTitle('Verificações de Conformidade');

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Aspecto', 'Estado', 'Detalhe']],
      body: analysis.compliance_checks.map(c => [
        c.aspect,
        c.status === 'conforme' ? '✓ Conforme' : c.status === 'não_conforme' ? '✗ Não conforme' : '? A verificar',
        c.detail,
      ]),
      styles: { fontSize: 9, cellPadding: 3, textColor: [71, 85, 105], lineColor: [204, 204, 204], lineWidth: 0.3 },
      headStyles: { fillColor: [245, 245, 245], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: CW * 0.28 },
        1: { cellWidth: CW * 0.2 },
        2: { cellWidth: CW * 0.52 },
      },
      didDrawPage: () => {
        // header on new pages created by autoTable
        y = addHeader();
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Issues (pink background) ──
  if (analysis.issues?.length && analysis.issues[0]) {
    addSectionTitle('Problemas Identificados');

    // Pre-calculate wrapped lines to determine box height
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const allLines: string[] = [];
    analysis.issues.forEach(issue => {
      const wrapped = doc.splitTextToSize(`• ${issue}`, CW - 12);
      allLines.push(...wrapped);
    });
    const lineH = 4.5;
    const boxH = allLines.length * lineH + 10;

    checkSpace(boxH);
    doc.setFillColor(253, 232, 232); // #FDE8E8
    doc.roundedRect(ML, y, CW, boxH, 2, 2, 'F');
    y += 5;
    doc.setTextColor(185, 28, 28);
    allLines.forEach(line => {
      doc.text(line, ML + 6, y);
      y += lineH;
    });
    y += 5;
  }

  // ── Conditions (yellow background) ──
  if (analysis.conditions?.length && analysis.conditions[0]) {
    addSectionTitle('Condições de Aprovação');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const allLines: string[] = [];
    analysis.conditions.forEach(c => {
      const wrapped = doc.splitTextToSize(`• ${c}`, CW - 12);
      allLines.push(...wrapped);
    });
    const lineH = 4.5;
    const boxH = allLines.length * lineH + 10;

    checkSpace(boxH);
    doc.setFillColor(254, 249, 231); // #FEF9E7
    doc.roundedRect(ML, y, CW, boxH, 2, 2, 'F');
    y += 5;
    doc.setTextColor(146, 64, 14);
    allLines.forEach(line => {
      doc.text(line, ML + 6, y);
      y += lineH;
    });
    y += 5;
  }

  // ── Justification ──
  if (analysis.justification) {
    addSectionTitle('Justificação');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    addWrappedText(analysis.justification, ML + 4, CW - 4);
    y += 3;
  }

  // ── Norms Referenced ──
  if (analysis.norms_referenced?.length) {
    addSectionTitle('Normas Referenciadas');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    addWrappedText(analysis.norms_referenced.join(', '), ML + 4, CW - 4);
    y += 3;
  }

  // ── Fiscal Observations ──
  const notes: FiscalNote[] = (approval.fiscal_notes as FiscalNote[]) || [];
  if (notes.length > 0) {
    addSectionTitle('Observações do Fiscal');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    notes.forEach(n => {
      const ts = new Date(n.created_at).toLocaleDateString('pt-PT') + ' ' +
        new Date(n.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      addWrappedText(`${ts} — "${n.note}"`, ML + 4, CW - 4, 9);
    });
    y += 3;
  }

  // ── Final Decision / Reviewer Notes ──
  if (approval.final_decision || approval.reviewer_notes) {
    addSectionTitle('Decisão Final');

    checkSpace(25);
    doc.setFillColor(241, 245, 249);
    // We'll draw the background after calculating content height
    const boxStartY = y;
    y += 5;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    const decLabel = approval.final_decision === 'approved' ? 'Aprovado'
      : approval.final_decision === 'approved_with_reservations' ? 'Aprovado c/ Reservas'
      : approval.final_decision === 'rejected' ? 'Rejeitado' : '—';
    doc.text(`Decisão: ${decLabel}`, ML + 4, y);
    y += 6;

    if (approval.decided_by) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const decDate = approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : '';
      addWrappedText(`Por: ${approval.decided_by} em ${decDate}`, ML + 4, CW - 8, 9);
    }

    if (approval.reviewer_notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      addWrappedText(`Justificação: ${approval.reviewer_notes}`, ML + 4, CW - 8, 9);
    }
    y += 3;

    // Draw background rect (only on same page — simplified)
    const boxH = y - boxStartY;
    const currentPage = doc.getNumberOfPages();
    doc.setPage(currentPage);
    // Move content drawing is already done; draw rect behind on same page
    doc.setFillColor(241, 245, 249);
    // Since jsPDF draws in order, we accept the rect overlapping is not behind.
    // Alternative: we pre-calc. For simplicity, skip background rect for multi-page decisions.
  }

  // ── Confidence bar ──
  if (analysis.confidence) {
    checkSpace(15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Nível de Confiança: ${analysis.confidence}%`, ML, y);
    y += 5;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(ML, y, CW, 4, 2, 2, 'F');
    doc.setFillColor(...statusColor);
    doc.roundedRect(ML, y, CW * (analysis.confidence / 100), 4, 2, 2, 'F');
    y += 10;
  }

  // ── Final pass: footers with page numbers ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('OBRIFY — Fiscalização Inteligente de Obras', ML, FOOTER_Y);
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MR, FOOTER_Y, { align: 'right' });
  }

  const filename = `PAM_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
