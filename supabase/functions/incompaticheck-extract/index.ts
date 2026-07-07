import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// Modelo configuravel — default: o modelo Claude ja usado no projeto. Preparado para upgrade.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const BATCH_PAGES = 40;
const MAX_BYTES = 25 * 1024 * 1024;
const MIN_CONFIDENCE = 0.3;
const INSERT_CHUNK = 500;

const ELEMENT_TYPES = new Set([
  "pilar", "viga", "laje", "sapata", "muro", "parede", "nucleo", "escada", "rampa",
  "conduta", "tubagem", "cabo", "esteira", "quadro_eletrico", "equipamento",
  "negativo", "courette", "teto_falso", "porta_cortafogo", "compartimentacao",
  "grelha", "difusor", "sprinkler", "luminaria", "outro",
]);

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Lotes [startIdx, endIdx] inclusivos (0-based)
function makeBatches(total: number): [number, number][] {
  const batches: [number, number][] = [];
  for (let s = 0; s < total; s += BATCH_PAGES) {
    batches.push([s, Math.min(total - 1, s + BATCH_PAGES - 1)]);
  }
  return batches;
}

function buildExtractionPrompt(esp: string, docType: string, pStart: number, pEnd: number): string {
  return `Es um engenheiro civil senior de fiscalizacao em Portugal com 30 anos de obra.
Recebes um documento de projeto da especialidade ${esp}, tipo ${docType},
paginas ${pStart} a ${pEnd} do documento original.
A tua tarefa e extrair TODOS os elementos fisicos identificaveis com a maxima
precisao geometrica. Le cotas, eixos, diametros, dimensoes e referencias
diretamente dos desenhos e tabelas.
REGRAS ABSOLUTAS:
1. So extrais o que consegues LER ou VER no documento. Nada inventado, nada assumido.
2. Cada elemento leva raw_evidence: o texto exato do desenho ou a descricao visual
   precisa que suporta a extracao (ex: "Viga V12 30x60 no alinhamento C, cota +3.20
   marcada junto ao pilar P8").
3. source_page e o numero ABSOLUTO da pagina no documento original.
4. Cotas em metros (converte se necessario), preservando o texto original em cota_raw.
5. confidence honesto: 0.9+ so quando a leitura e inequivoca.
6. Elementos repetidos em varias paginas: extrai uma vez, na pagina onde a informacao
   e mais completa.
Responde APENAS com JSON valido, sem markdown:
{ "elements": [ {
  "element_type": "pilar|viga|laje|sapata|muro|parede|nucleo|escada|rampa|conduta|tubagem|cabo|esteira|quadro_eletrico|equipamento|negativo|courette|teto_falso|porta_cortafogo|compartimentacao|grelha|difusor|sprinkler|luminaria|outro",
  "element_ref": "referencia no desenho, ex: V12, P3, DN400; null se sem referencia",
  "piso": "ex: Piso 3; null",
  "cota_base": numero ou null,
  "cota_topo": numero ou null,
  "cota_raw": "texto original da cota; null",
  "eixo_ref": "ex: Eixo C / entre 12-13; null",
  "dimensions": { "largura_mm": n, "altura_mm": n, "diametro_mm": n, "espessura_mm": n } ou null,
  "material": "ex: betao C30/37, aco B500B, PVC; null",
  "route": [ { "de": "...", "para": "...", "piso": "...", "cota": n } ] ou null,
  "source_page": numero,
  "source_zone": "descricao da zona da prancha, ex: quadrante superior direito, junto ao nucleo de escadas; null",
  "raw_evidence": "obrigatorio",
  "confidence": 0.0-1.0
} ] }
Se o documento for memoria descritiva ou caderno de encargos, extrai apenas elementos
com localizacao ou dimensao concreta - especificacoes gerais nao sao elementos.
Usa o CONTEXTO DA OBRA para preencher o campo piso dos elementos a partir das cotas lidas, quando o contexto definir a correspondencia. Nunca contradigas o contexto da obra.`;
}

async function callClaude(apiKey: string, pdfBase64: string, prompt: string, contextBlock: string, pStart: number, pEnd: number): Promise<any[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: prompt,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: contextBlock },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: `Extrai os elementos conforme as instrucoes. Este lote corresponde as paginas ${pStart} a ${pEnd} do documento original.` },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status} (paginas ${pStart}-${pEnd}): ${errText}`);
  }

  const result = await response.json();
  if (result.stop_reason === "max_tokens") {
    throw new Error(`Resposta truncada pela API - lote paginas ${pStart}-${pEnd} demasiado denso.`);
  }

  const replyText = (result.content || [])
    .filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || "";
  const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Resposta de extracao nao e JSON valido (paginas ${pStart}-${pEnd}): ${replyText.substring(0, 300)}`);
  }
  return Array.isArray(parsed?.elements) ? parsed.elements : [];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  let runId: string | null = null;
  let projectId: string | null = null;

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

    const { data: proj, error: projErr } = await supabase
      .from("incompaticheck_projects")
      .select("id, user_id, obra_id, name, file_path")
      .eq("id", project_id).single();
    if (projErr || !proj) throw new Error(`Projeto nao encontrado: ${projErr?.message || project_id}`);
    if (proj.user_id !== user.id) throw new Error("Sem permissao sobre este projeto");
    projectId = proj.id;

    // Estagio 0 obrigatorio
    const { data: inv } = await supabase
      .from("incompaticheck_doc_inventory")
      .select("id, especialidade, doc_type, processing_status")
      .eq("project_id", proj.id).maybeSingle();
    if (!inv || inv.processing_status !== "DONE") {
      return new Response(
        JSON.stringify({ error: "Inventario em falta - executa o Estagio 0 primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carrega o contexto da obra (convencoes do fiscal - autoridade sobre pisos/cotas)
    const { data: obra, error: obraErr } = await supabase
      .from("incompaticheck_obras")
      .select("analysis_context")
      .eq("id", proj.obra_id)
      .single();
    if (obraErr) throw new Error(`Falha a carregar obra: ${obraErr.message}`);
    const analysisContext = (obra?.analysis_context ?? "").trim() || "(nenhum contexto definido)";
    const contextBlock = `NOME DO FICHEIRO: ${proj.name}\n\nCONTEXTO DA OBRA (convencoes definidas pelo fiscal - AUTORIDADE MAXIMA sobre pisos, cotas e nomenclatura; prevalece sobre qualquer inferencia tua):\n${analysisContext}`;

    const { data: run, error: runErr } = await supabase
      .from("incompaticheck_analysis_runs")
      .insert({ user_id: user.id, obra_id: proj.obra_id, project_id: proj.id, stage: "EXTRACTION", status: "RUNNING" })
      .select("id").single();
    if (runErr || !run) throw new Error(`Falha a criar run: ${runErr?.message}`);
    runId = run.id;

    // Apaga elementos anteriores deste projeto
    const { error: delErr } = await supabase.from("incompaticheck_elements").delete().eq("project_id", proj.id);
    if (delErr) throw new Error(`Falha a limpar elementos anteriores: ${delErr.message}`);

    // Descarrega PDF
    const { data: fileData, error: fileErr } = await supabase.storage.from("incompaticheck-files").download(proj.file_path);
    if (fileErr || !fileData) throw new Error(`Falha a descarregar PDF: ${fileErr?.message || proj.file_path}`);
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = srcDoc.getPageCount();

    const needsBatching = total > BATCH_PAGES || bytes.byteLength > MAX_BYTES;
    const batches: [number, number][] = needsBatching ? makeBatches(total) : [[0, total - 1]];

    // Acumula TODOS os elementos em memoria; so insere no fim (sem inserts parciais).
    const rows: any[] = [];
    let discarded = 0;
    const porTipo: Record<string, number> = {};

    for (const [s, e] of batches) {
      let batchBase64: string;
      if (needsBatching) {
        const sub = await PDFDocument.create();
        const idx = Array.from({ length: e - s + 1 }, (_, k) => s + k);
        const copied = await sub.copyPages(srcDoc, idx);
        copied.forEach((p) => sub.addPage(p));
        batchBase64 = uint8ToBase64(await sub.save());
      } else {
        batchBase64 = uint8ToBase64(bytes);
      }

      const prompt = buildExtractionPrompt(inv.especialidade, inv.doc_type, s + 1, e + 1);
      const elements = await callClaude(anthropicKey, batchBase64, prompt, contextBlock, s + 1, e + 1);

      for (const el of elements) {
        const sourcePage = Number(el.source_page);
        if (!el.raw_evidence || typeof el.raw_evidence !== "string" || !el.raw_evidence.trim()) { discarded++; continue; }
        if (!Number.isFinite(sourcePage)) { discarded++; continue; }
        let confidence = Number(el.confidence);
        if (!Number.isFinite(confidence)) confidence = 0;
        if (confidence < MIN_CONFIDENCE) { discarded++; continue; }

        const elementType = ELEMENT_TYPES.has(el.element_type) ? el.element_type : "outro";
        porTipo[elementType] = (porTipo[elementType] || 0) + 1;

        rows.push({
          user_id: user.id, obra_id: proj.obra_id, project_id: proj.id, inventory_id: inv.id,
          especialidade: inv.especialidade, element_type: elementType,
          element_ref: el.element_ref ?? null,
          piso: el.piso ?? null,
          cota_base: Number.isFinite(Number(el.cota_base)) ? Number(el.cota_base) : null,
          cota_topo: Number.isFinite(Number(el.cota_topo)) ? Number(el.cota_topo) : null,
          cota_raw: el.cota_raw ?? null,
          eixo_ref: el.eixo_ref ?? null,
          dimensions: el.dimensions ?? null,
          material: el.material ?? null,
          route: el.route ?? null,
          source_page: sourcePage,
          source_zone: el.source_zone ?? null,
          raw_evidence: el.raw_evidence.trim(),
          confidence: Math.max(0, Math.min(1, confidence)),
        });
      }
    }

    // Insere em chunks
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error: insErr } = await supabase.from("incompaticheck_elements").insert(rows.slice(i, i + INSERT_CHUNK));
      if (insErr) throw new Error(`Falha a inserir elementos: ${insErr.message}`);
    }

    await supabase.from("incompaticheck_analysis_runs")
      .update({ status: "DONE", stats: { total_extraido: rows.length, descartados: discarded, por_tipo: porTipo }, finished_at: new Date().toISOString() })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, total_extraido: rows.length, descartados: discarded, por_tipo: porTipo }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("EXTRACT ERROR:", msg);
    // Sem inserts parciais: apaga o que possa ter sido inserido neste projeto
    if (projectId) await supabase.from("incompaticheck_elements").delete().eq("project_id", projectId);
    if (runId) {
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
