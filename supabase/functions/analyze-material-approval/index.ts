import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAnalysisPrompt(material_category: string): string {
  return `Analisa este Pedido de Aprovação de Materiais (PAM) para a categoria "${material_category}".

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

Sê rigoroso na análise. Se faltarem dados no PAM para uma avaliação completa, indica como "a_verificar". Se o material não cumpre as especificações, rejeita com justificação clara.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { approval_id, pdm_base64, certificates_base64, manufacturer_docs_base64, material_category, obra_id, user_id } = await req.json();

    console.log(`PAM: Analyzing material approval ${approval_id} (${material_category})`);

    // Update status to analyzing
    await supabase
      .from("material_approvals")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", approval_id);

    // Load project knowledge (MQT, Contract, specs) automatically
    const { data: knowledge } = await supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, specialty, summary, key_elements")
      .eq("obra_id", obra_id)
      .eq("user_id", user_id)
      .eq("processed", true);

    let projectContext = "";
    if (knowledge && knowledge.length > 0) {
      projectContext = "\n\nCONHECIMENTO DO PROJECTO, MQT E CONTRATO:";
      knowledge.forEach((doc: any) => {
        projectContext += `\n\n--- ${doc.specialty}: ${doc.document_name} ---`;
        projectContext += `\n${doc.summary}`;
        if (doc.key_elements && Array.isArray(doc.key_elements) && doc.key_elements.length > 0) {
          const validElements = doc.key_elements.filter((e: any) => e && e.type && e.id);
          if (validElements.length > 0) {
            projectContext += `\nElementos: ${validElements.slice(0, 10).map((e: any) => `${e.type}: ${e.id} - ${e.details || ''}`).join('; ')}`;
          }
        }
      });
    }

    // Limit context to avoid token overflow
    if (projectContext.length > 6000) {
      projectContext = projectContext.substring(0, 6000) + '\n[... contexto truncado]';
    }

    const content: any[] = [];

    // 1. Add PAM document (always)
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdm_base64 },
    });
    content.push({
      type: "text",
      text: "[PEDIDO DE APROVAÇÃO DE MATERIAIS (PAM) — documento do empreiteiro acima]",
    });

    // 2. Add certificates (if any, max 5)
    if (certificates_base64 && certificates_base64.length > 0) {
      for (const cert of certificates_base64.slice(0, 5)) {
        const isImage = cert.type && cert.type.startsWith('image/');
        content.push({
          type: isImage ? "image" : "document",
          source: { type: "base64", media_type: isImage ? cert.type : "application/pdf", data: cert.base64 },
        });
        content.push({
          type: "text",
          text: `[CERTIFICADO/LAUDO: ${cert.name}]`,
        });
      }
    }

    // 3. Add manufacturer docs (if any, max 5)
    if (manufacturer_docs_base64 && manufacturer_docs_base64.length > 0) {
      for (const mdoc of manufacturer_docs_base64.slice(0, 5)) {
        const isImage = mdoc.type && mdoc.type.startsWith('image/');
        content.push({
          type: isImage ? "image" : "document",
          source: { type: "base64", media_type: isImage ? mdoc.type : "application/pdf", data: mdoc.base64 },
        });
        content.push({
          type: "text",
          text: `[DOCUMENTO DO FABRICANTE: ${mdoc.name}]`,
        });
      }
    }

    // 4. Add project context (MQT, Contract, project specs) as TEXT + analysis prompt
    content.push({
      type: "text",
      text: `${projectContext}

Analisa este PAM considerando:
1. O pedido de aprovação do empreiteiro (documento PDF acima)
2. Os certificados e laudos fornecidos (se existirem)
3. Os documentos do fabricante (se existirem)
4. O MQT, Contrato e especificações do projecto (contexto acima, extraído do Conhecimento do Projecto)

${getAnalysisPrompt(material_category)}`,
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
        system: `És o Eng. Silva, engenheiro civil sénior com 30+ anos de experiência em fiscalização de obras em Portugal. Estás a analisar um Pedido de Aprovação de Materiais (PAM) submetido por um empreiteiro. A tua análise deve ser rigorosa, técnica e baseada nas normas portuguesas e europeias. Verifica se o material proposto cumpre as especificações do projecto e as normas aplicáveis. Responde em português europeu.`,
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
      console.error("PAM: Parse error:", replyText.substring(0, 200));
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
      console.error("PAM: Failed to save to Silva memory:", err);
    }

    console.log(`PAM: Analysis complete — ${analysis.recommendation}`);

    return new Response(JSON.stringify({ ok: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("PAM ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
