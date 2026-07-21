import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FiscalNote { note: string; created_at: string; }

// Schema v3 + blocos de referência F4 — TUDO opcional para não rebentar pareceres antigos (v2/v3 parcial).
interface AnalysisData {
  recommendation?: string;
  confidence?: number;
  header_sintese?: { veredito?: string; base_analise?: string; material?: string };
  // Campos do modelo aprovado (título + subtítulo). Opcionais: pareceres antigos não os têm.
  pam_reference?: string;        // "PAM 011" — extraído do documento, nunca inventado
  empreiteiro?: string;          // quem submete o pedido, extraído do PAM
  documents_crossed?: string[];  // documentos cruzados, para o subtítulo
  analysis_date?: string;        // data da análise (≠ data de exportação)
  material_proposed?: { name?: string; manufacturer?: string; product?: string; model?: string; specifications?: string[] };
  project_requirements?: { description?: string; exposure_conditions?: string; special_requirements?: string[]; required_tests?: string[]; source?: string };
  material_specified?: { description?: string; requirements?: string[] }; // legado v2
  adequacy_assessment?: { is_adequate?: boolean; reasoning?: string };
  compliance_checks?: Array<{ supplier?: string; product?: string; certificate?: string; dc_lnec?: string; validity?: string; aspect?: string; status?: string; detail?: string; source_file?: string }>;
  certificates_validity?: Array<{ file?: string; type?: string; issue_date?: string; expiry_date?: string; status?: string; note?: string }>;
  mqt_articles_by_phase?: Array<{ fase?: string; revisao?: string; article?: string; description?: string; diameter?: string; quantity?: string; norm?: string }>;
  cte_sections?: Array<{ section?: string; requirement?: string; verification?: string; verdict?: string }>;
  supporting_documents?: Array<{ number?: string; norm?: string; scope?: string; validity?: string }>;
  documents_without_application?: Array<{ document?: string; reason?: string }>;
  conditions?: string[];
  practical_concerns?: string[];
  issues?: string[]; // legado v2
  justification?: string;
  norms_referenced?: string[];
  missing_information?: string[];
}
interface ApprovalData {
  pdm_name: string; material_category: string; status: string;
  final_decision?: string | null; decided_by?: string | null; decided_at?: string | null;
  reviewer_notes?: string | null; created_at: string; fiscal_notes?: FiscalNote[] | null; fiscal_name?: string | null;
}

const ML = 18, MR = 18, PAGE_W = 210, PAGE_H = 297, MB = 18;
const CW = PAGE_W - ML - MR;
const FOOTER_Y = PAGE_H - MB + 7;

// ASCII-safe (jsPDF core fonts são latin-1).
const S = (t: unknown): string => String(t ?? '')
  .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/Ø/g, 'O/').replace(/±/g, '+/-')
  .replace(/²/g, '2').replace(/³/g, '3').replace(/×/g, 'x').replace(/°/g, 'o').replace(/…/g, '...')
  .replace(/–/g, '-').replace(/—/g, ' - ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[^\x00-\x7F\xC0-\xFF]/g, (c) => (c.charCodeAt(0) >= 0x100 ? '?' : c));

const RGB = {
  ink: [30, 41, 59] as [number, number, number],
  soft: [100, 116, 139] as [number, number, number],
  body: [71, 85, 105] as [number, number, number],
};

function verdictMeta(a: AnalysisData, approval: ApprovalData): { label: string; color: [number, number, number] } {
  const raw = (a.header_sintese?.veredito || a.recommendation || approval.final_decision || approval.status || '').toString().toLowerCase();
  if (raw.includes('condicion')) return { label: a.header_sintese?.veredito || 'APROVADO CONDICIONADO', color: [230, 126, 34] };
  if (raw.includes('reserva')) return { label: 'APROVADO COM RESERVAS', color: [230, 126, 34] };
  if (raw.includes('reject') || raw.includes('rejeit')) return { label: 'REJEITADO', color: [220, 38, 38] };
  if (raw.includes('approv') || raw.includes('aprov')) return { label: a.header_sintese?.veredito || 'APROVADO', color: [34, 197, 94] };
  return { label: 'PENDENTE', color: [148, 163, 184] };
}
function cteVerdictMeta(v?: string): { label: string; color: [number, number, number] } {
  switch ((v || '').toUpperCase()) {
    case 'CONFORME': return { label: 'CONFORME', color: [34, 197, 94] };
    case 'CONFORME_POR_EXCESSO': return { label: 'CONFORME POR EXCESSO', color: [13, 148, 136] };
    case 'NAO_CONFORME': return { label: 'NAO CONFORME', color: [220, 38, 38] };
    case 'A_ACAUTELAR_EM_EXECUCAO': return { label: 'A ACAUTELAR EM EXECUCAO', color: [230, 126, 34] };
    default: return { label: S(v || '-'), color: RGB.soft };
  }
}

// Cabeçalho comum. Devolve o y após o cabeçalho.
function header(doc: jsPDF, title: string, approval: ApprovalData, obraName: string, fiscalName?: string, fiscalCompany?: string, logo?: string, clientLogo?: string): number {
  if (logo) { try { doc.addImage(logo, 'PNG', ML, 10, 22, 12); } catch { /* ignore */ } }
  if (clientLogo) { try { doc.addImage(clientLogo, 'PNG', PAGE_W - MR - 30, 8, 30, 14); } catch { /* ignore */ } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...RGB.ink);
  doc.text(S(title), PAGE_W / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...RGB.soft);
  doc.text(S(`Obra: ${obraName}  |  Categoria: ${approval.material_category}  |  ${new Date().toLocaleDateString('pt-PT')}`), PAGE_W / 2, 22, { align: 'center' });
  if (fiscalName) doc.text(S(`Fiscal: ${fiscalName}${fiscalCompany ? ` - ${fiscalCompany}` : ''}`), PAGE_W / 2, 26.5, { align: 'center' });
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.4); doc.line(ML, 29, PAGE_W - MR, 29);
  return 35;
}

function footers(doc: jsPDF, fiscalCompany?: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text(S(fiscalCompany ? `${fiscalCompany} - Fiscalizacao de Obras` : 'Obrify - Fiscalizacao de Obras'), ML, FOOTER_Y);
    doc.text(`Pagina ${i} de ${n}`, PAGE_W - MR, FOOTER_Y, { align: 'right' });
  }
}

// Cabeçalho do RESUMO — estrutura do modelo aprovado: título com a referência do PAM e UMA
// linha de subtítulo "Obra … · empreiteiro · Análise da Fiscalização (docs cruzados) · data".
// Separado de header() de propósito: o relatório completo mantém o cabeçalho antigo intacto.
function headerReference(doc: jsPDF, a: AnalysisData, approval: ApprovalData, obraName: string, logo?: string, clientLogo?: string): number {
  if (logo) { try { doc.addImage(logo, 'PNG', ML, 10, 22, 12); } catch { /* ignore */ } }
  if (clientLogo) { try { doc.addImage(clientLogo, 'PNG', PAGE_W - MR - 30, 8, 30, 14); } catch { /* ignore */ } }
  const ref = S(a.pam_reference || '').trim();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...RGB.ink);
  doc.text(S(`Analise de Pedido de Aprovacao de Materiais${ref ? `, ${ref}` : ''}`), PAGE_W / 2, 16, { align: 'center' });

  const cruzados = (a.documents_crossed || []).filter(Boolean).map(S).join(' + ');
  const dataAnalise = a.analysis_date ? S(a.analysis_date)
    : (approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT'));
  const sub = [
    S(obraName),
    a.empreiteiro ? S(a.empreiteiro) : null,
    cruzados ? `Analise da Fiscalizacao (${cruzados})` : 'Analise da Fiscalizacao',
    dataAnalise,
  ].filter(Boolean).join(' \xB7 ');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...RGB.soft);
  const subLines = doc.splitTextToSize(sub, CW);
  doc.text(subLines, PAGE_W / 2, 22, { align: 'center' });
  const yLine = 22 + subLines.length * 4.2 + 1.5;
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.4); doc.line(ML, yLine, PAGE_W - MR, yLine);
  return yLine + 6;
}

// Síntese + 5 blocos de referência (partilhado Executivo/Completo). Devolve o y final.
function renderReferenceBlocks(doc: jsPDF, a: AnalysisData, approval: ApprovalData, startY: number): number {
  let y = startY;
  const vm = verdictMeta(a, approval);

  // PARECER — parágrafo destacado, na ordem do modelo: veredito -> base da análise -> material.
  // (Substitui o badge: o modelo aprovado não tem badge, tem "Parecer final: <VEREDITO> — …".)
  const sint = a.header_sintese;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...vm.color);
  doc.text(S(`Parecer final: ${vm.label}`), ML, y); y += 5.5;
  const parecerText = [
    sint?.base_analise ? S(sint.base_analise) : '',
    sint?.material ? S(`Material: ${sint.material}`) : '',
  ].filter(Boolean).join(' ') || S(a.justification || '');
  if (parecerText) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...RGB.body);
    const lines = doc.splitTextToSize(parecerText, CW);
    doc.text(lines, ML, y); y += lines.length * 4.2 + 4;
  }

  const sectionTitle = (t: string, gap = 2) => {
    if (y > PAGE_H - MB - 24) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...RGB.ink);
    doc.text(S(t), ML, y); y += gap;
  };
  // Prosa compacta (secções 3 e 4 do modelo): itens concatenados, sem tabela.
  const prose = (txt: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...RGB.body);
    const lines = doc.splitTextToSize(txt, CW);
    if (y + lines.length * 4 > PAGE_H - MB - 6) { doc.addPage(); y = 20; }
    doc.text(lines, ML, y); y += lines.length * 4 + 4;
  };
  const afterTable = () => { y = (doc as { lastAutoTable: { finalY: number } } & jsPDF).lastAutoTable.finalY + 6; };

  // 1. Artigos do MQT — a fase é LINHA DE SUBGRUPO (formato do modelo), não coluna.
  if (a.mqt_articles_by_phase?.length) {
    sectionTitle(`1. Artigos do MQT abrangidos${a.pam_reference ? ` pelo ${S(a.pam_reference)}` : ''}`);
    const faseLabel = (r: { fase?: string; revisao?: string }) => {
      const f = S(r.fase || '').trim(), rev = S(r.revisao || '').trim();
      return !f && !rev ? '' : (rev ? `${f} (${rev})` : f);
    };
    const rows: unknown[] = [];
    let faseActual: string | null = null;
    for (const r of a.mqt_articles_by_phase) {
      const fl = faseLabel(r);
      if (fl && fl !== faseActual) {
        faseActual = fl;
        rows.push([{ content: fl, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: RGB.ink } }]);
      }
      rows.push([S(r.article || '-'), S(r.description || '-'), S(r.diameter || '-'), S(r.quantity || '-'), S(r.norm || '-')]);
    }
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR },
      head: [['Artigo', 'Descricao', 'O/ (mm)', 'Quant. (m)', 'Norma']],
      body: rows as string[][],
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', textColor: RGB.body },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: CW - 24 - 26 - 28 - 28 }, 2: { cellWidth: 26 }, 3: { cellWidth: 28 }, 4: { cellWidth: 28 } },
    });
    afterTable();
  }

  // 2. Seccoes dos CTE + veredito fino
  if (a.cte_sections?.length) {
    sectionTitle(`2. Seccoes dos CTE aplicaveis${a.pam_reference ? ` ao ${S(a.pam_reference)}` : ''}`);
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR },
      // 3 colunas (modelo): o veredicto é EMBUTIDO no início da Verificação, não é coluna.
      head: [['CTE / Seccao', 'Requisito de projeto', 'Verificacao']],
      body: a.cte_sections.map(s => {
        const label = cteVerdictMeta(s.verdict).label;
        const v = S(s.verification || '').trim();
        // Não duplica o veredicto se o modelo já o escreveu no início da verificação.
        const verif = (label && label !== '-' && !v.toUpperCase().startsWith(label)) ? `${label} - ${v}` : v;
        return [S(s.section || '-'), S(s.requirement || '-'), verif || '-'];
      }),
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', textColor: RGB.body },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 50 }, 2: { cellWidth: CW - 34 - 50 } },
    });
    afterTable();
  }

  // 3. Documentos que suportam — PROSA compacta separada por " · " (formato do modelo).
  const sup = (a.supporting_documents || []).filter(d => d && (d.number || d.norm || d.scope));
  if (sup.length) {
    sectionTitle('3. Documentos que suportam a aprovacao', 5);
    prose(sup.map(d => {
      const det = [d.norm, d.scope, d.validity ? `val. ${d.validity}` : ''].filter(Boolean).map(S).join(', ');
      return `${S(d.number || '-')}${det ? ` (${det})` : ''}`;
    }).join(' \xB7 ') + '.');
  }

  // 4. Documentos sem aplicacao — PROSA compacta com o motivo de cada um (formato do modelo).
  const semApl = (a.documents_without_application || []).filter(d => d && (d.document || d.reason));
  if (semApl.length) {
    sectionTitle(`4. Documentos entregues sem aplicacao${a.pam_reference ? ` ao ${S(a.pam_reference)}` : ''}`, 5);
    prose(semApl.map(d => `${S(d.document || '-')}${d.reason ? ` (${S(d.reason)})` : ''}`).join(' \xB7 ') + '.');
  }

  // 5. Condicoes da aprovacao
  const conds = (a.conditions || []).filter(Boolean);
  if (conds.length) {
    sectionTitle('5. Condicoes da aprovacao');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...RGB.body);
    conds.forEach((c, i) => {
      const lines = doc.splitTextToSize(S(`${String.fromCharCode(97 + i)}) ${c}`), CW - 4);
      if (y + lines.length * 4 > PAGE_H - MB - 6) { doc.addPage(); y = 20; }
      doc.text(lines, ML + 2, y); y += lines.length * 4 + 1.5;
    });
    y += 2;
  }
  return y;
}

export function generateMaterialApprovalExecutive(
  approval: ApprovalData, analysis: AnalysisData, obraName: string,
  fiscalName?: string, fiscalCompany?: string, logoBase64?: string, clientLogoBase64?: string,
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const a = analysis || {};
  // Cabeçalho do modelo aprovado (título com referência do PAM + subtítulo de 1 linha).
  // `fiscalName` deixa de entrar no cabeçalho: o modelo não o tem. Continua no rodapé.
  void fiscalName;
  let y = headerReference(doc, a, approval, obraName, logoBase64, clientLogoBase64);
  y = renderReferenceBlocks(doc, a, approval, y);
  // Fallback total: parecer antigo sem qualquer bloco novo -> mostrar a justificação, nunca crashar.
  if (!a.header_sintese && !a.mqt_articles_by_phase?.length && !a.cte_sections?.length && !(a.conditions || []).length && a.justification) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...RGB.body);
    doc.text(doc.splitTextToSize(S(a.justification), CW), ML, y);
  }
  footers(doc, fiscalCompany);
  doc.save(`PAM_Resumo_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateMaterialApprovalPDF(
  approval: ApprovalData, analysis: AnalysisData, obraName: string,
  fiscalName?: string, fiscalCompany?: string, logoBase64?: string, clientLogoBase64?: string,
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const a = analysis || {};
  let y = header(doc, 'Analise PAM', approval, obraName, fiscalName, fiscalCompany, logoBase64, clientLogoBase64);
  y = renderReferenceBlocks(doc, a, approval, y);

  const title = (t: string) => {
    if (y > PAGE_H - MB - 20) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...RGB.ink);
    doc.text(S(t), ML, y); y += 2;
  };
  const afterTable = () => { y = (doc as { lastAutoTable: { finalY: number } } & jsPDF).lastAutoTable.finalY + 6; };

  // Verificacoes de conformidade (v3 com fallback v2 — corrige o drift aspect->supplier).
  if (a.compliance_checks?.length) {
    title('Verificacoes de Conformidade');
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR },
      head: [['Fornecedor / Aspecto', 'Estado', 'Detalhe']],
      body: a.compliance_checks.map(c => [
        S(c.supplier ? `${c.supplier}${c.product ? ' - ' + c.product : ''}` : (c.aspect || '-')),
        c.status === 'conforme' ? 'Conforme' : (c.status === 'nao_conforme' || c.status === 'não_conforme') ? 'Nao conforme' : 'A verificar',
        S([c.detail, c.source_file ? `(fonte: ${c.source_file})` : ''].filter(Boolean).join(' ')),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', textColor: RGB.body },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 24 }, 2: { cellWidth: CW - 42 - 24 } },
    });
    afterTable();
  }

  // Validade dos certificados
  if (a.certificates_validity?.length) {
    title('Validade dos Certificados');
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR },
      head: [['Ficheiro', 'Tipo', 'Estado', 'Validade']],
      body: a.certificates_validity.map(c => [S(c.file || '-'), S(c.type || '-'), S((c.status || '-').replace('_', ' ')), S(c.expiry_date || '-')]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', textColor: RGB.body },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
    });
    afterTable();
  }

  // Justificacao tecnica
  if (a.justification) {
    title('Justificacao Tecnica');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...RGB.body);
    const lines = doc.splitTextToSize(S(a.justification), CW);
    doc.text(lines, ML, y + 3); y += lines.length * 4.2 + 6;
  }

  // Decisao final do fiscal
  if (approval.final_decision) {
    title('Decisao Final');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...RGB.body);
    const dn = approval.fiscal_name || (approval.decided_by && !approval.decided_by.includes('@') ? approval.decided_by : null) || fiscalName || '-';
    const dd = approval.decided_at ? new Date(approval.decided_at).toLocaleDateString('pt-PT') : '';
    doc.text(S(`Decisao: ${approval.final_decision}  |  Tecnico Fiscal: ${dn}  ${dd}`), ML, y + 3); y += 8;
    if (approval.reviewer_notes) {
      const l = doc.splitTextToSize(S(`Justificacao: ${approval.reviewer_notes}`), CW);
      doc.text(l, ML, y); y += l.length * 4.2 + 3;
    }
  }

  footers(doc, fiscalCompany);
  doc.save(`PAM_${approval.material_category.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
