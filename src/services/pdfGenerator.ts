import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

// Page configuration (A4)
const PAGE_WIDTH = 210;  // mm
const PAGE_HEIGHT = 297; // mm
const MARGIN = 20;       // mm (~2cm)
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

// Colors (RGB)
const COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  text: [31, 41, 55] as [number, number, number],
  secondary: [107, 114, 128] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  warning: [234, 179, 8] as [number, number, number],
  lightGray: [229, 231, 235] as [number, number, number],
};

// Status labels
const STATUS_LABELS: Record<string, string> = {
  'OPEN': 'Aberta',
  'IN_PROGRESS': 'Em Resolução',
  'RESOLVED': 'A Verificar',
  'CLOSED': 'Fechada',
};

const SEVERITY_LABELS: Record<string, string> = {
  'critical': 'Crítico',
  'high': 'Importante',
  'medium': 'Menor',
};

const RESULT_LABELS: Record<string, string> = {
  'OK': 'Conforme',
  'NC': 'Não Conforme',
  'OBS': 'Observação',
  'NA': 'N/A',
};

const RESULT_CONFORM_LABELS: Record<string, string> = {
  'OK': 'Sim',
  'NC': 'Não',
  'OBS': 'OBS',
  'NA': 'N/A',
};

const CATEGORY_LABELS: Record<string, string> = {
  'structure': 'Estrutura',
  'finishes': 'Acabamentos',
  'installations': 'Instalações',
  'safety': 'Segurança',
};

/**
 * Add header with logo placeholder and title
 */
function addHeader(doc: jsPDF, title: string): number {
  const startY = MARGIN;
  
  // Logo placeholder (gray rectangle)
  doc.setFillColor(...COLORS.lightGray);
  doc.rect(MARGIN, startY, 30, 15, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.text('LOGO', MARGIN + 15, startY + 9, { align: 'center' });
  
  // Title
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PAGE_WIDTH - MARGIN, startY + 10, { align: 'right' });
  
  // Separator line
  const lineY = startY + 20;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, lineY, PAGE_WIDTH - MARGIN, lineY);
  
  return lineY + 5;
}

/**
 * Add footer with page number and generation date
 */
function addFooter(doc: jsPDF, pageNum: number, totalPages: number): void {
  const footerY = PAGE_HEIGHT - 10;
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.setFont('helvetica', 'normal');
  
  // Page number
  doc.text(`Página ${pageNum} de ${totalPages}`, MARGIN, footerY);
  
  // Generation date
  const dateStr = `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}`;
  doc.text(dateStr, PAGE_WIDTH - MARGIN, footerY, { align: 'right' });
}

/**
 * Load image from Supabase Storage and convert to base64
 */
async function loadImageFromStorage(filePath: string): Promise<string | null> {
  try {
    const { data } = supabase.storage.from('captures').getPublicUrl(filePath);
    
    const response = await fetch(data.publicUrl);
    if (!response.ok) return null;
    
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Add a section title
 */
function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN, y);
  
  return y + 6;
}

/**
 * Add info row (label: value)
 */
function addInfoRow(doc: jsPDF, label: string, value: string, y: number): number {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.secondary);
  doc.text(`${label}:`, MARGIN, y);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(value || '-', MARGIN + 35, y);
  
  return y + 5;
}

/**
 * Generate reference number based on year and sequential order
 */
function generateReference(createdAt: string, inspectionNumber: number): string {
  const year = new Date(createdAt).getFullYear();
  return `INS-${year}-${String(inspectionNumber).padStart(3, '0')}`;
}

/**
 * Determine inspection conclusion based on NCs
 */
function getConclusion(ncs: { severity: string }[]): 'approved' | 'conditional' | 'rejected' {
  if (!ncs || ncs.length === 0) return 'approved';
  const hasCritical = ncs.some(nc => nc.severity === 'critical');
  if (hasCritical) return 'rejected';
  return 'conditional';
}

/**
 * Generate Inspection Report PDF with complete structure
 */
export async function generateInspectionReport(inspectionId: string): Promise<Blob> {
  // Fetch inspection data with all relations
  const { data: inspection, error: inspectionError } = await supabase
    .from('inspections')
    .select(`
      *,
      sites!inspections_site_id_fkey(id, name, address),
      inspection_templates!inspections_template_id_fkey(id, name, category),
      floors!inspections_floor_id_fkey(id, name),
      areas!inspections_area_id_fkey(id, name),
      capture_points!inspections_capture_point_id_fkey(id, code)
    `)
    .eq('id', inspectionId)
    .single();

  if (inspectionError || !inspection) {
    throw new Error('Inspection not found');
  }

  // Get inspection number for reference (count inspections created before this one in same year)
  const inspectionYear = new Date(inspection.created_at).getFullYear();
  const { count: inspectionNumber } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${inspectionYear}-01-01`)
    .lte('created_at', inspection.created_at);

  // Fetch inspection items with template details
  const { data: items } = await supabase
    .from('inspection_items')
    .select(`
      *,
      inspection_template_items!inspection_items_template_item_id_fkey(
        id, title, is_required, section, order_index
      )
    `)
    .eq('inspection_id', inspectionId)
    .order('created_at');

  // Sort items by template order
  const sortedItems = items?.sort((a, b) => {
    const orderA = (a.inspection_template_items as { order_index?: number })?.order_index || 0;
    const orderB = (b.inspection_template_items as { order_index?: number })?.order_index || 0;
    return orderA - orderB;
  }) || [];

  // Fetch inspector profile
  const { data: inspector } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', inspection.created_by)
    .single();

  // Fetch evidence photos with item references
  const { data: evidenceLinks } = await supabase
    .from('evidence_links')
    .select(`
      *,
      captures!evidence_links_capture_id_fkey(id, file_path)
    `)
    .eq('inspection_id', inspectionId)
    .limit(24);

  // Fetch nonconformities for this inspection
  const { data: ncs } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at');

  // Initialize PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // === HEADER ===
  let currentY = MARGIN;
  
  // Logo placeholder
  doc.setFillColor(...COLORS.lightGray);
  doc.rect(MARGIN, currentY, 30, 15, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.text('LOGO', MARGIN + 15, currentY + 9, { align: 'center' });
  
  // Title
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE INSPEÇÃO', PAGE_WIDTH / 2, currentY + 7, { align: 'center' });
  
  // Reference and date
  const reference = generateReference(inspection.created_at, inspectionNumber || 1);
  const reportDate = format(new Date(), 'dd/MM/yyyy', { locale: pt });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(`Ref: ${reference}`, PAGE_WIDTH - MARGIN, currentY + 5, { align: 'right' });
  doc.text(`Data: ${reportDate}`, PAGE_WIDTH - MARGIN, currentY + 10, { align: 'right' });
  
  // Separator line
  currentY += 20;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, currentY, PAGE_WIDTH - MARGIN, currentY);
  currentY += 8;

  // === GENERAL DATA ===
  currentY = addSectionTitle(doc, 'DADOS GERAIS', currentY);
  
  const siteName = (inspection.sites as { name: string })?.name || '-';
  const siteAddress = (inspection.sites as { address?: string })?.address || '-';
  const templateName = (inspection.inspection_templates as { name: string })?.name || '-';
  const templateCategory = (inspection.inspection_templates as { category?: string })?.category;
  const floorName = (inspection.floors as { name?: string })?.name;
  const areaName = (inspection.areas as { name?: string })?.name;
  const pointCode = (inspection.capture_points as { code?: string })?.code;
  
  let location = '';
  if (floorName) location += floorName;
  if (areaName) location += ` > ${areaName}`;
  if (pointCode) location += ` > ${pointCode}`;
  
  const inspectionDate = inspection.scheduled_at 
    ? format(new Date(inspection.scheduled_at), "dd 'de' MMMM 'de' yyyy", { locale: pt })
    : format(new Date(inspection.created_at), "dd 'de' MMMM 'de' yyyy", { locale: pt });

  currentY = addInfoRow(doc, 'Obra', siteName, currentY);
  currentY = addInfoRow(doc, 'Morada', siteAddress, currentY);
  if (location) {
    currentY = addInfoRow(doc, 'Local', location, currentY);
  }
  currentY = addInfoRow(doc, 'Inspetor', inspector?.full_name || '-', currentY);
  currentY = addInfoRow(doc, 'Data da Inspeção', inspectionDate, currentY);
  currentY += 5;

  // === OBJECTIVE ===
  currentY = addSectionTitle(doc, 'OBJECTIVO', currentY);
  
  const categoryLabel = templateCategory ? CATEGORY_LABELS[templateCategory] || templateCategory : 'construção';
  const objectiveText = `Esta inspeção teve como objectivo a verificação das condições de ${categoryLabel} conforme o checklist "${templateName}".`;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  const objectiveLines = doc.splitTextToSize(objectiveText, CONTENT_WIDTH);
  doc.text(objectiveLines, MARGIN, currentY);
  currentY += objectiveLines.length * 5 + 5;

  // === VERIFICATION TABLE ===
  currentY = addSectionTitle(doc, 'TABELA DE VERIFICAÇÕES', currentY);

  const tableData = sortedItems.map((item, index) => {
    const templateItem = item.inspection_template_items as { title: string; section?: string };
    return [
      String(index + 1),
      templateItem?.title || '-',
      RESULT_CONFORM_LABELS[item.result || ''] || '-',
      item.notes || '-',
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Item', 'Conforme', 'Observações']],
    body: tableData,
    margin: { left: MARGIN, right: MARGIN },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: COLORS.text,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 70 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 'auto' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    didParseCell: (data) => {
      // Color code conform column
      if (data.section === 'body' && data.column.index === 2) {
        const value = data.cell.raw as string;
        if (value === 'Sim') {
          data.cell.styles.textColor = COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        } else if (value === 'Não') {
          data.cell.styles.textColor = COLORS.danger;
          data.cell.styles.fontStyle = 'bold';
        } else if (value === 'OBS') {
          data.cell.styles.textColor = COLORS.warning;
        }
      }
    },
  });

  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // === PHOTO REGISTRY ===
  const photosWithContext = evidenceLinks?.map(link => {
    const itemIndex = sortedItems.findIndex(item => item.id === link.inspection_item_id);
    return {
      ...link,
      caption: link.inspection_item_id && itemIndex >= 0 
        ? `Item #${itemIndex + 1}` 
        : 'Geral',
    };
  }).slice(0, 18) || [];

  if (photosWithContext.length > 0) {
    // Check if we need a new page
    if (currentY > PAGE_HEIGHT - 80) {
      doc.addPage();
      currentY = MARGIN;
    }

    currentY = addSectionTitle(doc, 'REGISTO FOTOGRÁFICO', currentY);
    
    const photoWidth = 50;
    const photoHeight = 40;
    const photosPerRow = 3;
    const photosPerPage = 6;
    let photoCount = 0;
    let photoX = MARGIN;
    let photoY = currentY;
    
    for (let i = 0; i < photosWithContext.length; i++) {
      const photo = photosWithContext[i];
      const capture = photo.captures as { file_path?: string };
      
      if (capture?.file_path) {
        // Check for new page (max 6 photos per page)
        if (photoCount > 0 && photoCount % photosPerPage === 0) {
          doc.addPage();
          photoX = MARGIN;
          photoY = MARGIN;
          currentY = addSectionTitle(doc, 'REGISTO FOTOGRÁFICO (cont.)', MARGIN);
          photoY = currentY;
        }

        const imageData = await loadImageFromStorage(capture.file_path);
        if (imageData) {
          try {
            doc.addImage(imageData, 'JPEG', photoX, photoY, photoWidth, photoHeight);
          } catch {
            doc.setFillColor(...COLORS.lightGray);
            doc.rect(photoX, photoY, photoWidth, photoHeight, 'F');
          }
        } else {
          doc.setFillColor(...COLORS.lightGray);
          doc.rect(photoX, photoY, photoWidth, photoHeight, 'F');
        }
        
        // Photo caption
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.secondary);
        doc.text(`Foto ${i + 1}: ${photo.caption}`, photoX + photoWidth / 2, photoY + photoHeight + 4, { align: 'center' });
        
        photoX += photoWidth + 7;
        photoCount++;
        
        if (photoCount % photosPerRow === 0) {
          photoX = MARGIN;
          photoY += photoHeight + 12;
        }
      }
    }
    
    // Update currentY based on photos rendered
    const rowsRendered = Math.ceil(Math.min(photosPerPage, photosWithContext.length) / photosPerRow);
    currentY = photoY + (rowsRendered > 0 ? photoHeight + 15 : 0);
  }

  // === OPEN NON-CONFORMITIES ===
  if (ncs && ncs.length > 0) {
    if (currentY > PAGE_HEIGHT - 50) {
      doc.addPage();
      currentY = MARGIN;
    }

    currentY = addSectionTitle(doc, 'NÃO-CONFORMIDADES ABERTAS', currentY);

    const ncData = ncs.map((nc, index) => [
      String(index + 1).padStart(3, '0'),
      (nc.description || nc.title || '-').slice(0, 50) + ((nc.description || nc.title || '').length > 50 ? '...' : ''),
      SEVERITY_LABELS[nc.severity] || nc.severity,
      STATUS_LABELS[nc.status] || nc.status,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['NC', 'Descrição', 'Severidade', 'Estado']],
      body: ncData,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: COLORS.danger,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
      },
    });

    currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // === CONCLUSION ===
  if (currentY > PAGE_HEIGHT - 60) {
    doc.addPage();
    currentY = MARGIN;
  }

  currentY = addSectionTitle(doc, 'CONCLUSÃO', currentY);
  
  const conclusion = getConclusion(ncs || []);
  const boxHeight = 12;
  
  // Draw conclusion boxes
  const boxWidth = (CONTENT_WIDTH - 10) / 3;
  const boxes = [
    { label: 'APROVADO', selected: conclusion === 'approved', color: COLORS.success },
    { label: 'CONDICIONADO', selected: conclusion === 'conditional', color: COLORS.warning },
    { label: 'REPROVADO', selected: conclusion === 'rejected', color: COLORS.danger },
  ];

  boxes.forEach((box, index) => {
    const boxX = MARGIN + (boxWidth + 5) * index;
    
    if (box.selected) {
      doc.setFillColor(...box.color);
      doc.roundedRect(boxX, currentY, boxWidth, boxHeight, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setDrawColor(...COLORS.lightGray);
      doc.setLineWidth(0.5);
      doc.roundedRect(boxX, currentY, boxWidth, boxHeight, 2, 2, 'S');
      doc.setTextColor(...COLORS.secondary);
    }
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const checkMark = box.selected ? '☑ ' : '☐ ';
    doc.text(checkMark + box.label, boxX + boxWidth / 2, currentY + boxHeight / 2 + 1, { align: 'center' });
  });

  currentY += boxHeight + 15;

  // === SIGNATURE ===
  if (currentY > PAGE_HEIGHT - 45) {
    doc.addPage();
    currentY = MARGIN;
  }

  currentY = addSectionTitle(doc, 'ASSINATURA', currentY);
  currentY += 3;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  
  doc.text(`Inspetor: ${inspector?.full_name || '-'}`, MARGIN, currentY);
  currentY += 5;
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: pt })}`, MARGIN, currentY);
  currentY += 10;
  
  // Signature line
  doc.setDrawColor(...COLORS.text);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, currentY, MARGIN + 70, currentY);
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.text('(Assinatura)', MARGIN + 35, currentY + 4, { align: 'center' });

  // === FOOTERS ===
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Generate Non-Conformity Report PDF
 */
export async function generateNCReport(ncId: string): Promise<Blob> {
  // Fetch NC data
  const { data: nc, error: ncError } = await supabase
    .from('nonconformities')
    .select(`
      *,
      sites!nonconformities_site_id_fkey(id, name, address),
      inspections!nonconformities_inspection_id_fkey(
        id,
        inspection_templates!inspections_template_id_fkey(id, name)
      )
    `)
    .eq('id', ncId)
    .single();

  if (ncError || !nc) {
    throw new Error('Non-conformity not found');
  }

  // Fetch evidence photos
  const { data: evidence } = await supabase
    .from('nonconformity_evidence')
    .select('*')
    .eq('nonconformity_id', ncId)
    .limit(6);

  // Fetch status history
  const { data: history } = await supabase
    .from('nonconformity_status_history')
    .select('*')
    .eq('nonconformity_id', ncId)
    .order('created_at', { ascending: true });

  // Fetch creator profile
  const { data: creator } = nc.created_by
    ? await supabase.from('profiles').select('full_name').eq('user_id', nc.created_by).single()
    : { data: null };

  // Fetch history user names
  const historyUserIds = history?.map(h => h.changed_by).filter(Boolean) as string[] || [];
  const { data: historyUsers } = historyUserIds.length > 0
    ? await supabase.from('profiles').select('user_id, full_name').in('user_id', historyUserIds)
    : { data: [] };

  const userNameMap = new Map<string, string | null>(historyUsers?.map(u => [u.user_id, u.full_name] as [string, string | null]) || []);

  // Initialize PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let currentY = addHeader(doc, 'FICHA DE NÃO-CONFORMIDADE');
  currentY += 5;

  // NC ID and status badge
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text(`NC-${ncId.slice(0, 8).toUpperCase()}`, MARGIN, currentY);

  // Status badge
  const statusLabel = STATUS_LABELS[nc.status] || nc.status;
  const statusWidth = doc.getTextWidth(statusLabel) + 10;
  doc.setFillColor(...(nc.status === 'CLOSED' ? COLORS.success : nc.status === 'OPEN' ? COLORS.danger : COLORS.warning));
  doc.roundedRect(PAGE_WIDTH - MARGIN - statusWidth, currentY - 5, statusWidth, 7, 1, 1, 'F');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, PAGE_WIDTH - MARGIN - statusWidth / 2, currentY - 1, { align: 'center' });

  currentY += 5;

  // Severity badge
  const severityLabel = SEVERITY_LABELS[nc.severity] || nc.severity;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const severityColor = nc.severity === 'critical' ? COLORS.danger : nc.severity === 'high' ? COLORS.warning : COLORS.secondary;
  doc.setTextColor(...severityColor);
  doc.text(`Severidade: ${severityLabel.toUpperCase()}`, MARGIN, currentY);

  currentY += 10;

  // General info
  currentY = addSectionTitle(doc, 'DADOS GERAIS', currentY);
  
  const siteName = (nc.sites as { name: string })?.name || '-';
  const inspectionData = nc.inspections as { inspection_templates?: { name: string } };
  const templateName = inspectionData?.inspection_templates?.name || '-';
  
  currentY = addInfoRow(doc, 'Obra', siteName, currentY);
  currentY = addInfoRow(doc, 'Inspeção', templateName, currentY);
  currentY = addInfoRow(doc, 'Criado por', creator?.full_name || '-', currentY);
  currentY = addInfoRow(doc, 'Data Criação', format(new Date(nc.created_at), 'dd/MM/yyyy', { locale: pt }), currentY);
  if (nc.due_date) {
    currentY = addInfoRow(doc, 'Prazo', format(new Date(nc.due_date), 'dd/MM/yyyy', { locale: pt }), currentY);
  }
  if (nc.responsible) {
    currentY = addInfoRow(doc, 'Responsável', nc.responsible, currentY);
  }
  if (nc.standard_violated) {
    currentY = addInfoRow(doc, 'Norma Violada', nc.standard_violated, currentY);
  }

  currentY += 5;

  // Description
  if (nc.description) {
    currentY = addSectionTitle(doc, 'DESCRIÇÃO DO PROBLEMA', currentY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    
    const descriptionLines = doc.splitTextToSize(nc.description, CONTENT_WIDTH);
    doc.text(descriptionLines, MARGIN, currentY);
    currentY += descriptionLines.length * 4 + 5;
  }

  // Corrective action
  if (nc.corrective_action) {
    currentY = addSectionTitle(doc, 'AÇÃO CORRETIVA', currentY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    
    const actionLines = doc.splitTextToSize(nc.corrective_action, CONTENT_WIDTH);
    doc.text(actionLines, MARGIN, currentY);
    currentY += actionLines.length * 4 + 5;
  }

  // Evidence photos
  if (evidence && evidence.length > 0) {
    if (currentY > PAGE_HEIGHT - 50) {
      doc.addPage();
      currentY = MARGIN;
    }

    currentY = addSectionTitle(doc, 'EVIDÊNCIAS FOTOGRÁFICAS', currentY);
    
    const photoWidth = 50;
    const photoHeight = 40;
    let photoX = MARGIN;
    
    for (let i = 0; i < Math.min(evidence.length, 4); i++) {
      const imageData = await loadImageFromStorage(evidence[i].file_path);
      if (imageData) {
        try {
          doc.addImage(imageData, 'JPEG', photoX, currentY, photoWidth, photoHeight);
        } catch {
          doc.setFillColor(...COLORS.lightGray);
          doc.rect(photoX, currentY, photoWidth, photoHeight, 'F');
        }
      } else {
        doc.setFillColor(...COLORS.lightGray);
        doc.rect(photoX, currentY, photoWidth, photoHeight, 'F');
      }
      photoX += photoWidth + 5;
    }
    currentY += photoHeight + 10;
  }

  // Status history
  if (history && history.length > 0) {
    if (currentY > PAGE_HEIGHT - 40) {
      doc.addPage();
      currentY = MARGIN;
    }

    currentY = addSectionTitle(doc, 'HISTÓRICO DE ALTERAÇÕES', currentY);
    
    for (const entry of history) {
      const date = format(new Date(entry.created_at!), "dd/MM/yyyy HH:mm", { locale: pt });
      const userName = entry.changed_by ? userNameMap.get(entry.changed_by) || 'Utilizador' : 'Sistema';
      const statusLabel = STATUS_LABELS[entry.new_status] || entry.new_status;
      
      // Timeline dot
      doc.setFillColor(...COLORS.primary);
      doc.circle(MARGIN + 2, currentY - 1, 1.5, 'F');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.text);
      doc.text(`${date} - ${statusLabel} (${userName})`, MARGIN + 6, currentY);
      
      currentY += 4;
      
      if (entry.notes) {
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.secondary);
        doc.text(`"${entry.notes}"`, MARGIN + 8, currentY);
        currentY += 4;
      }
      
      currentY += 2;
    }
  }

  // Add footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Generate Open NCs Report PDF - List of all open NCs for a site
 */
export async function generateOpenNCsReport(siteId: string): Promise<Blob> {
  // Fetch site data
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, name, address')
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    throw new Error('Site not found');
  }

  // Fetch open NCs (not CLOSED)
  const { data: ncs, error: ncsError } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('site_id', siteId)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false });

  if (ncsError) throw ncsError;

  // Initialize PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let currentY = addHeader(doc, 'LISTA DE NÃO-CONFORMIDADES ABERTAS');
  currentY += 3;

  // Site and date info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(`Obra: ${site.name}`, MARGIN, currentY);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: pt })}`, PAGE_WIDTH - MARGIN, currentY, { align: 'right' });
  currentY += 10;

  // Summary
  currentY = addSectionTitle(doc, 'RESUMO', currentY);
  
  const totalNCs = ncs?.length || 0;
  const criticalCount = ncs?.filter(nc => nc.severity === 'critical').length || 0;
  const highCount = ncs?.filter(nc => nc.severity === 'high').length || 0;
  const mediumCount = ncs?.filter(nc => nc.severity === 'medium').length || 0;

  currentY = addInfoRow(doc, 'Total de NCs Abertas', String(totalNCs), currentY);
  currentY = addInfoRow(doc, 'Distribuição', `Críticas: ${criticalCount} | Importantes: ${highCount} | Menores: ${mediumCount}`, currentY);
  currentY += 8;

  // Detailed list
  if (ncs && ncs.length > 0) {
    currentY = addSectionTitle(doc, 'LISTA DETALHADA', currentY);

    const ncData = ncs.map((nc, index) => [
      String(index + 1).padStart(3, '0'),
      (nc.description || nc.title || '-').slice(0, 45) + ((nc.description || nc.title || '').length > 45 ? '...' : ''),
      SEVERITY_LABELS[nc.severity] || nc.severity,
      nc.due_date ? format(new Date(nc.due_date), 'dd/MM', { locale: pt }) : '-',
      nc.responsible || '-',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['NC', 'Descrição', 'Severidade', 'Prazo', 'Responsável']],
      body: ncData,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: COLORS.danger,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 22 },
        3: { cellWidth: 18 },
        4: { cellWidth: 35 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const value = data.cell.raw as string;
          if (value === 'Crítico') {
            data.cell.styles.textColor = COLORS.danger;
            data.cell.styles.fontStyle = 'bold';
          } else if (value === 'Importante') {
            data.cell.styles.textColor = COLORS.warning;
          }
        }
      },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.secondary);
    doc.text('Não existem não-conformidades abertas para esta obra.', MARGIN, currentY);
  }

  // Add footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Generate NC History Report PDF - Closed NCs in a period
 */
export async function generateNCHistoryReport(
  siteId: string,
  period: { start: Date; end: Date }
): Promise<Blob> {
  // Fetch site data
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, name, address')
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    throw new Error('Site not found');
  }

  // Fetch NCs created in period
  const { data: allNCs } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('site_id', siteId)
    .gte('created_at', period.start.toISOString())
    .lte('created_at', period.end.toISOString())
    .order('created_at', { ascending: false });

  // Fetch closed NCs in period (via status history)
  const { data: closedNCs } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'CLOSED')
    .gte('updated_at', period.start.toISOString())
    .lte('updated_at', period.end.toISOString())
    .order('updated_at', { ascending: false });

  // Initialize PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let currentY = addHeader(doc, 'HISTÓRICO DE NÃO-CONFORMIDADES');
  currentY += 3;

  // Site info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(`Obra: ${site.name}`, MARGIN, currentY);
  currentY += 5;
  
  doc.setTextColor(...COLORS.secondary);
  const periodStr = `Período: ${format(period.start, 'dd/MM/yyyy')} a ${format(period.end, 'dd/MM/yyyy')}`;
  doc.text(periodStr, MARGIN, currentY);
  currentY += 10;

  // Period summary
  currentY = addSectionTitle(doc, 'RESUMO DO PERÍODO', currentY);
  
  const openedCount = allNCs?.length || 0;
  const closedCount = closedNCs?.length || 0;
  const resolutionRate = openedCount > 0 ? Math.round((closedCount / openedCount) * 100) : 0;

  const summaryData: string[][] = [
    ['NCs Abertas no Período', String(openedCount)],
    ['NCs Fechadas no Período', String(closedCount)],
    ['Taxa de Resolução', `${resolutionRate}%`],
  ];

  autoTable(doc, {
    startY: currentY,
    body: summaryData,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    bodyStyles: {
      fontSize: 10,
      textColor: COLORS.text,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
  });

  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Closed NCs details
  if (closedNCs && closedNCs.length > 0) {
    currentY = addSectionTitle(doc, 'NÃO-CONFORMIDADES FECHADAS', currentY);

    const ncData = closedNCs.map((nc, index) => {
      const createdDate = new Date(nc.created_at);
      const closedDate = new Date(nc.updated_at);
      const daysDiff = Math.round((closedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return [
        String(index + 1).padStart(3, '0'),
        (nc.description || nc.title || '-').slice(0, 40) + ((nc.description || nc.title || '').length > 40 ? '...' : ''),
        format(createdDate, 'dd/MM', { locale: pt }),
        format(closedDate, 'dd/MM', { locale: pt }),
        `${daysDiff} dias`,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['NC', 'Descrição', 'Aberta', 'Fechada', 'Tempo']],
      body: ncData,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: COLORS.success,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 22 },
      },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.secondary);
    doc.text('Não foram fechadas não-conformidades neste período.', MARGIN, currentY);
  }

  // Add footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Generate Measurement Report (Auto de Medição) PDF
 */
export async function generateMeasurementAuto(
  siteId: string, 
  period: { start: Date; end: Date }
): Promise<Blob> {
  // Fetch site data
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select(`
      *,
      organizations!sites_org_id_fkey(id, name)
    `)
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    throw new Error('Site not found');
  }

  // Fetch inspections in period
  const { data: inspections } = await supabase
    .from('inspections')
    .select(`
      *,
      inspection_templates!inspections_template_id_fkey(id, name)
    `)
    .eq('site_id', siteId)
    .gte('created_at', period.start.toISOString())
    .lte('created_at', period.end.toISOString())
    .order('created_at');

  // Get all inspection items for these inspections
  const inspectionIds = inspections?.map(i => i.id) || [];
  const { data: allItems } = inspectionIds.length > 0
    ? await supabase.from('inspection_items').select('*').in('inspection_id', inspectionIds)
    : { data: [] };

  // Fetch NCs in period
  const { data: ncs } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('site_id', siteId)
    .gte('created_at', period.start.toISOString())
    .lte('created_at', period.end.toISOString())
    .order('created_at');

  // Initialize PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let currentY = addHeader(doc, 'AUTO DE MEDIÇÃO');
  currentY += 3;

  // Period info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.secondary);
  const periodStr = `Período: ${format(period.start, 'dd/MM/yyyy')} a ${format(period.end, 'dd/MM/yyyy')}`;
  doc.text(periodStr, PAGE_WIDTH / 2, currentY, { align: 'center' });
  currentY += 10;

  // Identification section
  currentY = addSectionTitle(doc, 'IDENTIFICAÇÃO', currentY);
  
  currentY = addInfoRow(doc, 'Obra', site.name, currentY);
  currentY = addInfoRow(doc, 'Morada', site.address || '-', currentY);
  currentY = addInfoRow(doc, 'Dono de Obra', (site.organizations as { name: string })?.name || '-', currentY);
  currentY = addInfoRow(doc, 'Fiscalização', '—', currentY);

  currentY += 8;

  // Period summary
  currentY = addSectionTitle(doc, 'RESUMO DO PERÍODO', currentY);

  const totalItems = allItems?.length || 0;
  const okItems = allItems?.filter(i => i.result === 'OK').length || 0;
  const ncItems = allItems?.filter(i => i.result === 'NC').length || 0;
  const obsItems = allItems?.filter(i => i.result === 'OBS').length || 0;

  const summaryData: string[][] = [
    ['Fiscalizações Realizadas', String(inspections?.length || 0)],
    ['Itens Verificados', String(totalItems)],
    ['Conformes', totalItems > 0 ? `${okItems} (${Math.round(okItems / totalItems * 100)}%)` : '0'],
    ['Não Conformes', totalItems > 0 ? `${ncItems} (${Math.round(ncItems / totalItems * 100)}%)` : '0'],
    ['Observações', totalItems > 0 ? `${obsItems} (${Math.round(obsItems / totalItems * 100)}%)` : '0'],
  ];

  autoTable(doc, {
    startY: currentY,
    body: summaryData,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    bodyStyles: {
      fontSize: 10,
      textColor: COLORS.text,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
  });

  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // NCs in period
  if (ncs && ncs.length > 0) {
    currentY = addSectionTitle(doc, 'NÃO-CONFORMIDADES DO PERÍODO', currentY);

    const ncData = ncs.map((nc, index) => [
      String(index + 1).padStart(3, '0'),
      (nc.description || nc.title || '-').slice(0, 40) + ((nc.description || nc.title || '').length > 40 ? '...' : ''),
      SEVERITY_LABELS[nc.severity] || nc.severity,
      STATUS_LABELS[nc.status] || nc.status,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['NC', 'Descrição', 'Severidade', 'Estado']],
      body: ncData,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
      },
    });

    currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // General observations
  currentY = addSectionTitle(doc, 'OBSERVAÇÕES GERAIS', currentY);
  
  doc.setFillColor(...COLORS.lightGray);
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, 20, 'F');
  currentY += 25;

  // Signatures section
  if (currentY > PAGE_HEIGHT - 50) {
    doc.addPage();
    currentY = MARGIN;
  }

  currentY = addSectionTitle(doc, 'ASSINATURAS', currentY);
  currentY += 5;

  // Fiscalization signature
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text('Fiscalização:', MARGIN, currentY);
  doc.line(MARGIN + 25, currentY, MARGIN + 80, currentY);
  doc.text('Data:', MARGIN + 90, currentY);
  doc.line(MARGIN + 100, currentY, MARGIN + 130, currentY);

  currentY += 10;

  // Owner signature
  doc.text('Dono de Obra:', MARGIN, currentY);
  doc.line(MARGIN + 28, currentY, MARGIN + 80, currentY);
  doc.text('Data:', MARGIN + 90, currentY);
  doc.line(MARGIN + 100, currentY, MARGIN + 130, currentY);

  // Add footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Generate Compatibilization Report PDF
 */
export async function generateCompatibilizationReport({
  siteId,
  orgId,
  includeResolved = false,
  includeImages = false,
}: {
  siteId: string;
  orgId: string;
  includeResolved?: boolean;
  includeImages?: boolean;
}): Promise<Blob> {
  // Fetch site
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, name, address')
    .eq('id', siteId)
    .single();
  if (siteError || !site) throw new Error('Obra não encontrada');

  // Fetch projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, specialty, version, is_current_version, analysis_status, uploaded_at, floor_or_zone')
    .eq('site_id', siteId)
    .order('specialty');

  // Fetch conflicts
  let conflictQuery = supabase
    .from('project_conflicts')
    .select('*')
    .eq('site_id', siteId)
    .order('severity');
  if (!includeResolved) {
    conflictQuery = conflictQuery.not('status', 'in', '("resolved","dismissed")');
  }
  const { data: conflicts } = await conflictQuery;

  const allConflicts = conflicts || [];
  const projectsList = projects || [];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // === COVER PAGE ===
  // Logo placeholder
  doc.setFillColor(...COLORS.lightGray);
  doc.rect(MARGIN, MARGIN, 40, 20, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.text('LOGO', MARGIN + 20, MARGIN + 12, { align: 'center' });

  // Title
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE', PAGE_WIDTH / 2, 100, { align: 'center' });
  doc.text('COMPATIBILIZAÇÃO', PAGE_WIDTH / 2, 115, { align: 'center' });

  // Site name
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  doc.text(site.name, PAGE_WIDTH / 2, 140, { align: 'center' });
  if (site.address) {
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.secondary);
    doc.text(site.address, PAGE_WIDTH / 2, 150, { align: 'center' });
  }

  // Date
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.text);
  doc.text(format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: pt }), PAGE_WIDTH / 2, 170, { align: 'center' });

  // Separator
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(1);
  doc.line(60, 125, PAGE_WIDTH - 60, 125);

  // === PAGE 2: EXECUTIVE SUMMARY ===
  doc.addPage();
  let currentY = addHeader(doc, 'SUMÁRIO EXECUTIVO');
  currentY += 5;

  const totalConflicts = allConflicts.length;
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const resolved = allConflicts.filter(c => c.status === 'resolved' || c.status === 'dismissed').length;

  allConflicts.forEach(c => {
    if (c.severity in bySeverity) bySeverity[c.severity as keyof typeof bySeverity]++;
  });

  const resolutionRate = totalConflicts > 0 ? Math.round((resolved / totalConflicts) * 100) : 100;

  currentY = addInfoRow(doc, 'Total de Conflitos', String(totalConflicts), currentY);
  currentY = addInfoRow(doc, 'Taxa de Resolução', `${resolutionRate}%`, currentY);
  currentY += 5;

  // Severity breakdown table
  autoTable(doc, {
    startY: currentY,
    head: [['Severidade', 'Quantidade', '%']],
    body: [
      ['Crítico', String(bySeverity.critical), totalConflicts ? `${Math.round((bySeverity.critical / totalConflicts) * 100)}%` : '0%'],
      ['Alto', String(bySeverity.high), totalConflicts ? `${Math.round((bySeverity.high / totalConflicts) * 100)}%` : '0%'],
      ['Médio', String(bySeverity.medium), totalConflicts ? `${Math.round((bySeverity.medium / totalConflicts) * 100)}%` : '0%'],
      ['Baixo', String(bySeverity.low), totalConflicts ? `${Math.round((bySeverity.low / totalConflicts) * 100)}%` : '0%'],
    ],
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 30, halign: 'center' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const row = data.row.index;
        const colors = [COLORS.danger, [234, 179, 8], COLORS.primary, COLORS.secondary];
        data.cell.styles.textColor = colors[row] as [number, number, number];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // === PROJECTS ANALYZED ===
  currentY = addSectionTitle(doc, 'PROJECTOS ANALISADOS', currentY);

  const SPECIALTY_LABELS: Record<string, string> = {
    topography: 'Topografia', architecture: 'Arquitectura', structure: 'Estruturas',
    plumbing: 'Águas e Esgotos', electrical: 'Electricidade', hvac: 'AVAC',
    gas: 'Gás', telecom: 'Telecomunicações', other: 'Outros',
  };

  const ANALYSIS_LABELS: Record<string, string> = {
    pending: 'Pendente', analyzing: 'A analisar', completed: 'Concluída', failed: 'Falhou',
  };

  if (projectsList.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Especialidade', 'Nome', 'Versão', 'Data Upload', 'Análise']],
      body: projectsList.map(p => [
        SPECIALTY_LABELS[p.specialty] || p.specialty,
        p.name,
        `v${p.version || 1}`,
        format(new Date(p.uploaded_at), 'dd/MM/yyyy', { locale: pt }),
        ANALYSIS_LABELS[p.analysis_status] || p.analysis_status,
      ]),
      margin: { left: MARGIN, right: MARGIN },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: COLORS.text },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // === CONFLICTS ===
  if (currentY > PAGE_HEIGHT - 50) { doc.addPage(); currentY = MARGIN; }
  currentY = addSectionTitle(doc, 'CONFLITOS DETECTADOS', currentY);

  const CONFLICT_TYPE_LABELS: Record<string, string> = {
    spatial_overlap: 'Sobreposição Espacial', dimension_mismatch: 'Cotas Diferentes',
    missing_provision: 'Provisão em Falta', code_violation: 'Violação de Norma',
  };

  const CONFLICT_STATUS_LABELS: Record<string, string> = {
    detected: 'Detectado', confirmed: 'Confirmado', dismissed: 'Descartado',
    resolved: 'Resolvido', nc_created: 'NC Criada',
  };

  const CONFLICT_SEV_LABELS: Record<string, string> = {
    critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo',
  };

  const getProjectName = (id: string) => projectsList.find(p => p.id === id)?.name || '—';

  if (allConflicts.length > 0) {
    for (let i = 0; i < allConflicts.length; i++) {
      const c = allConflicts[i];
      if (currentY > PAGE_HEIGHT - 40) { doc.addPage(); currentY = MARGIN; }

      // Conflict header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const sevColor = c.severity === 'critical' ? COLORS.danger :
        c.severity === 'high' ? [234, 179, 8] as [number, number, number] :
        c.severity === 'medium' ? COLORS.primary : COLORS.secondary;
      doc.setTextColor(...(sevColor as [number, number, number]));
      doc.text(`[${CONFLICT_SEV_LABELS[c.severity] || c.severity}]`, MARGIN, currentY);

      doc.setTextColor(...COLORS.text);
      const sevWidth = doc.getTextWidth(`[${CONFLICT_SEV_LABELS[c.severity] || c.severity}] `);
      doc.text(c.title, MARGIN + sevWidth, currentY);
      currentY += 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.secondary);
      doc.text(`Tipo: ${CONFLICT_TYPE_LABELS[c.conflict_type] || c.conflict_type} | Estado: ${CONFLICT_STATUS_LABELS[c.status] || c.status}`, MARGIN, currentY);
      currentY += 4;
      doc.text(`Projectos: ${getProjectName(c.project1_id)} ↔ ${getProjectName(c.project2_id)}`, MARGIN, currentY);
      currentY += 4;

      if (c.description) {
        doc.setTextColor(...COLORS.text);
        const lines = doc.splitTextToSize(c.description, CONTENT_WIDTH);
        doc.text(lines, MARGIN, currentY);
        currentY += lines.length * 3.5;
      }

      if (c.location_description) {
        doc.setTextColor(...COLORS.secondary);
        doc.text(`📍 ${c.location_description}`, MARGIN, currentY);
        currentY += 4;
      }

      currentY += 4;
    }
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.success);
    doc.text('✓ Sem incompatibilidades detectadas', MARGIN, currentY);
    currentY += 8;
  }

  // === STANDARD CHECKLIST ===
  if (currentY > PAGE_HEIGHT - 60) { doc.addPage(); currentY = MARGIN; }
  currentY = addSectionTitle(doc, 'CHECKLIST DE VERIFICAÇÕES PADRÃO', currentY);

  const checklist = [
    'Verificação de sobreposições espaciais entre especialidades',
    'Conferência de cotas e dimensões entre projectos',
    'Verificação de provisões para passagens de tubagens e condutas',
    'Conformidade com normas e regulamentos aplicáveis',
    'Verificação de coordenação de altimetria entre pisos',
    'Verificação de acessos para manutenção de equipamentos',
    'Conferência de cargas previstas vs. capacidade estrutural',
  ];

  checklist.forEach(item => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(`☐  ${item}`, MARGIN, currentY);
    currentY += 5;
  });

  currentY += 5;

  // === RECOMMENDATIONS ===
  if (currentY > PAGE_HEIGHT - 60) { doc.addPage(); currentY = MARGIN; }
  currentY = addSectionTitle(doc, 'RECOMENDAÇÕES', currentY);

  // Auto-generate recommendations based on conflicts
  const recommendations: string[] = [];
  const specialtiesInvolved = new Set<string>();
  allConflicts.forEach(c => {
    const p1 = projectsList.find(p => p.id === c.project1_id);
    const p2 = projectsList.find(p => p.id === c.project2_id);
    if (p1) specialtiesInvolved.add(SPECIALTY_LABELS[p1.specialty] || p1.specialty);
    if (p2) specialtiesInvolved.add(SPECIALTY_LABELS[p2.specialty] || p2.specialty);
  });

  if (bySeverity.critical > 0) {
    recommendations.push(`Resolver urgentemente os ${bySeverity.critical} conflito(s) de severidade CRÍTICA antes de avançar com a execução.`);
  }
  if (specialtiesInvolved.size > 1) {
    const specs = Array.from(specialtiesInvolved).join(', ');
    recommendations.push(`Rever coordenação entre as especialidades: ${specs}.`);
  }
  if (allConflicts.some(c => c.conflict_type === 'dimension_mismatch')) {
    recommendations.push('Conferir e uniformizar cotas entre projectos de diferentes especialidades.');
  }
  if (allConflicts.some(c => c.conflict_type === 'missing_provision')) {
    recommendations.push('Verificar provisões em falta para passagens técnicas e equipamentos.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Sem recomendações específicas. Os projectos aparentam estar compatibilizados.');
  }

  recommendations.forEach((rec, i) => {
    if (currentY > PAGE_HEIGHT - 20) { doc.addPage(); currentY = MARGIN; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const lines = doc.splitTextToSize(`${i + 1}. ${rec}`, CONTENT_WIDTH);
    doc.text(lines, MARGIN, currentY);
    currentY += lines.length * 4 + 2;
  });

  // === SIGNATURE ===
  if (currentY > PAGE_HEIGHT - 45) { doc.addPage(); currentY = MARGIN; }
  currentY += 10;
  currentY = addSectionTitle(doc, 'ASSINATURA', currentY);
  currentY += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: pt })}`, MARGIN, currentY);
  currentY += 15;
  doc.setDrawColor(...COLORS.text);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, currentY, MARGIN + 70, currentY);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.text('(Assinatura)', MARGIN + 35, currentY + 4, { align: 'center' });

  // === FOOTERS ===
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  // Persist document
  try {
    const blob = doc.output('blob');
    const fileName = `Compatibilizacao_${site.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    const filePath = `organizations/${orgId}/sites/${siteId}/reports/${fileName}`;

    await supabase.storage.from('documents').upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
    await supabase.from('documents').insert({
      name: `Relatório de Compatibilização - ${site.name}`,
      doc_type: 'compatibilization_report',
      file_path: filePath,
      site_id: siteId,
      org_id: orgId,
    });
  } catch (e) {
    console.warn('Could not persist report:', e);
  }

  return doc.output('blob');
}
