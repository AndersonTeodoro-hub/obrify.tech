import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { approval_id, pdm_base64, mqt_base64, material_category, obra_id, user_id } = await req.json();

    console.log(`FAM: Analyzing material approval ${approval_id} (${material_category})`);

    // Update status to analyzing
    await supabase
      .from("material_approvals")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", approval_id);

    // Load project knowledge for context
    const { data: knowledge } = await supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, specialty, summary, key_elements")
      .eq("obra_id", obra_id)
      .eq("user_id", user_id)
      .eq("processed", true);

    let projectContext = "";
    if (knowledge && knowledge.length > 0) {
      projectContext = "\n\nCONHECIMENTO DO PROJECTO (documentos já analisados):";
      knowledge.forEach((doc: any) => {
        const shortSummary = doc.summary.split(' ').slice(0, 80).join(' ');
        projectContext += `\n- ${doc.document_name} (${doc.specialty}): ${shortSummary}`;
      });
    }

    const content: any[] = [];

    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdm_base64 },
    });
    content.push({
      type: "text",
      text: "[Documento acima: PEDIDO DE APROVAÇÃO DE MATERIAL (PDM) — ficha técnica do material proposto pelo empreiteiro]",
    });

    if (mqt_base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: mqt_base64 },
      });
      content.push({
        type: "text",
        text: "[Documento acima: MAPA DE QUANTIDADES E TRABALHOS (MQT) — especificações e materiais definidos no projecto]",
      });
    }

    content.push({
      type: "text",
      text: `Analisa este Pedido de Aprovação de Material (PDM/FAM) para a categoria "${material_category}".
${projectContext}

Compara o material proposto no PDM com:
1. As especificações do MQT (se fornecido)
2. O conhecimento do projecto que tens em memória
3. As normas portuguesas e europeias aplicáveis

Responde APENAS com JSON (sem markdown, sem backticks):
{
  "recommendation": "approved" | "approved_with_reservations" | "rejected",
  "confidence": 85,
  "material_proposed": {
    "name": "nome do material proposto",
    "manufacturer": "fabricante",
    "model": "modelo/referência",
    "specifications": ["especificação 1", "especificação 2"]
  },
  "material_specified": {
    "description": "o que está especificado no projecto/MQT para esta categoria",
    "requirements": ["requisito 1", "requisito 2"]
  },
  "compliance_checks": [
    {
      "aspect": "Resistência mecânica",
      "status": "conforme" | "não_conforme" | "a_verificar",
      "detail": "explicação"
    }
  ],
  "issues": ["problema identificado (se houver)"],
  "conditions": ["condição para aprovação (se aplicável)"],
  "justification": "Justificação completa da recomendação em 3-5 frases.",
  "norms_referenced": ["EN 206", "NP EN 10080"]
}

Sê rigoroso na análise. Se faltarem dados no PDM para uma avaliação completa, indica como "a_verificar". Se o material não cumpre as especificações, rejeita com justificação clara.`,
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
        system: `És o Eng. Silva, engenheiro civil sénior com 30+ anos de experiência em fiscalização de obras em Portugal. Estás a analisar um Pedido de Aprovação de Material (PDM/FAM) submetido por um empreiteiro. A tua análise deve ser rigorosa, técnica e baseada nas normas portuguesas e europeias. Verifica se o material proposto cumpre as especificações do projecto e as normas aplicáveis. Responde em português europeu.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const replyText = result.content?.[0]?.text || "{}";

    let analysis;
    try {
      const cleaned = replyText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      console.error("FAM: Parse error:", replyText.substring(0, 200));
      analysis = {
        recommendation: "approved_with_reservations",
        justification: "Não foi possível processar a análise automaticamente. Revisão manual necessária.",
        compliance_checks: [],
        issues: ["Erro no processamento automático"],
        conditions: ["Revisão manual obrigatória"],
      };
    }

    // Update the approval record
    await supabase
      .from("material_approvals")
      .update({
        status: analysis.recommendation,
        ai_analysis: analysis,
        ai_recommendation: analysis.justification,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approval_id);

    // Save summary to Eng. Silva memory
    try {
      const materialName = analysis.material_proposed?.name || material_category;
      const manufacturer = analysis.material_proposed?.manufacturer || "N/A";
      const shortJustification = (analysis.justification || "").split('.').slice(0, 2).join('.');

      const supabaseAnonUrl = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${supabaseAnonUrl}/functions/v1/eng-silva-memory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          action: "add_summary",
          summary: `Aprovação de material (${material_category}): ${materialName} do fabricante ${manufacturer} — ${analysis.recommendation}. ${shortJustification}`,
        }),
      });
    } catch (err) {
      console.error("FAM: Failed to save to Silva memory:", err);
    }

    console.log(`FAM: Analysis complete — ${analysis.recommendation}`);

    return new Response(JSON.stringify({ ok: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("FAM ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
