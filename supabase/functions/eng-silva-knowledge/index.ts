import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      const { document_id, document_name, specialty, pdf_base64 } = body;
      console.log(`KNOWLEDGE: Processing ${document_name} (${specialty})`);

      const content: any[] = [];

      if (pdf_base64) {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdf_base64 },
        });
      }

      content.push({
        type: "text",
        text: `Analisa este documento de projecto de construção civil e gera um resumo técnico completo.

Responde APENAS com JSON (sem markdown, sem backticks):
{
  "summary": "Resumo técnico conciso do documento (máximo 300 palavras). Inclui: tipo de documento, especialidade, elementos principais, cotas/níveis, escalas, zona/área coberta, materiais e especificações.",
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
Responde em português europeu.`,
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4000,
          messages: [{ role: "user", content }],
          system: "És um engenheiro civil sénior especialista em leitura e interpretação de projectos de construção civil em Portugal. Analisa documentos técnicos e extrai toda a informação relevante de forma estruturada. Responde sempre em português europeu.",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Claude API error:", response.status, errText);
        throw new Error(`Claude API error: ${response.status}`);
      }

      const result = await response.json();
      const replyText = result.content?.[0]?.text || "{}";

      let parsed;
      try {
        const cleaned = replyText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { summary: "Não foi possível processar este documento.", key_elements: [] };
      }

      await supabase
        .from("eng_silva_project_knowledge")
        .update({
          summary: parsed.summary,
          key_elements: parsed.key_elements,
          processed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", document_id);

      console.log(`KNOWLEDGE: Processed ${document_name} — ${parsed.key_elements?.length || 0} elements`);

      return new Response(JSON.stringify({
        ok: true,
        summary: parsed.summary,
        elements_count: parsed.key_elements?.length || 0,
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
