// Adaptador ai_analysis -> JSON oficial do Resumo PAM (spec docs/modelos/pam, secção 8).
// Alimenta o gerador congelado (modelo_resumo_pam.py) via /api/gerar_resumo_pam.
// Regra: campos em falta no ai_analysis -> ERRO RUIDOSO com a lista; NUNCA inventar dados.

// ---- Entrada (subconjunto do ai_analysis relevante para o resumo) ----
export interface PamAnalysisInput {
  pam_reference?: string;
  empreiteiro?: string;
  documents_crossed?: string[];
  analysis_date?: string;
  recommendation?: string;
  header_sintese?: { veredito?: string; base_analise?: string; material?: string };
  mqt_articles_by_phase?: Array<{
    fase?: string; revisao?: string; article?: string;
    description?: string; diameter?: string; quantity?: string; norm?: string;
  }>;
  cte_sections?: Array<{ section?: string; requirement?: string; verification?: string; verdict?: string }>;
  supporting_documents?: Array<{ number?: string; norm?: string; scope?: string; validity?: string }>;
  documents_without_application?: Array<{ document?: string; reason?: string }>;
  conditions?: string[];
}

// ---- Saída (schema oficial da spec secção 8) ----
export interface OfficialPamData {
  numero_pam: string;
  subtitulo: string;
  parecer: string;
  parecer_texto: string;
  seccao1: { grupos: Array<{ titulo: string; artigos: Array<{ artigo: string; descricao: string; diametros: string; quantidades: string; norma: string }> }> };
  seccao2: { linhas: Array<{ seccao: string; requisito: string; verificacao: string }> };
  seccao3: string;
  seccao4: string;
  seccao5: string[];
}

// Veredito livre -> valor oficial. Desconhecido = erro (nunca rótulo inventado).
function mapParecer(veredito: string): string {
  const v = veredito.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (v.includes('REPROV') || v.includes('REJEIT') || v.includes('REJECT')) return 'REPROVADO';
  if (v.includes('CONDICION') || v.includes('RESERVA') || v.includes('WITH_RESERVATION')) return 'APROVADO CONDICIONADO';
  if (v.includes('APROV') || v.includes('APPROV')) return 'APROVADO';
  throw new Error(`Resumo PAM: veredito "${veredito}" nao mapeavel para APROVADO / APROVADO CONDICIONADO / REPROVADO.`);
}

// "PAM 011" -> "011". Sem numero extraivel = erro.
function extrairNumero(ref: string): string {
  const m = ref.match(/PAM\s*([0-9A-Za-z–-]+)/i) || ref.trim().match(/([0-9A-Za-z–-]+)$/);
  if (m) return m[1];
  throw new Error(`Resumo PAM: pam_reference "${ref}" nao contem numero de PAM extraivel.`);
}

// verdict do schema -> palavra-chave oficial (spec secção 5).
const CTE_LABEL: Record<string, string> = {
  CONFORME: 'CONFORME',
  CONFORME_POR_EXCESSO: 'CONFORME POR EXCESSO',
  NAO_CONFORME: 'NÃO CONFORME',
  A_ACAUTELAR_EM_EXECUCAO: 'A ACAUTELAR EM EXECUÇÃO',
};

/**
 * Constrói o JSON oficial a partir do ai_analysis. `obraName` vem do frontend
 * (como hoje). Lança Error com a lista de campos em falta se algo obrigatório faltar.
 */
export function buildOfficialPamData(a: PamAnalysisInput, obraName: string): OfficialPamData {
  const hs = a.header_sintese || {};
  const faltam: string[] = [];
  if (!obraName?.trim()) faltam.push('obraName (nome da obra)');
  if (!a.pam_reference?.trim()) faltam.push('pam_reference');
  if (!hs.veredito?.trim()) faltam.push('header_sintese.veredito');
  if (!hs.base_analise?.trim()) faltam.push('header_sintese.base_analise');
  if (!hs.material?.trim()) faltam.push('header_sintese.material');
  if (!a.mqt_articles_by_phase?.length) faltam.push('mqt_articles_by_phase');
  if (!a.cte_sections?.length) faltam.push('cte_sections');
  if (!a.supporting_documents?.length) faltam.push('supporting_documents');
  if (faltam.length) {
    throw new Error(`Resumo PAM: campos em falta no ai_analysis — ${faltam.join(', ')}. Corrigir a analise / re-analisar (nunca inventar).`);
  }

  // Secção 1 — lista plana -> grupos aninhados por fase+revisão, na ordem de aparição.
  const grupos: OfficialPamData['seccao1']['grupos'] = [];
  const idxPorTitulo: Record<string, number> = {};
  for (const r of a.mqt_articles_by_phase!) {
    const fase = (r.fase || '').trim();
    const rev = (r.revisao || '').trim();
    const titulo = rev ? `${fase} (${rev})` : (fase || 'Sem fase');
    if (!(titulo in idxPorTitulo)) { idxPorTitulo[titulo] = grupos.length; grupos.push({ titulo, artigos: [] }); }
    grupos[idxPorTitulo[titulo]].artigos.push({
      artigo: r.article ?? '',
      descricao: r.description ?? '',
      diametros: r.diameter ?? '',
      quantidades: r.quantity ?? '',
      norma: r.norm ?? '',
    });
  }

  // Secção 2 — veredicto embutido no início da verificação (mesma lógica anti-duplicação do jsPDF).
  const linhas = a.cte_sections!.map(s => {
    const label = CTE_LABEL[(s.verdict || '').toUpperCase()] || (s.verdict || '').trim();
    const just = (s.verification || '').trim();
    const verif = (label && !just.toUpperCase().startsWith(label.toUpperCase())) ? `${label} — ${just}` : just;
    return { seccao: (s.section || '').trim(), requisito: (s.requirement || '').trim(), verificacao: verif };
  });

  // Secção 3 — prosa " · " + ponto final.
  const seccao3 = a.supporting_documents!.map(d => {
    const det = [d.norm, d.scope, d.validity ? `val. ${d.validity}` : '']
      .filter(x => x && String(x).trim()).map(x => String(x).trim()).join(', ');
    return `${(d.number || '').trim()}${det ? ` (${det})` : ''}`;
  }).join(' · ') + '.';

  // Secção 4 — prosa; vazio se não houver documentos sem aplicação (agrupamento já vem do modelo).
  const semApl = a.documents_without_application || [];
  const seccao4 = semApl.length
    ? semApl.map(d => `${(d.document || '').trim()}${d.reason ? ` (${String(d.reason).trim()})` : ''}`).join(' · ') + '.'
    : '';

  // Subtítulo — campos null omitem-se, sem " · " a mais.
  const cruzados = (a.documents_crossed || []).filter(Boolean).map(x => String(x).trim()).join(' + ');
  const subtitulo = [
    obraName.trim(),
    a.empreiteiro?.trim() || null,
    cruzados ? `Análise da Fiscalização (${cruzados})` : 'Análise da Fiscalização',
    a.analysis_date?.trim() || null,
  ].filter((x): x is string => !!x).join(' · ');

  return {
    numero_pam: extrairNumero(a.pam_reference!),
    subtitulo,
    parecer: mapParecer(hs.veredito!),
    parecer_texto: `— ${hs.base_analise!.trim()} Material: ${hs.material!.trim()}`,
    seccao1: { grupos },
    seccao2: { linhas },
    seccao3,
    seccao4,
    seccao5: a.conditions || [],
  };
}
