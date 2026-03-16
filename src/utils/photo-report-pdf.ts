import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PhotoForExport {
  base64: string;
  description: string;
  location: string;
  sort_order: number;
}

export interface PhotoReportData {
  report_date: string;
  weather: string | null;
  workers_count: string | null;
  equipment: string | null;
  works_done: string | null;
  observations: string | null;
}

// Layout constants
const ML = 25;
const MR = 25;
const MT = 20;
const MB = 20;
const PAGE_W = 210;
const CW = PAGE_W - ML - MR; // 160mm
const PAGE_H = 297;
const FOOTER_Y = PAGE_H - MB + 7;
const MAX_Y = PAGE_H - MB - 5;
const HEADER_BOTTOM = 36;
const GREEN = '#4A7C59';

export function generatePhotoReportPDF(
  report: PhotoReportData,
  obraName: string,
  obraCidade: string,
  empreiteiro: string,
  fiscalName: string,
  fiscalCompany: string,
  photoImages: PhotoForExport[],
  logoBase64?: string | null,
  clientLogoBase64?: string | null
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const dateFormatted = new Date(report.report_date + 'T00:00:00').toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  let y = MT;
  let pageNum = 1;

  // ── Helpers ──
  const addHeader = () => {
    let titleX = ML;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', ML, MT, 20, 12);
        titleX = ML + 24;
      } catch { /* skip */ }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(33, 33, 33);
    doc.text('RELATÓRIO FOTOGRÁFICO DIÁRIO', titleX, MT + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('OBRIFY — Fiscalização Inteligente', PAGE_W - MR, MT + 5, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`${obraName}  |  ${dateFormatted}`, titleX, MT + 13);

    // Green separator line
    doc.setDrawColor(GREEN);
    doc.setLineWidth(0.8);
    doc.line(ML, MT + 17, PAGE_W - MR, MT + 17);
  };

  const addFooter = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(fiscalCompany ? `${fiscalCompany} — Fiscalização de Obras` : 'Fiscalização de Obras', ML, FOOTER_Y);
    doc.text(`Página ${pageNum}`, PAGE_W - MR, FOOTER_Y, { align: 'right' });
  };

  const newPage = () => {
    addFooter();
    doc.addPage();
    pageNum++;
    addHeader();
    y = HEADER_BOTTOM;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > MAX_Y) newPage();
  };

  // ── Page 1 ──
  addHeader();
  y = HEADER_BOTTOM;

  // Info table
  const fiscalDisplay = fiscalName ? `${fiscalName} — ${fiscalCompany}` : fiscalCompany;
  const tableBody = [
    ['Obra', obraName],
    ['Localização', obraCidade || '—'],
    ['Empreiteiro', empreiteiro || '—'],
    ['Fiscalização', fiscalDisplay],
    ['Data', dateFormatted],
    ['Condições Meteo', report.weather || '—'],
    ['Nº Trabalhadores', report.workers_count || '—'],
    ['Equipamentos', report.equipment || '—'],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] },
      1: { cellWidth: CW - 40 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Works done
  if (report.works_done) {
    ensureSpace(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text('Trabalhos Realizados', ML, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(report.works_done, CW);
    for (const line of lines) {
      ensureSpace(5);
      doc.text(line, ML, y);
      y += 4.5;
    }
    y += 4;
  }

  // ── Photos ──
  if (photoImages.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text('Registo Fotográfico', ML, y);
    y += 8;

    const colW = 75; // photo width
    const gap = CW - colW * 2; // gap between columns
    const photoH = 56; // photo height

    for (let i = 0; i < photoImages.length; i += 2) {
      // Each row: photo + description takes ~photoH + 20mm
      const rowHeight = photoH + 22;
      ensureSpace(rowHeight);

      for (let col = 0; col < 2; col++) {
        const idx = i + col;
        if (idx >= photoImages.length) break;
        const photo = photoImages[idx];
        const xBase = ML + col * (colW + gap);

        // Photo image
        try {
          doc.addImage(photo.base64, 'JPEG', xBase, y, colW, photoH);
        } catch {
          doc.setDrawColor(200, 200, 200);
          doc.rect(xBase, y, colW, photoH);
          doc.setFontSize(8);
          doc.text('Imagem indisponível', xBase + colW / 2, y + photoH / 2, { align: 'center' });
        }

        // Caption below photo
        let captionY = y + photoH + 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(33, 33, 33);
        doc.text(`Foto ${idx + 1}`, xBase, captionY);
        captionY += 3.5;

        if (photo.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 60);
          const descLines = doc.splitTextToSize(`Descrição: ${photo.description}`, colW);
          for (const dl of descLines.slice(0, 3)) {
            doc.text(dl, xBase, captionY);
            captionY += 3;
          }
        }

        if (photo.location) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(60, 60, 60);
          const locLines = doc.splitTextToSize(`Local: ${photo.location}`, colW);
          for (const ll of locLines.slice(0, 2)) {
            doc.text(ll, xBase, captionY);
            captionY += 3;
          }
        }
      }

      y += rowHeight;
    }
    y += 4;
  }

  // ── Observations ──
  if (report.observations) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text('Observações / Não-Conformidades', ML, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const obsLines = doc.splitTextToSize(report.observations, CW);
    for (const line of obsLines) {
      ensureSpace(5);
      doc.text(line, ML, y);
      y += 4.5;
    }
    y += 6;
  }

  // ── Signatures ──
  ensureSpace(35);
  doc.setDrawColor(GREEN);
  doc.setLineWidth(0.5);
  doc.line(ML, y, PAGE_W - MR, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.text('Assinaturas', ML, y);
  y += 10;

  const sigW = CW / 2 - 5;
  // Left: Fiscal
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(ML, y + 8, ML + sigW, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Técnico Fiscal', ML, y + 13);
  if (fiscalName) doc.text(`${fiscalName} — ${fiscalCompany}`, ML, y + 17);

  // Right: Director
  const rightX = ML + sigW + 10;
  doc.line(rightX, y + 8, rightX + sigW, y + 8);
  doc.text('Director de Obra', rightX, y + 13);
  doc.text('Empreiteiro', rightX, y + 17);

  // Final footer
  addFooter();

  // Update page numbers (total pages)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    // Overwrite page number with "Página X de Y"
    doc.setFillColor(255, 255, 255);
    doc.rect(PAGE_W - MR - 30, FOOTER_Y - 3, 30, 5, 'F');
    doc.text(`Página ${i} de ${totalPages}`, PAGE_W - MR, FOOTER_Y, { align: 'right' });
  }

  // Download
  const filename = `Relatorio_Fotografico_${report.report_date}.pdf`;
  doc.save(filename);
}
