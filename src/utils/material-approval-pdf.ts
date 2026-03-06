import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ApprovalData {
  pdm_name: string;
  material_category: string;
  status: string;
  final_decision?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
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

export function generateMaterialApprovalPDF(
  approval: ApprovalData,
  analysis: AnalysisData,
  obraName: string
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const w = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  const addPage = () => { doc.addPage(); y = 20; };
  const checkSpace = (needed: number) => { if (y + needed > 270) addPage(); };

  // Header
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, w, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Análise PAM', margin, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(obraName, margin, 27);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-PT')} às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, margin, 35);

  // OBRIFY branding top-right
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('OBRIFY', w - margin, 18, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Fiscalização Inteligente', w - margin, 25, { align: 'right' });

  y = 50;

  // Status badge
  const status = approval.final_decision || approval.status || analysis.recommendation || 'pending';
  const statusLabel = status === 'approved' ? 'APROVADO' :
    status === 'approved_with_reservations' ? 'APROVADO COM RESERVAS' :
    status === 'rejected' ? 'REJEITADO' : 'PENDENTE';
  const statusColor: [number, number, number] = status === 'approved' ? [22, 163, 74] :
    status === 'rejected' ? [220, 38, 38] :
    status === 'approved_with_reservations' ? [217, 119, 6] : [107, 114, 128];

  doc.setFillColor(...statusColor);
  const badgeWidth = doc.getTextWidth(statusLabel) * 0.6 + 16;
  doc.roundedRect(margin, y, badgeWidth, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, margin + 4, y + 7);
  y += 18;

  // Info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Categoria: ${approval.material_category}`, margin, y);
  y += 6;
  doc.text(`Ficheiro PAM: ${approval.pdm_name}`, margin, y);
  y += 6;
  doc.text(`Data de submissão: ${new Date(approval.created_at).toLocaleDateString('pt-PT')}`, margin, y);
  y += 12;

  // Material Proposed
  if (analysis.material_proposed) {
    checkSpace(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Material Proposto', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    if (analysis.material_proposed.name) { doc.text(`Nome: ${analysis.material_proposed.name}`, margin + 4, y); y += 5; }
    if (analysis.material_proposed.manufacturer) { doc.text(`Fabricante: ${analysis.material_proposed.manufacturer}`, margin + 4, y); y += 5; }
    if (analysis.material_proposed.model) { doc.text(`Modelo: ${analysis.material_proposed.model}`, margin + 4, y); y += 5; }
    if (analysis.material_proposed.specifications?.length) {
      doc.text(`Especificações: ${analysis.material_proposed.specifications.join(', ')}`, margin + 4, y, { maxWidth: w - margin * 2 - 4 });
      y += 8;
    }
    y += 4;
  }

  // Material Specified
  if (analysis.material_specified) {
    checkSpace(25);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Especificação do Projecto', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    if (analysis.material_specified.description) {
      const lines = doc.splitTextToSize(analysis.material_specified.description, w - margin * 2 - 4);
      doc.text(lines, margin + 4, y);
      y += lines.length * 5 + 2;
    }
    if (analysis.material_specified.requirements?.length) {
      analysis.material_specified.requirements.forEach(r => {
        checkSpace(6);
        doc.text(`• ${r}`, margin + 8, y);
        y += 5;
      });
    }
    y += 4;
  }

  // Compliance Checks table
  if (analysis.compliance_checks?.length) {
    checkSpace(20);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Verificações de Conformidade', margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Aspecto', 'Estado', 'Detalhe']],
      body: analysis.compliance_checks.map(c => [
        c.aspect,
        c.status === 'conforme' ? '✓ Conforme' : c.status === 'não_conforme' ? '✗ Não conforme' : '? A verificar',
        c.detail,
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      bodyStyles: { textColor: [71, 85, 105] },
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 30 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Issues
  if (analysis.issues?.length && analysis.issues[0]) {
    checkSpace(20);
    doc.setFillColor(254, 226, 226);
    const issueHeight = analysis.issues.length * 6 + 12;
    doc.roundedRect(margin, y, w - margin * 2, issueHeight, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text('Problemas Identificados', margin + 4, y + 7);
    y += 12;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    analysis.issues.forEach(issue => {
      doc.text(`• ${issue}`, margin + 6, y);
      y += 6;
    });
    y += 4;
  }

  // Conditions
  if (analysis.conditions?.length && analysis.conditions[0]) {
    checkSpace(20);
    doc.setFillColor(254, 243, 199);
    const condHeight = analysis.conditions.length * 6 + 12;
    doc.roundedRect(margin, y, w - margin * 2, condHeight, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('Condições de Aprovação', margin + 4, y + 7);
    y += 12;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    analysis.conditions.forEach(c => {
      doc.text(`• ${c}`, margin + 6, y);
      y += 6;
    });
    y += 4;
  }

  // Justification
  if (analysis.justification) {
    checkSpace(20);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Justificação', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(analysis.justification, w - margin * 2 - 4);
    doc.text(lines, margin + 4, y);
    y += lines.length * 5 + 6;
  }

  // Norms Referenced
  if (analysis.norms_referenced?.length) {
    checkSpace(15);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Normas Referenciadas', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(analysis.norms_referenced.join(', '), margin + 4, y, { maxWidth: w - margin * 2 - 4 });
    y += 8;
  }

  // Reviewer notes / Final decision
  if (approval.reviewer_notes || approval.final_decision) {
    checkSpace(20);
    doc.setFillColor(241, 245, 249);
    const boxH = (approval.reviewer_notes ? 12 : 0) + 14;
    doc.roundedRect(margin, y, w - margin * 2, boxH, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    const decLabel = approval.final_decision === 'approved' ? 'Aprovado' :
      approval.final_decision === 'approved_with_reservations' ? 'Aprovado c/ Reservas' :
      approval.final_decision === 'rejected' ? 'Rejeitado' : '—';
    doc.text(`Decisão Final: ${decLabel}`, margin + 4, y + 7);
    if (approval.decided_by) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Por: ${approval.decided_by} em ${approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : ''}`, margin + 4, y + 13);
    }
    if (approval.reviewer_notes) {
      doc.setFontSize(9);
      doc.text(`Notas: ${approval.reviewer_notes}`, margin + 4, y + 19);
    }
    y += boxH + 6;
  }

  // Confidence
  if (analysis.confidence) {
    checkSpace(15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Nível de Confiança: ${analysis.confidence}%`, margin, y);
    y += 5;
    // Draw bar
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin, y, w - margin * 2, 4, 2, 2, 'F');
    doc.setFillColor(...statusColor);
    doc.roundedRect(margin, y, (w - margin * 2) * (analysis.confidence / 100), 4, 2, 2, 'F');
    y += 10;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 282, w, 15, 'F');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text('OBRIFY — Fiscalização Inteligente de Obras', margin, 289);
    doc.text(`Página ${i} de ${pageCount}`, w - margin, 289, { align: 'right' });
  }

  const filename = `PAM_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
