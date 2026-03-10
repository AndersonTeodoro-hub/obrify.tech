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

    const body = await req.json();
    const approval_id = body.approval_id;
    const pdm_base64 = body.pdm_base64;
    const mqt_base64 = body.mqt_base64 || null;
    const contract_base64 = body.contract_base64 || null;
    const certificates_base64 = body.certificates_base64 || [];
    const manufacturer_docs_base64 = body.manufacturer_docs_base64 || [];
    const material_category = body.material_category;
    const obra_id = body.obra_id;

    console.log("PAM: Request received:", JSON.stringify({
      approval_id, obra_id, material_category,
      has_pdm: !!pdm_base64,
      has_mqt: !!mqt_base64,
      has_contract: !!contract_base64,
      certs: certificates_base64?.length || 0,
      mfg_docs: manufacturer_docs_base64?.length || 0,
    }));

    if (!approval_id || !pdm_base64 || !material_category || !obra_id) {
      throw new Error("Missing required fields: approval_id, pdm_base64, material_category, obra_id");
    }

    // Update status to analyzing
    await supabase
      .from("material_approvals")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", approval_id);

    const content: any[] = [];

    // 1. PAM document (always)
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdm_base64 },
    });
    content.push({
      type: "text",
      text: "[PEDIDO DE APROVAÇÃO DE MATERIAIS (PAM) — documento do empreiteiro acima]",
    });

    // 2. MQT document (if provided)
    if (mqt_base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: mqt_base64 },
      });
      content.push({
        type: "text",
        text: "[MQT / CADERNO DE ENCARGOS — mapa de quantidades e trabalhos do projecto]",
      });
    }

    // 3. Contract document (if provided)
    if (contract_base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: contract_base64 },
      });
      content.push({
        type: "text",
        text: "[CONTRATO DA OBRA — contrato de empreitada]",
      });
    }

    // 4. Certificates (max 5)
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

    // 5. Manufacturer docs (max 5)
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

    // 6. Analysis prompt
    let contextNote = "";
    if (mqt_base64 && contract_base64) {
      contextNote = "Foram fornecidos o MQT/Caderno de Encargos e o Contrato da Obra. Compara o material proposto com as especificações destes documentos.";
    } else if (mqt_base64) {
      contextNote = "Foi fornecido o MQT/Caderno de Encargos. Compara o material proposto com as especificações deste documento.";
    } else if (contract_base64) {
      contextNote = "Foi fornecido o Contrato da Obra. Verifica se o material proposto cumpre os requisitos contratuais.";
    } else {
      contextNote = "Não foram fornecidos MQT nem Contrato. Analisa o PAM apenas com base nas normas aplicáveis e nos certificados/documentos do fabricante fornecidos.";
    }

    content.push({
      type: "text",
      text: `${contextNote}

Analisa este PAM considerando:
1. O pedido de aprovação do empreiteiro (documento PDF acima)
2. O MQT / Caderno de Encargos (se fornecido)
3. O Contrato da Obra (se fornecido)
4. Os certificados e laudos fornecidos (se existirem)
5. Os documentos do fabricante (se existirem)

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
      const errBody = await response.text();
      console.error("PAM: Claude API error body:", errBody);
      throw new Error(`Claude API error: ${response.status} - ${errBody.substring(0, 300)}`);
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

  } catch (error: any) {
    console.error("PAM ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
