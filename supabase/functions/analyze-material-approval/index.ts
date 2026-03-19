import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Fetch knowledge from eng_silva_project_knowledge ──
async function fetchProjectKnowledge(
  supabase: any,
  obraId: string,
  materialCategory: string,
  userId: string | null,
): Promise<string> {
  try {
    // 1. Map material category to relevant specialties (STRICT filter)
    const categorySpecialties: Record<string, string[]> = {
      "Aço (armaduras)": ["Estrutural", "Fundações"],
      "Betão (classes)": ["Estrutural", "Fundações"],
      "Cofragem": ["Estrutural"],
      "Impermeabilização": ["Arquitectura"],
      "Isolamento Térmico": ["Térmica", "Arquitectura"],
      "Isolamento Acústico": ["Acústica", "Arquitectura"],
      "Revestimentos": ["Arquitectura"],
      "Tubagens e Acessórios": ["Águas e Esgotos", "Rede Enterrada"],
      "Equipamentos AVAC": ["AVAC"],
      "Equipamentos Eléctricos": ["Electricidade"],
      "Caixilharia": ["Arquitectura"],
      "Tintas e Acabamentos": ["Arquitectura"],
    };

    const relevantSpecialties = categorySpecialties[materialCategory] || [];

    // 2. Fetch ONLY relevant documents: matching specialty + contract docs
    // Query 1: Documents from relevant specialties
    let specQuery = supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, document_type, specialty, summary, key_elements")
      .eq("obra_id", obraId)
      .eq("processed", true);
    if (userId) specQuery = specQuery.eq("user_id", userId);
    if (relevantSpecialties.length > 0) {
      specQuery = specQuery.in("specialty", relevantSpecialties);
    }
    const { data: specDocs } = await specQuery;

    // Query 2: Always include contract-type documents (Caderno de Encargos, MQT, Contrato, Condições Técnicas)
    const contractTypes = ["Caderno de Encargos", "Condições Técnicas", "Contrato", "Mapa de Quantidades (MQT)"];
    let contractQuery = supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, document_type, specialty, summary, key_elements")
      .eq("obra_id", obraId)
      .eq("processed", true)
      .in("document_type", contractTypes);
    if (userId) contractQuery = contractQuery.eq("user_id", userId);
    const { data: contractDocs } = await contractQuery;

    // Merge and deduplicate
    const allDocs: any[] = [];
    const seen = new Set<string>();
    for (const doc of [...(specDocs || []), ...(contractDocs || [])]) {
      if (!seen.has(doc.document_name)) {
        seen.add(doc.document_name);
        allDocs.push(doc);
      }
    }

    if (allDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No relevant docs found for", materialCategory);
      return "";
    }

    console.log(`PAM-KNOWLEDGE: Pre-filtered to ${allDocs.length} docs (specialties: ${relevantSpecialties.join(",")})`);

    // 3. Score by keyword relevance within the pre-filtered set
    const categoryKeywords: Record<string, string[]> = {
      "Aço (armaduras)": ["aço", "aco", "armadura", "armaduras", "ferro", "varão", "malha", "a500", "nervurado", "certificado", "ensaio", "tracção", "tracao", "dobragem", "soldabilidade", "en 10080", "lote", "siderurgia", "conformidade", "dop"],
      "Betão (classes)": ["betão", "betao", "cimento", "c25", "c30", "c35", "c40", "resistência", "en 206", "ensaio", "compressão", "conformidade"],
      "Cofragem": ["cofragem", "cofragens", "molde", "descofragem", "escoramento"],
      "Impermeabilização": ["impermeabilização", "membrana", "tela", "betuminosa", "geotêxtil"],
      "Isolamento Térmico": ["térmico", "etics", "xps", "eps", "poliuretano", "lã mineral", "reh"],
      "Isolamento Acústico": ["acústico", "rrae", "ruído", "lã", "resiliente"],
      "Revestimentos": ["revestimento", "cerâmico", "mosaico", "pedra", "reboco", "argamassa"],
      "Tubagens e Acessórios": ["tubagem", "tubo", "ppr", "pvc", "pead", "válvula"],
      "Equipamentos AVAC": ["avac", "climatização", "ventilação", "conduta", "chiller", "vrf"],
      "Equipamentos Eléctricos": ["eléctrico", "quadro", "cabo", "disjuntor", "iluminação"],
      "Caixilharia": ["caixilharia", "alumínio", "janela", "porta", "vidro"],
      "Tintas e Acabamentos": ["tinta", "verniz", "primário", "pintura", "esmalte"],
    };
    const keywords = categoryKeywords[materialCategory] || [];

    const scored = allDocs.map((doc: any) => {
      let score = 1; // All pre-filtered docs get at least 1
      const combined = ((doc.summary || "") + " " + (doc.document_name || "")).toLowerCase();

      // Contract docs always high priority
      if (contractTypes.includes(doc.document_type)) score += 10;

      // Keyword matching
      keywords.forEach((kw: string) => {
        if (combined.includes(kw)) score += 3;
      });

      return { ...doc, _score: score };
    });

    scored.sort((a: any, b: any) => b._score - a._score);

    // Take top 8 documents MAX — keeps context manageable
    const finalDocs = scored.slice(0, 8);

    console.log(`PAM-KNOWLEDGE: Using ${finalDocs.length} docs: ${finalDocs.map((d: any) => `${d.document_name}(${d._score})`).join(", ")}`);

    // 4. Build context — compact summaries (max 400 words each)
    let context = `\n\nBASE DE CONHECIMENTO DO PROJECTO (${finalDocs.length} documentos relevantes):`;

    finalDocs.forEach((doc: any) => {
      const summary = (doc.summary || "").split(" ").slice(0, 400).join(" ");
      context += `\n\n--- ${doc.document_name} [${doc.document_type || doc.specialty || "—"}] ---`;
      context += `\n${summary}`;

      if (doc.key_elements && doc.key_elements.length > 0) {
        const validElements = doc.key_elements
          .filter((e: any) => e && e.type && e.id)
          .slice(0, 10);
        if (validElements.length > 0) {
          context += `\nElementos: ${validElements.map((e: any) => `${e.type}:${e.id}${e.details ? ` (${e.details})` : ""}`).join("; ")}`;
        }
      }
    });

    // Hard cap at 8000 chars
    if (context.length > 8000) {
      context = context.substring(0, 8000) + "\n[...]";
    }

    context += `\n\nCruza esta informação com o PAM. Quando referires dados de um documento, menciona o nome.`;

    return context;
  } catch (err) {
    console.error("PAM-KNOWLEDGE: Error fetching knowledge:", err);
    return "";
  }
}

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
    "description": "o que está especificado no projecto/MQT/Caderno de Encargos para esta categoria",
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
    const ce_base64 = body.ce_base64 || null;
    const contract_base64 = body.contract_base64 || null;
    const certificates_base64 = body.certificates_base64 || [];
    const manufacturer_docs_base64 = body.manufacturer_docs_base64 || [];
    const material_category = body.material_category;
    const obra_id = body.obra_id;
    const user_id = body.user_id || null;

    console.log("PAM: Request received:", JSON.stringify({
      approval_id, obra_id, material_category, user_id,
      has_pdm: !!pdm_base64,
      has_mqt: !!mqt_base64,
      has_ce: !!ce_base64,
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
        text: "[MQT / MAPA DE QUANTIDADES — mapa de quantidades e trabalhos do projecto]",
      });
    }

    // 2b. Caderno de Encargos (if provided)
    if (ce_base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: ce_base64 },
      });
      content.push({
        type: "text",
        text: "[CADERNO DE ENCARGOS — condições técnicas, especificações de materiais, ensaios exigidos]",
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

    // 6. Fetch knowledge from Eng. Silva's project knowledge base
    const knowledgeContext = await fetchProjectKnowledge(supabase, obra_id, material_category, user_id);
    const hasKnowledge = knowledgeContext.length > 0;

    console.log(`PAM: Knowledge context: ${hasKnowledge ? `${knowledgeContext.length} chars` : "none"}`);

    // 7. Build context note based on available documents
    const docParts: string[] = [];
    if (mqt_base64) docParts.push("o MQT/Mapa de Quantidades (PDF em anexo)");
    if (ce_base64) docParts.push("o Caderno de Encargos (PDF em anexo)");
    if (contract_base64) docParts.push("o Contrato da Obra (PDF em anexo)");
    if (hasKnowledge) docParts.push("a Base de Conhecimento do Projecto (resumos de documentos processados pelo Eng. Silva, incluídos no system prompt)");

    let contextNote = "";
    if (docParts.length > 0) {
      contextNote = `Fontes disponíveis para esta análise: ${docParts.join("; ")}. Cruza TODA a informação disponível com o PAM.`;
    } else {
      contextNote = "Não foram fornecidos documentos de referência nem existe conhecimento do projecto. Analisa o PAM apenas com base nas normas aplicáveis.";
    }

    content.push({
      type: "text",
      text: `${contextNote}

Analisa este PAM considerando:
1. O pedido de aprovação do empreiteiro (documento PDF acima)
2. O MQT / Mapa de Quantidades (se fornecido como PDF)
3. O Caderno de Encargos (se fornecido como PDF)
4. O Contrato da Obra (se fornecido como PDF)
5. Os certificados e laudos fornecidos (se existirem como PDF)
6. Os documentos do fabricante (se existirem como PDF)
7. A BASE DE CONHECIMENTO DO PROJECTO — resumos de certificados, fichas técnicas, relatórios de ensaio, cadernos de encargos e outros documentos já processados pelo Eng. Silva (incluídos no system prompt)

IMPORTANTE: A Base de Conhecimento pode conter resumos de dezenas de certificados e relatórios de ensaio que não foram enviados como PDF nesta análise. Usa essa informação para validar o material proposto no PAM.

${getAnalysisPrompt(material_category)}`,
    });

    // 8. Build system prompt with knowledge context
    let systemPrompt = `És o Eng. Silva, engenheiro civil sénior com 30+ anos de experiência em fiscalização de obras em Portugal. Estás a analisar um Pedido de Aprovação de Materiais (PAM) submetido por um empreiteiro. A tua análise deve ser rigorosa, técnica e baseada nas normas portuguesas e europeias. Cruza a informação do PAM com TODOS os documentos e conhecimento disponíveis. Verifica se o material proposto cumpre as especificações do projecto e as normas aplicáveis. Responde em português europeu.`;

    if (hasKnowledge) {
      systemPrompt += knowledgeContext;
    }

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
        system: systemPrompt,
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
