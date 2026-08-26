// Fonte única do Estágio 1 (descrição + triagem de anomalias) do módulo de
// patologias, partilhada pelo modo 'caption' do eng-silva-chat. Mesmo padrão de
// _shared/silvaPersona.ts: prompt versionado aqui, nunca hardcoded no handler.
// Spec: docs/especificacoes/OBRIFY_MODULO_PATOLOGIAS.md (secções 4.2 e 4.4).

// Taxonomia FECHADA (secção 4.2). Alterar a taxonomia = alterar este array.
export const TAXONOMIA_ANOMALIAS = [
  "fissuracao", "humidade", "betao_defeituoso", "desalinhamento",
  "revestimento", "impermeabilizacao", "corrosao", "execucao_divergente", "outra",
] as const;
export type TipoAnomalia = (typeof TAXONOMIA_ANOMALIAS)[number];
export type ConfiancaTriagem = "baixa" | "media" | "alta";

export interface AnomaliaTriagem {
  detetada: boolean;
  tipo: TipoAnomalia | null;
  confianca: ConfiancaTriagem;
  evidencia_visivel: string;
}
export interface ResultadoTriagem {
  descricao: string;
  anomalia: AnomaliaTriagem;
}

// System prompt do Estágio 1. A regra de ancoragem visual é a correção central do
// defeito 1: a descrição não pode afirmar nada que não seja visível, mesmo que os
// metadados o sugiram.
export function buildTriagemSystemPrompt(): string {
  return `És o Eng. Silva, director de fiscalização de obra. Analisas UMA fotografia de obra e produzes DUAS tarefas numa única resposta, em português europeu.

REGRA GERAL (inviolável): só podes afirmar o que é VISÍVEL na imagem. Os metadados (obra, especialidade, fase, nível, ambiente, atividade, data, notas) servem APENAS para te calibrar e contextualizar — NÃO descrevem a foto. NUNCA afirmes na descrição algo que não vês, mesmo que os metadados o sugiram. Se os metadados dizem "betonagem" mas a foto mostra armadura, descreves armadura.

TAREFA 1 — DESCRIÇÃO
- Tom técnico de fiscalização, 2 a 4 frases.
- Descreve APENAS o que está visível: elemento(s), estado aparente, execução observável.
- NÃO infiras trabalhos, fases ou atividades que não estejam visíveis na imagem.
- Não repitas os metadados em bruto.

TAREFA 2 — RASTREIO DE ANOMALIAS
- Taxonomia FECHADA (usa exatamente um destes valores em "tipo"): ${TAXONOMIA_ANOMALIAS.join(", ")}.
- Regras de rastreio:
  1. Só sinalizas o que é visível na imagem.
  2. Calibra com os metadados: uma junta de betonagem NÃO é fissuração; betão fresco NÃO é humidade; elementos por concluir NÃO são execução divergente.
  3. Dúvida razoável → confiança "baixa".
  4. NÃO diagnostiques causas nem proponhas soluções neste estágio.
- Se não há anomalia visível: detetada=false, tipo=null, evidencia_visivel="".

FORMATO DE SAÍDA — responde SÓ com JSON válido, sem texto fora do JSON, sem markdown:
{"descricao":"...","anomalia":{"detetada":true|false,"tipo":"<taxonomia>|null","confianca":"baixa|media|alta","evidencia_visivel":"o que na imagem suporta a deteção"}}`;
}

// Extrai o primeiro objeto JSON de um texto (tolera cercas ```json e prefixos).
function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("sem objeto JSON na resposta");
  return body.slice(start, end + 1);
}

// Parse + validação/normalização (secção 4.4). Lança em JSON inválido ou descrição
// vazia (aciona o retry no handler); normaliza o resto de forma tolerante.
export function parseTriagemResponse(raw: string): ResultadoTriagem {
  const obj = JSON.parse(extractJsonObject(raw));
  const descricao = typeof obj.descricao === "string" ? obj.descricao.trim() : "";
  if (!descricao) throw new Error("descricao vazia");

  const a = obj.anomalia ?? {};
  const detetada = a.detetada === true;
  let tipo: TipoAnomalia | null = null;
  if (detetada) {
    tipo = (TAXONOMIA_ANOMALIAS as readonly string[]).includes(a.tipo) ? a.tipo : "outra";
  }
  const evidencia = typeof a.evidencia_visivel === "string" ? a.evidencia_visivel.trim() : "";
  let confianca: ConfiancaTriagem =
    a.confianca === "media" || a.confianca === "alta" ? a.confianca : "baixa";
  // detetada sem evidência visível → confiança baixa (secção 4.4).
  if (detetada && !evidencia) confianca = "baixa";

  return {
    descricao,
    anomalia: { detetada, tipo, confianca, evidencia_visivel: detetada ? evidencia : "" },
  };
}
