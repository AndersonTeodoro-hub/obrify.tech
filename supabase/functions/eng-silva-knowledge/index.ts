import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

async function callClaudeWithRetry(apiKey: string, content: any[], systemPrompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`KNOWLEDGE: Claude attempt ${attempt}/${maxRetries}`);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8000,
          messages: [{ role: "user", content }],
          system: systemPrompt,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`KNOWLEDGE: Claude API error (attempt ${attempt}):`, response.status, errText);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`Claude API error after ${maxRetries} attempts: ${response.status}`);
      }

      const result = await response.json();
      return result.content?.[0]?.text || "";
    } catch (err) {
      console.error(`KNOWLEDGE: Attempt ${attempt} failed:`, err);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("All retry attempts failed");
}

function normalizeMimeType(fileType: string | undefined | null): string {
  if (!fileType) return "application/pdf";
  if (fileType.includes("/")) return fileType;
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf",
  };
  return map[fileType.toLowerCase()] || "application/pdf";
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    if (action === "process_document") {
      const { document_id, document_name, specialty, file_base64, file_type, pdf_base64 } = body;
      const actualBase64 = file_base64 || pdf_base64;
      const actualType = normalizeMimeType(file_type);
      const isImage = actualType.startsWith("image/");

      console.log(`KNOWLEDGE: Processing ${document_name} (${specialty}), type: ${actualType}, isImage: ${isImage}`);

      const content: any[] = [];

      if (actualBase64) {
        if (isImage) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: actualType, data: actualBase64 },
          });
        } else {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: actualBase64 },
          });
        }
      }

      content.push({
        type: "text",
        text: `Analisa este documento de projecto de construção civil e gera um resumo técnico completo.

Responde APENAS com JSON (sem markdown, sem backticks):
{
  "summary": "Resumo técnico conciso do documento (máximo 500 palavras). Inclui: tipo de documento, especialidade, elementos principais, cotas/níveis, escalas, zona/área coberta, materiais e especificações.",
  "key_elements": [
    {"type": "pilar", "id": "P1", "details": "localização, dimensões, armadura"},
    {"type": "sapata", "id": "S1", "details": "dimensões, cota de fundo, armadura"},
    {"type": "tubagem", "id": "Ø50 MC", "details": "material, traçado, cota"},
    {"type": "cota", "id": "Nível -3.00", "details": "referência altimétrica"},
    {"type": "eixo", "id": "Eixo B", "details": "orientação e posição"},
    {"type": "material", "id": "C30/37", "details": "classe de betão, uso"},
    {"type": "norma", "id": "EN 206", "details": "referência normativa"}
  ]
}

Extrai os elementos mais relevantes — NO MÁXIMO 25 entradas em key_elements: pilares, sapatas, vigas, lajes, tubagens, caixas de visita, eixos, cotas, materiais, normas referenciadas, notas gerais, quadros de materiais.
Sê específico com IDs, cotas, dimensões e localizações.

Se o documento for um contrato, caderno de encargos, ou memória descritiva, resume a informação relevante de forma concisa, incluindo: partes envolvidas, valores, prazos, condições, especificações de materiais, marcas de referência, cláusulas importantes sobre substituição de materiais, penalidades, e qualquer informação técnica relevante.

IMPORTANTE: o summary deve ser completo e auto-suficiente. Não excedas 25 entradas em key_elements (prioriza as mais importantes) para garantir que a resposta JSON fica completa e válida.

Responde em português europeu.`,
      });

      const systemPrompt = "És um engenheiro civil sénior especialista em leitura e interpretação de projectos de construção civil em Portugal. Analisa documentos técnicos e extrai toda a informação relevante de forma estruturada. Responde sempre em português europeu. Responde APENAS com JSON válido, sem markdown nem backticks.";

      const replyText = await callClaudeWithRetry(anthropicKey, content, systemPrompt);

      // --- parsing robusto: NUNCA guardar fragmento de JSON como summary ---
      let parsed: { summary: string; key_elements: any[] } = { summary: "", key_elements: [] };
      try {
        const cleaned = replyText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.warn("KNOWLEDGE: JSON direto falhou, a tentar extrair objeto...");
        try {
          const cleaned = replyText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: "", key_elements: [] };
        } catch {
          // JSON inválido ou truncado (doc grande): não guardamos fragmento.
          // Deixamos vazio para o retry em prosa abaixo gerar um summary limpo.
          console.warn("KNOWLEDGE: JSON inválido/truncado — sem fragmento; vai para retry em prosa.");
          parsed = { summary: "", key_elements: [] };
        }
      }

      // saneamento de tipos
      if (!Array.isArray(parsed.key_elements)) parsed.key_elements = [];
      if (typeof parsed.summary !== "string") parsed.summary = "";

      // deteta summary-lixo (fragmento de JSON: começa por , { } [ ")
      const looksLikeJsonFragment = (s: string) => /^[,{}\[\]"]/.test((s || "").trim());

      // --- retry em prosa se o summary estiver vazio, curto, default ou for lixo ---
      const summaryIsBad =
        !parsed.summary ||
        parsed.summary.length < 50 ||
        parsed.summary.startsWith("Documento carregado mas a análise automática") ||
        parsed.summary === "Não foi possível processar este documento." ||
        looksLikeJsonFragment(parsed.summary);

      if (summaryIsBad) {
        console.warn("KNOWLEDGE: summary vazio/curto/lixo — retry com prompt em prosa...");
        const simpleContent = [...content.slice(0, -1), {
          type: "text",
          text: "Descreve este documento de construção civil em 3-5 parágrafos. Que tipo de documento é, que informação contém, que elementos técnicos são visíveis ou descritos. Não uses JSON, responde em texto normal em português europeu.",
        }];
        try {
          const simpleReply = await callClaudeWithRetry(anthropicKey, simpleContent,
            "És um engenheiro civil sénior. Descreve documentos técnicos de forma clara e completa em português europeu.", 2);
          if (simpleReply && simpleReply.length > 50 && !looksLikeJsonFragment(simpleReply)) {
            parsed.summary = simpleReply.substring(0, 2000);
            console.log("KNOWLEDGE: summary de prosa (fallback) recuperado com sucesso.");
          } else {
            console.error("KNOWLEDGE: fallback em prosa devolveu conteúdo inválido.");
          }
        } catch (fallbackErr) {
          console.error("KNOWLEDGE: fallback em prosa falhou:", fallbackErr);
        }
      }

      // rede final: nunca gravar vazio nem fragmento
      if (!parsed.summary || parsed.summary.length < 50 || looksLikeJsonFragment(parsed.summary)) {
        parsed.summary = "Documento carregado; o resumo automático não ficou disponível. Consultar o documento directamente.";
      }

      // Always update the record
      const updateData: Record<string, any> = {
        summary: parsed.summary || "Documento carregado. Análise pendente.",
        key_elements: parsed.key_elements || [],
        processed: true,
        updated_at: new Date().toISOString(),
      };

      if (parsed.key_elements && parsed.key_elements.length > 0) {
        updateData.document_type = "full_analysis";
      } else if (parsed.summary && parsed.summary.length > 100) {
        updateData.document_type = "text_summary";
      } else {
        updateData.document_type = "minimal";
      }

      // --- grava o resumo (agora com captura de erro: não falha em silêncio) ---
      const { error: updateError } = await supabase
        .from("eng_silva_project_knowledge")
        .update(updateData)
        .eq("id", document_id);

      if (updateError) {
        console.error(`KNOWLEDGE: UPDATE FAILED ${document_name} (${document_id}):`, updateError);
        return new Response(JSON.stringify({
          ok: false,
          stage: "update",
          error: updateError.message,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`KNOWLEDGE: Processed ${document_name} — ${parsed.key_elements?.length || 0} elements, quality: ${updateData.document_type}`);

      // --- CORREÇÃO RAIZ: embeber logo após processar, para o documento ficar
      // pesquisável pelo Eng. Silva. Sem isto, fica processado mas invisível
      // (a RPC match_knowledge_embeddings é INNER JOIN sobre os embeddings).
      // embed-document é idempotente (DELETE+INSERT) -> reprocessar é seguro.
      let embedded = false;
      let chunksEmbedded = 0;
      let embedError: string | null = null;
      try {
        const embedResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/embed-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ knowledge_id: document_id }),
        });

        if (!embedResp.ok) {
          embedError = `embed-document HTTP ${embedResp.status}: ${await embedResp.text()}`;
        } else {
          const embedJson = await embedResp.json();
          chunksEmbedded = embedJson?.chunks_embedded ?? 0;
          embedded = embedJson?.success === true && chunksEmbedded > 0;
          if (!embedded) {
            embedError = `embed-document: success=${embedJson?.success}, chunks=${chunksEmbedded}`;
          }
        }
      } catch (e) {
        embedError = e instanceof Error ? e.message : String(e);
      }

      if (embedded) {
        console.log(`KNOWLEDGE: Embedded ${document_name} — ${chunksEmbedded} chunks`);
      } else {
        console.error(`KNOWLEDGE: EMBED FAILED ${document_name} (${document_id}): ${embedError}`);
      }

      return new Response(JSON.stringify({
        ok: true,
        summary: parsed.summary,
        elements_count: parsed.key_elements?.length || 0,
        quality: updateData.document_type,
        embedded,
        chunks_embedded: chunksEmbedded,
        embed_error: embedError,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "load") {
      const { obra_id } = body;
      const { data: knowledge } = await supabase
        .from("eng_silva_project_knowledge")
        .select("document_name, specialty, summary, key_elements, processed")
        .eq("obra_id", obra_id)
        .eq("user_id", user.id)
        .eq("processed", true)
        .order("specialty");

      return new Response(JSON.stringify({ knowledge: knowledge || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("KNOWLEDGE ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
