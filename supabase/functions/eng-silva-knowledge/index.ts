import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
          max_tokens: 6000,
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

Extrai TODOS os elementos identificáveis: pilares, sapatas, vigas, lajes, tubagens, caixas de visita, eixos, cotas, materiais, normas referenciadas, notas gerais, quadros de materiais.
Sê específico com IDs, cotas, dimensões e localizações.

Se o documento for um contrato, caderno de encargos, ou memória descritiva, extrai TODA a informação relevante incluindo: partes envolvidas, valores, prazos, condições, especificações de materiais, marcas de referência, cláusulas importantes sobre substituição de materiais, penalidades, e qualquer informação técnica relevante.

Responde em português europeu.`,
      });

      const systemPrompt = "És um engenheiro civil sénior especialista em leitura e interpretação de projectos de construção civil em Portugal. Analisa documentos técnicos e extrai toda a informação relevante de forma estruturada. Responde sempre em português europeu. Responde APENAS com JSON válido, sem markdown nem backticks.";

      const replyText = await callClaudeWithRetry(anthropicKey, content, systemPrompt);

      // 3-tier JSON parsing
      let parsed: { summary: string; key_elements: any[] };
      try {
        const cleaned = replyText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.warn("KNOWLEDGE: Standard JSON parse failed, trying regex extraction...");
        try {
          const jsonMatch = replyText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found");
          }
        } catch {
          console.warn("KNOWLEDGE: JSON extraction failed, using raw text as summary");
          const cleanText = replyText
            .replace(/```json\s*/g, '').replace(/```\s*/g, '')
            .replace(/\{[\s\S]*\}/g, '')
            .trim();

          parsed = {
            summary: cleanText.length > 50
              ? cleanText.substring(0, 2000)
              : "Documento carregado mas a análise automática não gerou resumo estruturado. O documento está disponível para consulta directa.",
            key_elements: [],
          };
        }
      }

      // Validate summary quality — fallback to simpler prompt if needed
      if (!parsed.summary || parsed.summary === "Não foi possível processar este documento." || parsed.summary.length < 20) {
        console.warn("KNOWLEDGE: Summary too short or default error, retrying with simpler prompt...");

        const simpleContent = [...content.slice(0, -1), {
          type: "text",
          text: "Descreve este documento de construção civil em 3-5 parágrafos. Que tipo de documento é, que informação contém, que elementos técnicos são visíveis ou descritos. Não uses JSON, responde em texto normal em português europeu.",
        }];

        try {
          const simpleReply = await callClaudeWithRetry(anthropicKey, simpleContent,
            "És um engenheiro civil sénior. Descreve documentos técnicos de forma clara e completa em português europeu.", 2);
          if (simpleReply && simpleReply.length > 50) {
            parsed.summary = simpleReply.substring(0, 2000);
            console.log("KNOWLEDGE: Fallback text summary succeeded");
          }
        } catch (fallbackErr) {
          console.error("KNOWLEDGE: Fallback also failed:", fallbackErr);
        }
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

      await supabase
        .from("eng_silva_project_knowledge")
        .update(updateData)
        .eq("id", document_id);

      console.log(`KNOWLEDGE: Processed ${document_name} — ${parsed.key_elements?.length || 0} elements, quality: ${updateData.document_type}`);

      return new Response(JSON.stringify({
        ok: true,
        summary: parsed.summary,
        elements_count: parsed.key_elements?.length || 0,
        quality: updateData.document_type,
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
  } catch (error) {
    console.error("KNOWLEDGE ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
