import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Modelo configuravel — default: o modelo Claude ja usado no projeto. Preparado para upgrade.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const MAX_ELEMENTS = 300; // acima disto, lotes por piso
const MIN_CONFIDENCE = 0.3;
const INSERT_CHUNK = 500;
const EVIDENCE_CHARS = 300; // evidencia textual e critica na analise isolada (carrega especificacoes)

const TIPO_PROBLEMA = new Set([
  "cotas_divergentes", "especificacao_invalida", "regulamentar", "referencia_inconsistente",
  "dimensao_implausivel", "duplicacao_contraditoria", "outro",
]);
const SEVERITIES = new Set(["alta", "media", "baixa"]);

function buildSystemPrompt(especialidade: string, docType: string, nome: string, analysisContext: string): string {
  return `Es um engenheiro civil senior de fiscalizacao de obras em Portugal com mais de 20 anos de experiencia em revisao de projetos. Recebes os ELEMENTOS EXTRAIDOS de UM UNICO documento de projeto (${especialidade}, tipo ${docType}, ficheiro ${nome}), e a tua tarefa e detectar INCOERENCIAS INTERNAS do proprio documento.

CONTEXTO DA OBRA (autoridade maxima sobre pisos, cotas e convencoes):
${analysisContext}

CHECKLIST DE COERENCIA INTERNA (verifica cada ponto sistematicamente):
- Cotas divergentes: o mesmo elemento ou alinhamento com cotas diferentes em sitios diferentes do documento; somas que nao batem (cota base + altura != cota topo)
- Especificacoes tecnicamente invalidas: combinacoes impossiveis ou nao conformes (ex classico: porta corta-fogo especificada como "de correr" - portas corta-fogo em caminhos de evacuacao devem ser de batente com abertura no sentido da fuga, salvo sistemas certificados especificos; assinala para verificacao)
- Regulamentar (SCIE, RGEU, acessibilidades): larguras de vaos de evacuacao, sentidos de abertura, pes-direitos minimos, guardas - quando os dados extraidos permitem verificar numeros concretos
- Referencias inconsistentes: a mesma referencia (ex: V12, P3) com dimensoes ou materiais diferentes em ocorrencias distintas
- Dimensoes implausiveis: valores fora de qualquer gama construtiva razoavel (provavel erro de desenho ou de cota)
- Duplicacoes contraditorias: dois elementos no mesmo local com dados incompativeis

REGRAS DE SENSO CONSTRUTIVO (verifica ANTES de reportar cada finding):
1. A diferenca entre cota estrutural (tosco) e cota de acabado definida no CONTEXTO DA OBRA e NORMAL e ESPERADA. Nunca a reportes como incoerencia. Qualquer finding de cotas mostra o calculo explicito na description.
2. Fundacoes, sapatas e muros arrancam ABAIXO da laje que suportam - normal.
3. Ausencia de informacao NAO e incoerencia. Se a justificacao contem "nao ha informacao sobre", descarta.
4. Na duvida, NAO reportes. Um finding que um engenheiro senior rejeitaria a primeira leitura destroi a credibilidade do relatorio inteiro.

REGRAS ABSOLUTAS:
1. Baseia-te EXCLUSIVAMENTE nos elementos fornecidos e no contexto da obra.
2. element_a_id obrigatorio (id EXATO fornecido); element_b_id apenas quando o conflito e entre dois elementos do documento (ex: cotas divergentes); null nos restantes casos.
3. Findings com ids inventados serao descartados.
4. recommendation: accao concreta de revisao de projeto (ex: "corrigir cota do alcado para 24.95 conforme planta" ou "alterar especificacao da porta PC-3 para batente com barra antipanico"), nunca "consultar o projectista".
5. Responde em portugues europeu.

Responde APENAS com JSON valido, sem markdown:
{ "findings": [ {
  "tipo_problema": "cotas_divergentes|especificacao_invalida|regulamentar|referencia_inconsistente|dimensao_implausivel|duplicacao_contraditoria|outro",
  "severity": "alta|media|baixa",
  "title": "...", "description": "... (com calculo quando envolver cotas)",
  "impact": "...", "location": "piso, eixo, cota",
  "recommendation": "...",
  "element_a_id": "uuid exato", "element_b_id": "uuid exato ou null",
  "confidence": 0.0-1.0
} ] }
Se nao detectares incoerencias, responde { "findings": [] }.`;
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

interface Batch { label: string; els: any[]; }

function buildBatches(els: any[]): Batch[] {
  if (els.length <= MAX_ELEMENTS) {
    return [{ label: "documento completo", els }];
  }
  // Lotes por piso; elementos sem piso num lote proprio.
  const pisos = new Set<string>();
  for (const e of els) if (e.piso) pisos.add(e.piso);
  const batches: Batch[] = [];
  for (const piso of Array.from(pisos).sort()) {
    const sub = els.filter((e) => e.piso === piso);
    if (sub.length === 0) continue;
    batches.push({ label: piso, els: sub });
  }
  const nulls = els.filter((e) => !e.piso);
  if (nulls.length > 0) batches.push({ label: "sem piso", els: nulls });
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
    throw new Error(`Resposta de analise isolada nao e JSON valido (lote ${label}): ${replyText.substring(0, 300)}`);
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

    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id em falta");

    // Carrega projeto e valida posse
    const { data: proj, error: projErr } = await supabase
      .from("incompaticheck_projects")
      .select("id, user_id, obra_id, name")
      .eq("id", project_id).single();
    if (projErr || !proj) throw new Error(`Projeto nao encontrado: ${projErr?.message || project_id}`);
    if (proj.user_id !== user.id) throw new Error("Sem permissao sobre este projeto");

    // Inventario DONE obrigatorio
    const { data: inv } = await supabase
      .from("incompaticheck_doc_inventory")
      .select("especialidade, doc_type, processing_status")
      .eq("project_id", proj.id).maybeSingle();
    if (!inv || inv.processing_status !== "DONE") {
      return new Response(
        JSON.stringify({ error: "Inventario em falta - executa o Estagio 0 primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Contexto da obra
    const { data: obra, error: obraErr } = await supabase
      .from("incompaticheck_obras")
      .select("analysis_context")
      .eq("id", proj.obra_id).single();
    if (obraErr) throw new Error(`Falha a carregar obra: ${obraErr.message}`);
    const analysisContext = (obra?.analysis_context ?? "").trim() || "(nenhum contexto definido)";

    // Cria run RUNNING
    const { data: run, error: runErr } = await supabase
      .from("incompaticheck_analysis_runs")
      .insert({ user_id: user.id, obra_id: proj.obra_id, project_id: proj.id, stage: "SELF", status: "RUNNING", stats: { projeto: proj.name } })
      .select("id").single();
    if (runErr || !run) throw new Error(`Falha a criar run: ${runErr?.message}`);
    runId = run.id;

    // Carrega elementos do projeto
    const { data: els, error: elsErr } = await supabase
      .from("incompaticheck_elements")
      .select("id, especialidade, element_type, element_ref, piso, cota_base, cota_topo, cota_raw, eixo_ref, dimensions, material, route, source_page, raw_evidence, confidence")
      .eq("project_id", proj.id);
    if (elsErr) throw new Error(`Falha a carregar elementos: ${elsErr.message}`);

    if (!els || els.length === 0) {
      const msg = "Sem elementos extraidos - corre a extracao primeiro.";
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apaga findings anteriores do projeto
    const del = await supabase.from("incompaticheck_self_findings").delete().eq("project_id", proj.id);
    if (del.error) throw new Error(`Falha a limpar findings anteriores: ${del.error.message}`);

    const ids = new Set(els.map((e) => e.id));
    const systemPrompt = buildSystemPrompt(inv.especialidade, inv.doc_type, proj.name, analysisContext);
    const batches = buildBatches(els);

    // Acumula findings validados de todos os lotes; so insere no fim (sem inserts parciais).
    const rows: any[] = [];
    let discarded = 0;
    const porSeveridade: Record<string, number> = {};

    for (const batch of batches) {
      const userContent =
        `ELEMENTOS DO DOCUMENTO (JSON): ${JSON.stringify(serializeEls(batch.els))}\n\n` +
        `Lote: ${batch.label}`;

      const findings = await callClaude(anthropicKey, systemPrompt, userContent, batch.label);

      for (const f of findings) {
        const aId = f.element_a_id;
        if (!aId || !ids.has(aId)) { discarded++; continue; }
        const bId = f.element_b_id ?? null;
        if (bId !== null && !ids.has(bId)) { discarded++; continue; }
        const title = (f.title || "").trim();
        const description = (f.description || "").trim();
        if (!title || !description) { discarded++; continue; }
        let confidence = Number(f.confidence);
        if (!Number.isFinite(confidence)) confidence = 0;
        if (confidence < MIN_CONFIDENCE) { discarded++; continue; }

        const tipo = TIPO_PROBLEMA.has(f.tipo_problema) ? f.tipo_problema : "outro";
        const severity = SEVERITIES.has(f.severity) ? f.severity : "media";
        porSeveridade[severity] = (porSeveridade[severity] || 0) + 1;

        rows.push({
          user_id: user.id, obra_id: proj.obra_id, project_id: proj.id, run_id: runId,
          especialidade: inv.especialidade,
          tipo_problema: tipo, severity, title, description,
          impact: f.impact ?? null, location: f.location ?? null, recommendation: f.recommendation ?? null,
          element_a_id: aId, element_b_id: bId,
          confidence: Math.max(0, Math.min(1, confidence)),
        });
      }
    }

    // Insere em chunks
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error: insErr } = await supabase.from("incompaticheck_self_findings").insert(rows.slice(i, i + INSERT_CHUNK));
      if (insErr) throw new Error(`Falha a inserir findings: ${insErr.message}`);
    }

    await supabase.from("incompaticheck_analysis_runs")
      .update({
        status: "DONE",
        stats: { projeto: proj.name, total: rows.length, descartados: discarded, por_severidade: porSeveridade, lotes: batches.map((b) => b.label) },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, total: rows.length, descartados: discarded, por_severidade: porSeveridade, lotes: batches.map((b) => b.label) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("SELF-ANALYZE ERROR:", msg);
    if (runId) {
      await supabase.from("incompaticheck_self_findings").delete().eq("run_id", runId);
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
