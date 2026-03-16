import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, WidthType, AlignmentType, HeadingLevel, BorderStyle,
  Header, Footer, PageNumber, NumberFormat,
  ShadingType,
} from 'docx';
import type { PhotoForExport, PhotoReportData } from './photo-report-pdf';

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const PHOTO_WIDTH = 220;
const PHOTO_HEIGHT = 165;
const GREEN_HEX = '4A7C59';

export async function generatePhotoReportDOCX(
  report: PhotoReportData,
  obraName: string,
  obraCidade: string,
  empreiteiro: string,
  fiscalName: string,
  fiscalCompany: string,
  photoImages: PhotoForExport[],
  logoBase64?: string | null,
  clientLogoBase64?: string | null,
) {
  const dateFormatted = new Date(report.report_date + 'T00:00:00').toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const fiscalDisplay = fiscalName ? `${fiscalName} — ${fiscalCompany}` : fiscalCompany;

  // Header children
  const headerChildren: Paragraph[] = [];
  const headerRuns: (TextRun | ImageRun)[] = [];

  if (logoBase64) {
    try {
      headerRuns.push(new ImageRun({
        data: base64ToUint8Array(logoBase64),
        transformation: { width: 60, height: 36 },
        type: 'png',
      }));
      headerRuns.push(new TextRun({ text: '  ', size: 20 }));
    } catch { /* skip */ }
  }
  headerRuns.push(new TextRun({ text: 'RELATÓRIO FOTOGRÁFICO DIÁRIO', bold: true, size: 24 }));
  headerChildren.push(new Paragraph({ children: headerRuns }));
  if (clientLogoBase64) {
    try {
      headerChildren.push(new Paragraph({
        children: [new ImageRun({
          data: base64ToUint8Array(clientLogoBase64),
          transformation: { width: 100, height: 40 },
          type: 'png',
        })],
        alignment: AlignmentType.RIGHT,
      }));
    } catch { /* skip */ }
  }

  // Info table rows
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const infoData = [
    ['Obra', obraName],
    ['Localização', obraCidade || '—'],
    ['Empreiteiro', empreiteiro || '—'],
    ['Fiscalização', fiscalDisplay],
    ['Data', dateFormatted],
    ['Condições Meteo', report.weather || '—'],
    ['Nº Trabalhadores', report.workers_count || '—'],
    ['Equipamentos', report.equipment || '—'],
  ];

  const infoRows = infoData.map(([label, value]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 2500, type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })],
        }),
        new TableCell({
          width: { size: 7000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 18 })] })],
        }),
      ],
    })
  );

  const infoTable = new Table({
    rows: infoRows,
    width: { size: 9500, type: WidthType.DXA },
    borders: noBorders as any,
  });

  // Build content sections
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: `${obraName}  |  ${dateFormatted}`, size: 20, color: '333333' })],
    spacing: { after: 200 },
  }));

  children.push(infoTable);
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Works done
  if (report.works_done) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Trabalhos Realizados', bold: true, size: 22, color: '333333' })],
      spacing: { before: 200, after: 100 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: report.works_done, size: 18 })],
      spacing: { after: 200 },
    }));
  }

  // Photos
  if (photoImages.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Registo Fotográfico', bold: true, size: 22, color: '333333' })],
      spacing: { before: 200, after: 100 },
    }));

    // 2 photos per row in a table
    for (let i = 0; i < photoImages.length; i += 2) {
      const cells: TableCell[] = [];
      for (let col = 0; col < 2; col++) {
        const idx = i + col;
        if (idx < photoImages.length) {
          const photo = photoImages[idx];
          const cellChildren: Paragraph[] = [];
          try {
            cellChildren.push(new Paragraph({
              children: [new ImageRun({
                data: base64ToUint8Array(photo.base64),
                transformation: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT },
                type: 'jpg',
              })],
            }));
          } catch {
            cellChildren.push(new Paragraph({
              children: [new TextRun({ text: '[Imagem indisponível]', italics: true, size: 16 })],
            }));
          }
          cellChildren.push(new Paragraph({
            children: [new TextRun({ text: `Foto ${idx + 1}`, bold: true, size: 16 })],
            spacing: { before: 50 },
          }));
          if (photo.description) {
            cellChildren.push(new Paragraph({
              children: [new TextRun({ text: `Descrição: ${photo.description}`, size: 15 })],
            }));
          }
          if (photo.location) {
            cellChildren.push(new Paragraph({
              children: [new TextRun({ text: `Local: ${photo.location}`, size: 15 })],
            }));
          }
          cells.push(new TableCell({
            width: { size: 4750, type: WidthType.DXA },
            children: cellChildren,
          }));
        } else {
          cells.push(new TableCell({
            width: { size: 4750, type: WidthType.DXA },
            children: [new Paragraph('')],
          }));
        }
      }
      children.push(new Table({
        rows: [new TableRow({ children: cells })],
        width: { size: 9500, type: WidthType.DXA },
        borders: noBorders as any,
      }));
      children.push(new Paragraph({ spacing: { after: 100 } }));
    }
  }

  // Observations
  if (report.observations) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Observações / Não-Conformidades', bold: true, size: 22, color: '333333' })],
      spacing: { before: 200, after: 100 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: report.observations, size: 18 })],
      spacing: { after: 200 },
    }));
  }

  // Signatures
  children.push(new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { before: 400 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: GREEN_HEX, space: 1 } },
  }));

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: 'Assinaturas', bold: true, size: 20 })],
    spacing: { before: 200, after: 100 },
  }));

  const sigTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4750, type: WidthType.DXA },
            children: [
              new Paragraph({ spacing: { before: 400 } }),
              new Paragraph({
                children: [new TextRun({ text: '_________________________', size: 18 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: 'Técnico Fiscal', size: 16 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: fiscalDisplay, size: 14, color: '666666' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 4750, type: WidthType.DXA },
            children: [
              new Paragraph({ spacing: { before: 400 } }),
              new Paragraph({
                children: [new TextRun({ text: '_________________________', size: 18 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: 'Director de Obra', size: 16 })],
              }),
              new Paragraph({
                children: [new TextRun({ text: 'Empreiteiro', size: 14, color: '666666' })],
              }),
            ],
          }),
        ],
      }),
    ],
    width: { size: 9500, type: WidthType.DXA },
    borders: noBorders as any,
  });
  children.push(sigTable);

  // Build document
  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({ children: headerChildren }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${fiscalCompany || 'Fiscalização de Obras'}    `, size: 14, color: '888888' }),
              new TextRun({ text: 'Página ', size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '888888' }),
              new TextRun({ text: ' de ', size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '888888' }),
            ],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      properties: {
        page: {
          margin: { top: 1200, bottom: 1000, left: 1400, right: 1400 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Relatorio_Fotografico_${report.report_date}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
