import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Modelo configuravel — default: o modelo Claude ja usado no projeto. Preparado para upgrade.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const MAX_COMBINED_ELEMENTS = 300; // acima disto, lotes por piso
const MIN_CONFIDENCE = 0.3;
const INSERT_CHUNK = 500;
const EVIDENCE_CHARS = 200;

const TIPO_CONFLITO = new Set([
  "intersecao", "incoerencia_cotas", "ausencia_negativo", "espaco_insuficiente",
  "sequencia_construtiva", "regulamentar", "incoerencia_geometrica", "outro",
]);
const SEVERITIES = new Set(["alta", "media", "baixa"]);

// ---- Matriz de verificacao (checklists por par) ----
const CHECKLIST_ESTRUTURA_AVAC = `- Condutas que atravessam vigas, lajes ou muros sem negativo previsto (compara tracados/routes e cotas das condutas com posicao e cotas dos elementos estruturais)
- Diametro/seccao da conduta vs dimensao do negativo (folga minima de execucao)
- Espaco entre face inferior de viga e teto falso insuficiente para a conduta (compara cota_base de vigas com cotas de condutas e tetos falsos)
- Equipamentos AVAC pesados sobre lajes sem indicacao de reforco
- Cotas de insercao incompativeis no mesmo piso/eixo`;

const CHECKLIST_ESTRUTURA_AGUAS = `- Tubagens que atravessam elementos estruturais sem negativo
- Pendentes de esgoto vs cotas estruturais disponiveis (colector precisa de queda; verifica se as cotas de inicio/fim do route sao compativeis)
- Courettes/prumadas desalinhadas entre pisos face aos elementos estruturais
- Tubagens enterradas vs sapatas/muros de fundacao (cotas de fundacao vs cotas de rede)`;

const CHECKLIST_ESTRUTURA_ARQUITETURA = `- Incoerencia de cotas entre estrutural e acabado (usa o contexto da obra para a diferenca esperada; desvios diferentes dessa diferenca sao findings)
- Paredes de arquitetura sem apoio estrutural correspondente / pilares que aparecem dentro de vaos ou circulacoes da arquitetura
- Pe-direito livre: cota_base de vigas vs cotas de tetos falsos e vaos de portas
- Escadas e rampas: coerencia geometrica entre as duas especialidades
- Negativos/courettes da arquitetura sem correspondencia na estrutura`;

const CHECKLIST_ARQUITETURA_AVAC = `- Espaco em teto falso insuficiente para condutas + isolamento
- Grelhas e difusores em tetos/paredes sem conduta que os sirva no tracado
- Condutas a atravessar compartimentos sem registo indicado`;

const CHECKLIST_SCIE_QUALQUER = `- Atravessamentos de compartimentacao corta-fogo por condutas/tubagens/cabos sem selagem ou registo corta-fogo identificado
- Portas corta-fogo vs vaos e paredes das outras especialidades
- Sprinklers vs elementos que os obstruem (vigas, condutas, tetos)`;

const CHECKLIST_GENERICA = `- Elementos das duas especialidades a ocupar o mesmo espaco (mesmo piso, mesmo eixo/zona, cotas sobrepostas)
- Incoerencias de cotas entre especialidades no mesmo piso
- Elementos de uma especialidade que pressupoem elementos da outra que nao existem`;

// Chave normalizada (ordem estavel das duas especialidades) usada na construcao E na consulta.
function pairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join("|");
}

const MATRIZ_VERIFICACAO = new Map<string, string>([
  [pairKey("Estabilidade/Estrutura", "AVAC"), CHECKLIST_ESTRUTURA_AVAC],
  [pairKey("Estabilidade/Estrutura", "Aguas e Esgotos"), CHECKLIST_ESTRUTURA_AGUAS],
  [pairKey("Estabilidade/Estrutura", "Arquitetura"), CHECKLIST_ESTRUTURA_ARQUITETURA],
  [pairKey("Arquitetura", "AVAC"), CHECKLIST_ARQUITETURA_AVAC],
]);

function getChecklist(a: string, b: string): string {
  if (a === "SCIE/Incendio" || b === "SCIE/Incendio") return CHECKLIST_SCIE_QUALQUER;
  return MATRIZ_VERIFICACAO.get(pairKey(a, b)) || CHECKLIST_GENERICA;
}

function buildSystemPrompt(espA: string, espB: string, analysisContext: string, checklist: string): string {
  return `Es um engenheiro civil senior de fiscalizacao de obras em Portugal com 30 anos de experiencia em coordenacao de projetos. Recebes os ELEMENTOS EXTRAIDOS de duas especialidades da mesma obra (${espA} e ${espB}), em formato estruturado com identificadores, e a tua tarefa e detectar INCOMPATIBILIDADES entre elas.

CONTEXTO DA OBRA (autoridade maxima sobre pisos, cotas e convencoes):
${analysisContext}

CHECKLIST DE VERIFICACAO PARA ESTE PAR (verifica cada ponto sistematicamente):
${checklist}

REGRAS DE SENSO CONSTRUTIVO (verifica ANTES de reportar cada finding):
1. A diferenca entre cota estrutural (tosco) e cota de acabado definida no CONTEXTO DA OBRA e NORMAL e ESPERADA. So reportas diferenca de cotas entre especialidades quando ela e DIFERENTE da diferenca esperada do contexto - e mostras SEMPRE o calculo explicito na description.
2. Fundacoes, sapatas e muros arrancam ABAIXO da laje que suportam - normal, nao e conflito.
3. Ausencia de informacao NAO e incompatibilidade. Se a justificacao contem "nao ha informacao sobre", descarta.
4. Na duvida, NAO reportes. Um finding que um engenheiro senior rejeitaria a primeira leitura destroi a credibilidade do relatorio inteiro.

REGRAS ABSOLUTAS:
1. Baseia-te EXCLUSIVAMENTE nos elementos fornecidos e no contexto da obra. Nao inventes elementos, cotas ou dimensoes que nao estejam nos dados.
2. Cada finding referencia element_a_id (obrigatorio, de ${espA}) e element_b_id (de ${espB}; null apenas em conflitos de AUSENCIA, explicando o que falta).
3. Usa os ids EXATOS fornecidos. Findings com ids inventados serao descartados.
4. Compara cotas com atencao a convencao do contexto da obra (estrutural vs acabado).
5. Se os dados nao permitem confirmar um conflito, nao o reportes - confidence honesto, sem especulacao. Poucos findings solidos valem mais que muitos fracos.
6. location: piso + eixo + cota, o mais preciso possivel a partir dos elementos.
7. recommendation: solucao pratica de obra (ex: "prever negativo 250x250mm na viga V12 para conduta DN200, com reforco conforme EC2"), nunca "consultar projectista".
8. Responde em portugues europeu.

Responde APENAS com JSON valido, sem markdown:
{ "findings": [ {
  "tipo_conflito": "intersecao|incoerencia_cotas|ausencia_negativo|espaco_insuficiente|sequencia_construtiva|regulamentar|incoerencia_geometrica|outro",
  "severity": "alta|media|baixa",
  "title": "titulo curto e concreto",
  "description": "descricao tecnica: que elemento conflitua com que elemento, com cotas e dimensoes concretas dos dados",
  "impact": "consequencia pratica em obra se nao for resolvido",
  "location": "piso, eixo, cota",
  "recommendation": "solucao concreta e executavel",
  "constructability_note": "efeito na sequencia de obra, acessos, tolerancias; null se nao aplicavel",
  "element_a_id": "uuid exato de um elemento de ${espA}",
  "element_b_id": "uuid exato de um elemento de ${espB} ou null (so em ausencia)",
  "confidence": 0.0-1.0
} ] }
Se nao detectares incompatibilidades neste lote, responde { "findings": [] }.`;
}

function serializeEls(els: any[]): any[] {
  return els.map((e) => ({
    id: e.id,
    element_type: e.element_type,
    element_ref: e.element_ref,
    piso: e.piso,
    cota_base: e.cota_base,
    cota_topo: e.cota_topo,
    cota_raw: e.cota_raw,
    eixo_ref: e.eixo_ref,
    dimensions: e.dimensions,
    material: e.material,
    route: e.route,
    raw_evidence: (e.raw_evidence || "").substring(0, EVIDENCE_CHARS),
  }));
}

interface Batch { label: string; aEls: any[]; bEls: any[]; }

function buildBatches(elemsA: any[], elemsB: any[]): Batch[] {
  const combined = elemsA.length + elemsB.length;
  if (combined <= MAX_COMBINED_ELEMENTS) {
    return [{ label: "obra completa", aEls: elemsA, bEls: elemsB }];
  }
  // Lotes por piso; elementos sem piso num lote proprio.
  // Tradeoff conhecido: conflitos entre pisos diferentes nao sao cruzados neste modo (necessario para a escala).
  const pisos = new Set<string>();
  for (const e of [...elemsA, ...elemsB]) if (e.piso) pisos.add(e.piso);
  const batches: Batch[] = [];
  for (const piso of Array.from(pisos).sort()) {
    const aEls = elemsA.filter((e) => e.piso === piso);
    const bEls = elemsB.filter((e) => e.piso === piso);
    // element_a_id e obrigatorio (de ESP_A): sem elementos A, nenhum finding e possivel.
    if (aEls.length === 0) continue;
    batches.push({ label: piso, aEls, bEls });
  }
  const aNull = elemsA.filter((e) => !e.piso);
  const bNull = elemsB.filter((e) => !e.piso);
  if (aNull.length > 0) batches.push({ label: "sem piso", aEls: aNull, bEls: bNull });
  return batches;
}

async function callClaude(apiKey: string, systemPrompt: string, userContent: string, label: string): Promise<any[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userContent }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status} (lote ${label}): ${errText}`);
  }

  const result = await response.json();
  if (result.stop_reason === "max_tokens") {
    throw new Error(`Resposta truncada pela API - lote ${label} demasiado denso.`);
  }

  const replyText = (result.content || [])
    .filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || "";
  const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Resposta de cruzamento nao e JSON valido (lote ${label}): ${replyText.substring(0, 300)}`);
  }
  return Array.isArray(parsed?.findings) ? parsed.findings : [];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  let runId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { obra_id, especialidade_a, especialidade_b } = await req.json();
    if (!obra_id || !especialidade_a || !especialidade_b) throw new Error("obra_id, especialidade_a e especialidade_b sao obrigatorios");
    if (especialidade_a === especialidade_b) throw new Error("Par invalido: especialidades iguais");
    const espA = especialidade_a as string;
    const espB = especialidade_b as string;

    // Valida posse da obra + carrega contexto
    const { data: obra, error: obraErr } = await supabase
      .from("incompaticheck_obras")
      .select("user_id, analysis_context")
      .eq("id", obra_id)
      .single();
    if (obraErr || !obra) throw new Error(`Obra nao encontrada: ${obraErr?.message || obra_id}`);
    if (obra.user_id !== user.id) throw new Error("Sem permissao sobre esta obra");
    const analysisContext = (obra.analysis_context ?? "").trim() || "(nenhum contexto definido)";

    // Cria run RUNNING
    const { data: run, error: runErr } = await supabase
      .from("incompaticheck_analysis_runs")
      .insert({ user_id: user.id, obra_id, stage: "CROSS", status: "RUNNING", stats: { par: `${espA} x ${espB}` } })
      .select("id").single();
    if (runErr || !run) throw new Error(`Falha a criar run: ${runErr?.message}`);
    runId = run.id;

    // Carrega elementos das duas especialidades
    const { data: allEls, error: elsErr } = await supabase
      .from("incompaticheck_elements")
      .select("id, especialidade, element_type, element_ref, piso, cota_base, cota_topo, cota_raw, eixo_ref, dimensions, material, route, source_page, raw_evidence, confidence")
      .eq("obra_id", obra_id)
      .in("especialidade", [espA, espB]);
    if (elsErr) throw new Error(`Falha a carregar elementos: ${elsErr.message}`);

    const elemsA = (allEls || []).filter((e) => e.especialidade === espA);
    const elemsB = (allEls || []).filter((e) => e.especialidade === espB);

    if (elemsA.length === 0 || elemsB.length === 0) {
      const faltante = elemsA.length === 0 ? espA : espB;
      const msg = `Sem elementos extraidos para ${faltante} - corre a extracao primeiro.`;
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apaga findings anteriores do par (nos dois sentidos)
    const del1 = await supabase.from("incompaticheck_cross_findings").delete()
      .eq("obra_id", obra_id).eq("especialidade_a", espA).eq("especialidade_b", espB);
    if (del1.error) throw new Error(`Falha a limpar findings anteriores (A-B): ${del1.error.message}`);
    const del2 = await supabase.from("incompaticheck_cross_findings").delete()
      .eq("obra_id", obra_id).eq("especialidade_a", espB).eq("especialidade_b", espA);
    if (del2.error) throw new Error(`Falha a limpar findings anteriores (B-A): ${del2.error.message}`);

    // Conjuntos globais de ids para validacao dura
    const idsA = new Set(elemsA.map((e) => e.id));
    const idsB = new Set(elemsB.map((e) => e.id));

    const checklist = getChecklist(espA, espB);
    const systemPrompt = buildSystemPrompt(espA, espB, analysisContext, checklist);
    const batches = buildBatches(elemsA, elemsB);

    // Acumula findings validados de todos os lotes; so insere no fim (sem inserts parciais).
    const rows: any[] = [];
    let discarded = 0;
    const porSeveridade: Record<string, number> = {};

    for (const batch of batches) {
      const userContent =
        `ELEMENTOS DE ${espA} (JSON): ${JSON.stringify(serializeEls(batch.aEls))}\n\n` +
        `ELEMENTOS DE ${espB} (JSON): ${JSON.stringify(serializeEls(batch.bEls))}\n\n` +
        `Lote: ${batch.label}`;

      const findings = await callClaude(anthropicKey, systemPrompt, userContent, batch.label);

      for (const f of findings) {
        const aId = f.element_a_id;
        if (!aId || !idsA.has(aId)) { discarded++; continue; }
        const bId = f.element_b_id ?? null;
        if (bId !== null && !idsB.has(bId)) { discarded++; continue; }
        const title = (f.title || "").trim();
        const description = (f.description || "").trim();
        if (!title || !description) { discarded++; continue; }
        let confidence = Number(f.confidence);
        if (!Number.isFinite(confidence)) confidence = 0;
        if (confidence < MIN_CONFIDENCE) { discarded++; continue; }

        const tipo = TIPO_CONFLITO.has(f.tipo_conflito) ? f.tipo_conflito : "outro";
        const severity = SEVERITIES.has(f.severity) ? f.severity : "media";
        porSeveridade[severity] = (porSeveridade[severity] || 0) + 1;

        rows.push({
          user_id: user.id, obra_id, run_id: runId,
          especialidade_a: espA, especialidade_b: espB,
          tipo_conflito: tipo, severity, title, description,
          impact: f.impact ?? null, location: f.location ?? null,
          recommendation: f.recommendation ?? null, constructability_note: f.constructability_note ?? null,
          element_a_id: aId, element_b_id: bId,
          confidence: Math.max(0, Math.min(1, confidence)),
        });
      }
    }

    // Insere em chunks
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error: insErr } = await supabase.from("incompaticheck_cross_findings").insert(rows.slice(i, i + INSERT_CHUNK));
      if (insErr) throw new Error(`Falha a inserir findings: ${insErr.message}`);
    }

    await supabase.from("incompaticheck_analysis_runs")
      .update({
        status: "DONE",
        stats: { par: `${espA} x ${espB}`, total_findings: rows.length, descartados: discarded, por_severidade: porSeveridade, lotes: batches.map((b) => b.label) },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, total_findings: rows.length, descartados: discarded, por_severidade: porSeveridade, lotes: batches.map((b) => b.label) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("CROSS-ANALYZE ERROR:", msg);
    // Sem inserts parciais: apaga o que possa ter sido inserido neste run
    if (runId) {
      await supabase.from("incompaticheck_cross_findings").delete().eq("run_id", runId);
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
