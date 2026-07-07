import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// Modelo configuravel — default: o modelo Claude ja usado no projeto. Preparado para upgrade.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

// Limites de amostragem para o inventario (classificar nao precisa do documento inteiro)
const MAX_INVENTORY_PAGES = 90;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SAMPLE_PAGES = 30;

const DOC_TYPES = new Set([
  "planta", "corte", "alcado", "pormenor", "esquema",
  "memoria_descritiva", "mapa_quantidades", "caderno_encargos", "outro",
]);

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Primeiras 5 paginas + paginas distribuidas uniformemente ate MAX_SAMPLE_PAGES
function sampleIndices(total: number): number[] {
  const set = new Set<number>();
  for (let i = 0; i < Math.min(5, total); i++) set.add(i);
  const remaining = MAX_SAMPLE_PAGES - set.size;
  if (remaining > 0 && total > 5) {
    const step = (total - 1) / (remaining + 1);
    for (let k = 1; k <= remaining; k++) {
      set.add(Math.min(total - 1, Math.round(k * step)));
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

const INVENTORY_SYSTEM_PROMPT = `Es um engenheiro civil senior de fiscalizacao de obras em Portugal. Recebes um documento de projeto (PDF) e a tua unica tarefa e classifica-lo com rigor.
Analisa a legenda, o carimbo, os titulos das pranchas e o conteudo.
Responde APENAS com JSON valido, sem markdown, sem backticks, sem texto extra:
{
  "especialidade": "Arquitetura | Estabilidade/Estrutura | AVAC | Aguas e Esgotos | Eletricidade | ITED | SCIE/Incendio | Gas | Acustica | Termica | Paisagismo | Outra",
  "doc_type": "planta | corte | alcado | pormenor | esquema | memoria_descritiva | mapa_quantidades | caderno_encargos | outro",
  "pisos": ["lista de pisos cobertos, ex: Piso -1, Piso 0, Piso 3"],
  "zonas": ["zonas ou blocos do edificio cobertos, se identificaveis"],
  "sistema_eixos": "descricao do sistema de eixos, ex: letras A-K horizontais, numeros 1-15 verticais; null se nao identificavel",
  "escala": "ex: 1:100; null se nao identificavel",
  "summary": "2-3 frases: o que este documento contem e para que serve na analise de incompatibilidades",
  "confidence": 0.0-1.0
}
Se o documento cobrir varias especialidades, escolhe a dominante e refere as outras no summary. Nao inventes: se nao consegues identificar um campo, usa null.
Usa o NOME DO FICHEIRO e o CONTEXTO DA OBRA para identificar pisos e niveis. Se o contexto da obra definir correspondencias piso-cota ou convencoes de nomenclatura (ex: N-06 no nome = nivel -6), aplica-as obrigatoriamente. So inferes pisos por conta propria quando nem o nome nem o contexto ajudam.`;

async function callClaude(apiKey: string, pdfBase64: string, contextBlock: string): Promise<any> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: INVENTORY_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: contextBlock },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Classifica este documento conforme as instrucoes." },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errText}`);
  }

  const result = await response.json();
  if (result.stop_reason === "max_tokens") {
    throw new Error("Resposta truncada pela API (max_tokens) - documento demasiado denso para o inventario.");
  }

  const replyText = (result.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n") || "";

  const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Resposta do inventario nao e JSON valido: ${replyText.substring(0, 300)}`);
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let runId: string | null = null;
  let project: any = null;

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
      .select("id, user_id, obra_id, name, type, file_path")
      .eq("id", project_id)
      .single();
    if (projErr || !proj) throw new Error(`Projeto nao encontrado: ${projErr?.message || project_id}`);
    if (proj.user_id !== user.id) throw new Error("Sem permissao sobre este projeto");
    project = proj;

    // Carrega o contexto da obra (convencoes do fiscal - autoridade sobre pisos/cotas)
    const { data: obra, error: obraErr } = await supabase
      .from("incompaticheck_obras")
      .select("analysis_context")
      .eq("id", proj.obra_id)
      .single();
    if (obraErr) throw new Error(`Falha a carregar obra: ${obraErr.message}`);
    const analysisContext = (obra?.analysis_context ?? "").trim() || "(nenhum contexto definido)";
    const contextBlock = `NOME DO FICHEIRO: ${proj.name}\n\nCONTEXTO DA OBRA (convencoes definidas pelo fiscal - AUTORIDADE MAXIMA sobre pisos, cotas e nomenclatura; prevalece sobre qualquer inferencia tua):\n${analysisContext}`;

    // Cria run RUNNING
    const { data: run, error: runErr } = await supabase
      .from("incompaticheck_analysis_runs")
      .insert({ user_id: user.id, obra_id: proj.obra_id, project_id: proj.id, stage: "INVENTORY", status: "RUNNING" })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`Falha a criar run: ${runErr?.message}`);
    runId = run.id;

    // Descarrega PDF
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("incompaticheck-files")
      .download(proj.file_path);
    if (fileErr || !fileData) throw new Error(`Falha a descarregar PDF: ${fileErr?.message || proj.file_path}`);
    const bytes = new Uint8Array(await fileData.arrayBuffer());

    // Conta paginas; amostra se exceder limites
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const numPaginas = srcDoc.getPageCount();

    let pdfBase64: string;
    if (numPaginas > MAX_INVENTORY_PAGES || bytes.byteLength > MAX_BYTES) {
      const sample = await PDFDocument.create();
      const copied = await sample.copyPages(srcDoc, sampleIndices(numPaginas));
      copied.forEach((p) => sample.addPage(p));
      pdfBase64 = uint8ToBase64(await sample.save());
      console.log(`INVENTORY: ${proj.name} amostrado (${numPaginas} paginas totais)`);
    } else {
      pdfBase64 = uint8ToBase64(bytes);
    }

    // Classifica com Claude
    const parsed = await callClaude(anthropicKey, pdfBase64, contextBlock);

    const docType = DOC_TYPES.has(parsed.doc_type) ? parsed.doc_type : "outro";
    const especialidade = typeof parsed.especialidade === "string" && parsed.especialidade.trim()
      ? parsed.especialidade.trim() : "Outra";
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));

    // Upsert inventario DONE
    const { error: upErr } = await supabase
      .from("incompaticheck_doc_inventory")
      .upsert({
        user_id: user.id,
        obra_id: proj.obra_id,
        project_id: proj.id,
        especialidade,
        doc_type: docType,
        pisos: Array.isArray(parsed.pisos) ? parsed.pisos : [],
        zonas: Array.isArray(parsed.zonas) ? parsed.zonas : [],
        sistema_eixos: parsed.sistema_eixos ?? null,
        escala: parsed.escala ?? null,
        num_paginas: numPaginas,
        summary: parsed.summary ?? null,
        confidence,
        processing_status: "DONE",
        error_message: null,
        analyzed_at: new Date().toISOString(),
      }, { onConflict: "project_id" });
    if (upErr) throw new Error(`Falha a gravar inventario: ${upErr.message}`);

    await supabase.from("incompaticheck_analysis_runs")
      .update({ status: "DONE", stats: { paginas: numPaginas, especialidade, doc_type: docType }, finished_at: new Date().toISOString() })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, especialidade, doc_type: docType, pisos: parsed.pisos ?? [], num_paginas: numPaginas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("INVENTORY ERROR:", msg);
    if (runId) {
      await supabase.from("incompaticheck_analysis_runs")
        .update({ status: "ERROR", error_message: msg, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    if (project) {
      await supabase.from("incompaticheck_doc_inventory")
        .upsert({
          user_id: project.user_id, obra_id: project.obra_id, project_id: project.id,
          especialidade: "Desconhecida", doc_type: "outro",
          processing_status: "ERROR", error_message: msg,
        }, { onConflict: "project_id" });
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
