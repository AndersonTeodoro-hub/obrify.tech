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
  fiscal_name?: string | null;
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
const HEADER_RESERVED = 36; // space reserved for header on continuation pages

export function generateMaterialApprovalPDF(
  approval: ApprovalData,
  analysis: AnalysisData,
  obraName: string,
  fiscalName?: string,
  fiscalCompany?: string,
  logoBase64?: string,
  clientLogoBase64?: string
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-PT');
  const timeStr = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  let y = MT;

  // ── Helpers ──

  const addHeader = () => {
    let titleX = ML;

    // Logo
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', ML, MT, 20, 12);
        titleX = ML + 24;
      } catch {
        // ignore logo errors
      }
    }

    // Title left
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Análise PAM', titleX, MT + 6);

    // Client logo right
    if (clientLogoBase64) {
      try {
        doc.addImage(clientLogoBase64, 'PNG', PAGE_W - MR - 35, MT, 35, 14);
      } catch { /* skip */ }
    }

    // Second line — obra + date
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const subLine = `${obraName}  •  Gerado em ${dateStr} às ${timeStr}`;
    const subLines = doc.splitTextToSize(subLine, CW);
    doc.text(subLines, titleX, MT + 13);
    let subH = subLines.length * 4;

    // Fiscal name / company line
    if (fiscalName) {
      const fiscalLine = `Técnico Fiscal: ${fiscalName}${fiscalCompany ? ` — ${fiscalCompany}` : ''}`;
      doc.text(fiscalLine, titleX, MT + 13 + subH);
      subH += 4;
    }

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
    doc.text(fiscalCompany ? `${fiscalCompany} — Fiscalização de Obras` : 'Fiscalização de Obras', ML, FOOTER_Y);
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
    for (let i = 0; i < lines.length; i++) {
      checkSpace(lineH + 1);
      doc.text(lines[i], x, y);
      y += lineH + 0.8;
    }
    return lines.length * (lineH + 0.8);
  };

  // Helper for coloured background sections (Issues / Conditions)
  // Draws items line by line with page break support, then paints background behind
  const addColoredSection = (
    items: string[],
    bgColor: [number, number, number],
    textColor: [number, number, number]
  ) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lineH = 4.5;
    const padX = 6;
    const padY = 5;

    // We'll track segments per page so we can draw backgrounds after
    const segments: Array<{ page: number; startY: number; endY: number }> = [];
    let segStart = y;
    let segPage = doc.getNumberOfPages();

    y += padY; // top padding

    items.forEach(item => {
      const wrapped = doc.splitTextToSize(`• ${item}`, CW - padX * 2);
      wrapped.forEach((line: string) => {
        // Check if we need a new page
        if (y + lineH > MAX_Y) {
          // Close current segment
          segments.push({ page: segPage, startY: segStart, endY: y + padY });
          addFooter();
          doc.addPage();
          y = addHeader();
          segPage = doc.getNumberOfPages();
          segStart = y;
          y += padY;
        }
        doc.setTextColor(...textColor);
        doc.text(line, ML + padX, y);
        y += lineH;
      });
    });

    y += padY; // bottom padding
    // Close last segment
    segments.push({ page: segPage, startY: segStart, endY: y });

    // Now draw backgrounds behind text on each page
    const currentPage = doc.getNumberOfPages();
    segments.forEach(seg => {
      doc.setPage(seg.page);
      doc.setFillColor(...bgColor);
      doc.roundedRect(ML, seg.startY, CW, seg.endY - seg.startY, 2, 2, 'F');
    });
    // Restore to current page
    doc.setPage(currentPage);

    // Re-draw text on top of backgrounds (because we drew bg after text)
    // Instead of re-drawing, we use a different approach: draw bg first per line
    // Actually jsPDF draws in order, so bg drawn after text will cover it.
    // We need to redraw the text. Let's use a simpler approach instead.

    // SIMPLER APPROACH: Reset and redraw everything
    // Remove the segments approach and use pre-calculated approach with per-line page breaks

    // Actually, let's just not use background rectangles that span pages.
    // Instead, draw background line by line BEFORE the text on each line.
  };

  // Simpler helper: draws coloured box items with proper page breaks
  const addColoredItems = (
    items: string[],
    bgColor: [number, number, number],
    textColor: [number, number, number]
  ) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lineH = 4.5;
    const padX = 6;
    const padY = 5;

    // Pre-calculate all wrapped lines
    const allLines: string[] = [];
    items.forEach(item => {
      const wrapped = doc.splitTextToSize(`• ${item}`, CW - padX * 2);
      allLines.push(...wrapped);
    });

    // Calculate total box height
    const totalH = allLines.length * lineH + padY * 2;

    // If entire box fits on current page, draw as single block
    if (y + totalH <= MAX_Y) {
      doc.setFillColor(...bgColor);
      doc.roundedRect(ML, y, CW, totalH, 2, 2, 'F');
      y += padY;
      doc.setTextColor(...textColor);
      allLines.forEach(line => {
        doc.text(line, ML + padX, y);
        y += lineH;
      });
      y += padY;
    } else {
      // Box doesn't fit — draw line by line with background strips
      // First, draw background strip for each line, handling page breaks
      let boxStarted = false;

      allLines.forEach((line, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === allLines.length - 1;
        const stripH = lineH + (isFirst ? padY : 0) + (isLast ? padY : 0);

        // Check page break
        if (y + lineH + (isFirst ? padY : 0) > MAX_Y) {
          // Draw bottom edge of current bg if we had started
          if (boxStarted) {
            y += 2; // small gap before page break
          }
          addFooter();
          doc.addPage();
          y = addHeader();
          boxStarted = false;
        }

        // Add top padding on first line or after page break
        if (!boxStarted) {
          // Draw background from here
          // Calculate how many lines fit on this page
          let linesOnPage = 0;
          let testY = y + padY;
          for (let j = idx; j < allLines.length; j++) {
            if (testY + lineH > MAX_Y) break;
            testY += lineH;
            linesOnPage++;
          }
          const blockH = linesOnPage * lineH + padY + (idx + linesOnPage >= allLines.length ? padY : 2);
          doc.setFillColor(...bgColor);
          doc.roundedRect(ML, y, CW, blockH, 2, 2, 'F');
          y += padY;
          boxStarted = true;
        }

        doc.setTextColor(...textColor);
        doc.text(line, ML + padX, y);
        y += lineH;

        if (isLast) {
          y += padY;
        }
      });
    }
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

    const tableStartPage = doc.getNumberOfPages();

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: MT + HEADER_RESERVED },
      head: [['Aspecto', 'Estado', 'Detalhe']],
      body: analysis.compliance_checks.map(c => [
        c.aspect,
        c.status === 'conforme' ? '✓ Conforme' : c.status === 'não_conforme' ? '✗ Não conforme' : '? A verificar',
        c.detail,
      ]),
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [71, 85, 105],
        lineColor: [204, 204, 204],
        lineWidth: 0.3,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [245, 245, 245], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: CW * 0.25 },
        1: { cellWidth: CW * 0.17 },
        2: { cellWidth: CW * 0.58 },
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1 || doc.getNumberOfPages() > tableStartPage) {
          const currentPage = doc.getNumberOfPages();
          doc.setPage(currentPage);
          addHeader();
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Issues (pink background) ──
  if (analysis.issues?.length && analysis.issues[0]) {
    addSectionTitle('Problemas Identificados');
    addColoredItems(
      analysis.issues,
      [253, 232, 232],  // #FDE8E8
      [185, 28, 28]     // dark red text
    );
  }

  // ── Conditions (yellow background) ──
  if (analysis.conditions?.length && analysis.conditions[0]) {
    addSectionTitle('Condições de Aprovação');
    addColoredItems(
      analysis.conditions,
      [254, 249, 231],  // #FEF9E7
      [146, 64, 14]     // dark amber text
    );
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
    // Only need ~35mm for decision block — don't force page break unless really needed
    addSectionTitle('Decisão Final');

    checkSpace(20);
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

    // Resolve display name: fiscal_name > decided_by (only if not email) > fiscalName param
    const displayName = approval.fiscal_name
      || (approval.decided_by && !approval.decided_by.includes('@') ? approval.decided_by : null)
      || fiscalName
      || null;

    if (displayName) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const decDate = approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : '';
      const companyPart = fiscalCompany ? ` — ${fiscalCompany}` : '';
      addWrappedText(`Técnico Fiscal: ${displayName}${companyPart} em ${decDate}`, ML + 4, CW - 8, 9);
    }

    if (approval.reviewer_notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      addWrappedText(`Justificação: ${approval.reviewer_notes}`, ML + 4, CW - 8, 9);
    }
    y += 3;

    // Draw background for decision box
    const boxH = y - boxStartY;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(ML, boxStartY, CW, boxH, 2, 2, 'F');

    // Redraw decision text on top of background
    let redrawY = boxStartY + 5;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Decisão: ${decLabel}`, ML + 4, redrawY);
    redrawY += 6;

    if (displayName) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const decDate = approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : '';
      const companyPart = fiscalCompany ? ` — ${fiscalCompany}` : '';
      const decLines = doc.splitTextToSize(`Técnico Fiscal: ${displayName}${companyPart} em ${decDate}`, CW - 8);
      decLines.forEach((line: string) => {
        doc.text(line, ML + 4, redrawY);
        redrawY += 4.85;
      });
    }

    if (approval.reviewer_notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const noteLines = doc.splitTextToSize(`Justificação: ${approval.reviewer_notes}`, CW - 8);
      noteLines.forEach((line: string) => {
        doc.text(line, ML + 4, redrawY);
        redrawY += 4.85;
      });
    }
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
    doc.text(fiscalCompany ? `${fiscalCompany} — Fiscalização de Obras` : 'Fiscalização de Obras', ML, FOOTER_Y);
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MR, FOOTER_Y, { align: 'right' });
  }

  const filename = `PAM_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

/**
 * Generate a 1-page executive summary PDF for material approval
 */
export function generateMaterialApprovalExecutive(
  approval: ApprovalData,
  analysis: AnalysisData,
  obraName: string,
  fiscalName?: string,
  fiscalCompany?: string,
  logoBase64?: string,
  clientLogoBase64?: string
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-PT');

  const sanitize = (text: string): string => {
    return text
      .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/←/g, '<-')
      .replace(/Ø/g, 'O/').replace(/±/g, '+/-').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/×/g, 'x').replace(/°/g, 'o').replace(/…/g, '...').replace(/–/g, '-').replace(/—/g, ' - ')
      .replace(/"/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'")
      .replace(/[^\x00-\x7F\xC0-\xFF]/g, (ch) => ch.charCodeAt(0) >= 0x100 ? '?' : ch);
  };

  let y = MT;

  // Header with logos
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', ML, 8, 22, 14); } catch {}
  }
  if (clientLogoBase64) {
    try { doc.addImage(clientLogoBase64, 'PNG', PAGE_W - MR - 30, 6, 30, 16); } catch {}
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('Resumo Executivo PAM', PAGE_W / 2, 14, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Pedido de Aprovacao de Materiais', PAGE_W / 2, 20, { align: 'center' });

  // Separator
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(ML, 26, PAGE_W - MR, 26);

  // Info line
  y = 32;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(sanitize(`Obra: ${obraName}  |  Categoria: ${approval.material_category}  |  Data: ${dateStr}`), ML, y);
  if (fiscalName) {
    y += 5;
    doc.text(sanitize(`Fiscal: ${fiscalName}${fiscalCompany ? ` - ${fiscalCompany}` : ''}`), ML, y);
  }

  // Verdict badge
  y += 10;
  const rec = analysis.recommendation || approval.status;
  const statusLabel = rec === 'approved' ? 'APROVADO' : rec === 'approved_with_reservations' ? 'APROVADO C/ RESERVAS' : rec === 'rejected' ? 'REJEITADO' : 'PENDENTE';
  const statusColor: [number, number, number] = rec === 'approved' ? [34, 197, 94] : rec === 'approved_with_reservations' ? [245, 158, 11] : rec === 'rejected' ? [220, 38, 38] : [148, 163, 184];
  const verdictW = Math.max(doc.getTextWidth(statusLabel) + 16, 50);

  doc.setFillColor(...statusColor);
  doc.roundedRect(ML, y, verdictW, 10, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, ML + verdictW / 2, y + 7, { align: 'center' });

  // Confidence
  if (analysis.confidence) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`Confianca: ${analysis.confidence}%`, ML + verdictW + 8, y + 7);
  }

  // Material info box
  y += 18;
  const boxStartY = y;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(ML, y, CW, 30, 2, 2, 'F');

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('Material Proposto', ML + 5, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  y += 5;
  if (analysis.material_proposed?.name) {
    doc.text(sanitize(analysis.material_proposed.name), ML + 5, y);
    y += 4;
  }
  if (analysis.material_proposed?.manufacturer) {
    doc.text(sanitize(`Fabricante: ${analysis.material_proposed.manufacturer}`), ML + 5, y);
    y += 4;
  }
  if (analysis.material_proposed?.model) {
    doc.text(sanitize(`Modelo: ${analysis.material_proposed.model}`), ML + 5, y);
  }

  // Right side: Material specified
  const rightX = ML + CW / 2 + 5;
  let ry = boxStartY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Especificado no Projecto', rightX, ry);
  ry += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  if (analysis.material_specified?.description) {
    const specLines = doc.splitTextToSize(sanitize(analysis.material_specified.description), CW / 2 - 10);
    for (const line of specLines.slice(0, 4)) {
      doc.text(line, rightX, ry);
      ry += 4;
    }
  }

  // Compliance checks table
  y = boxStartY + 34;
  if (analysis.compliance_checks?.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('Verificacoes de Conformidade', ML, y);
    y += 3;

    const conformeCount = analysis.compliance_checks.filter(c => c.status === 'conforme').length;
    const ncCount = analysis.compliance_checks.filter(c => c.status === 'não_conforme' || c.status === 'nao_conforme').length;
    const verifyCount = analysis.compliance_checks.filter(c => c.status === 'a_verificar').length;
    const total = analysis.compliance_checks.length;

    autoTable(doc, {
      startY: y,
      head: [['Aspecto', 'Estado', 'Detalhe']],
      body: analysis.compliance_checks.slice(0, 8).map(c => [
        sanitize(c.aspect),
        c.status === 'conforme' ? 'Conforme' : c.status === 'não_conforme' || c.status === 'nao_conforme' ? 'Nao Conforme' : 'A Verificar',
        sanitize(c.detail.length > 60 ? c.detail.substring(0, 60) + '...' : c.detail),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: [50, 50, 50], cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 25 },
        2: { cellWidth: CW - 60 },
      },
      margin: { left: ML, right: MR },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const val = data.cell.text[0];
          if (val === 'Conforme') data.cell.styles.textColor = [34, 197, 94];
          else if (val === 'Nao Conforme') data.cell.styles.textColor = [220, 38, 38];
          else data.cell.styles.textColor = [245, 158, 11];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    // Summary bar
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitize(`${conformeCount}/${total} conforme  |  ${ncCount} nao conforme  |  ${verifyCount} a verificar`), ML, y);
    y += 6;
  }

  // Issues (compact)
  if (analysis.issues?.length && analysis.issues[0] && y < 230) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.text('Problemas', ML, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 50, 50);
    for (const issue of analysis.issues.slice(0, 3)) {
      const lines = doc.splitTextToSize(sanitize(`- ${issue}`), CW);
      doc.text(lines[0], ML, y);
      y += 4;
    }
    y += 2;
  }

  // Conditions (compact)
  if (analysis.conditions?.length && analysis.conditions[0] && y < 245) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(146, 64, 14);
    doc.text('Condicoes de Aprovacao', ML, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 80, 40);
    for (const cond of analysis.conditions.slice(0, 3)) {
      const lines = doc.splitTextToSize(sanitize(`- ${cond}`), CW);
      doc.text(lines[0], ML, y);
      y += 4;
    }
    y += 2;
  }

  // Justification (short)
  if (analysis.justification && y < 255) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('Justificacao', ML, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const justLines = doc.splitTextToSize(sanitize(analysis.justification), CW);
    for (const line of justLines.slice(0, 4)) {
      doc.text(line, ML, y);
      y += 3.8;
    }
    if (justLines.length > 4) {
      doc.text('...', ML, y);
      y += 4;
    }
  }

  // Action box
  if (rec === 'rejected' || rec === 'approved_with_reservations') {
    if (y < 268) {
      y += 2;
      const actionColor: [number, number, number] = rec === 'rejected' ? [254, 242, 242] : [254, 252, 232];
      const actionBorder: [number, number, number] = rec === 'rejected' ? [220, 38, 38] : [245, 158, 11];
      const actionText = rec === 'rejected'
        ? 'REJEITADO — O empreiteiro deve submeter material alternativo conforme especificacoes do projecto.'
        : `APROVADO C/ RESERVAS — ${analysis.conditions?.length || 0} condicao(oes) a cumprir antes da aplicacao.`;

      doc.setFillColor(...actionColor);
      doc.roundedRect(ML, y, CW, 12, 2, 2, 'F');
      doc.setDrawColor(...actionBorder);
      doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, CW, 12, 2, 2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...actionBorder);
      const actionLines = doc.splitTextToSize(sanitize(actionText), CW - 8);
      doc.text(actionLines[0], ML + 4, y + 5);
      if (actionLines[1]) doc.text(actionLines[1], ML + 4, y + 9);
    }
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(fiscalCompany ? `${fiscalCompany} — Fiscalizacao de Obras` : 'Obrify — Fiscalizacao de Obras', ML, FOOTER_Y);
  doc.text('Pagina 1 de 1', PAGE_W - MR, FOOTER_Y, { align: 'right' });

  const filename = `PAM_Resumo_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
