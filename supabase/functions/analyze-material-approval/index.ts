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
    // Strategy: fetch ALL docs for the obra, then score by relevance to this material category.
    // This ensures we find certificates classified under any type (e.g. "Pormenores Construtivos").
    let query = supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, document_type, specialty, summary, key_elements")
      .eq("obra_id", obraId)
      .eq("processed", true);
    if (userId) query = query.eq("user_id", userId);

    const { data: allDocs, error } = await query;

    if (error || !allDocs || allDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No knowledge docs found for obra", obraId);
      return "";
    }

    console.log(`PAM-KNOWLEDGE: Total docs in obra: ${allDocs.length}`);

    // Keywords per material category — used to score content relevance
    const categoryKeywords: Record<string, string[]> = {
      "Aço (armaduras)": ["aço", "aco", "armadura", "armaduras", "ferro", "varão", "malha", "a500", "nervurado", "certificado", "ensaio", "tracção", "tracao", "dobragem", "soldabilidade", "en 10080", "lote", "siderurgia", "conformidade", "dop", "declaração de desempenho", "ficha técnica", "resistência à tracção", "megasteel", "chaveriat"],
      "Betão (classes)": ["betão", "betao", "cimento", "c25", "c30", "c35", "c40", "resistência", "en 206", "ensaio", "compressão", "conformidade", "central", "abrams", "slump"],
      "Cofragem": ["cofragem", "cofragens", "molde", "descofragem", "escoramento", "contraplacado"],
      "Impermeabilização": ["impermeabilização", "membrana", "tela", "betuminosa", "geotêxtil", "dreno"],
      "Isolamento Térmico": ["térmico", "etics", "xps", "eps", "poliuretano", "lã mineral", "reh"],
      "Isolamento Acústico": ["acústico", "rrae", "ruído", "lã", "resiliente"],
      "Revestimentos": ["revestimento", "cerâmico", "mosaico", "pedra", "reboco", "argamassa"],
      "Tubagens e Acessórios": ["tubagem", "tubo", "ppr", "pvc", "pead", "válvula"],
      "Equipamentos AVAC": ["avac", "climatização", "ventilação", "conduta", "chiller", "vrf"],
      "Equipamentos Eléctricos": ["eléctrico", "quadro", "cabo", "disjuntor", "iluminação"],
      "Caixilharia": ["caixilharia", "alumínio", "janela", "porta", "vidro"],
      "Tintas e Acabamentos": ["tinta", "verniz", "primário", "pintura", "esmalte"],
    };
    const keywords = categoryKeywords[materialCategory] || materialCategory.toLowerCase().split(/[\s(),]+/).filter(Boolean);

    // Relevant specialties for bonus scoring
    const categorySpecialties: Record<string, string[]> = {
      "Aço (armaduras)": ["Estrutural", "Fundações"],
      "Betão (classes)": ["Estrutural", "Fundações"],
      "Cofragem": ["Estrutural"],
      "Impermeabilização": ["Arquitectura"],
      "Isolamento Térmico": ["Térmica", "Arquitectura"],
      "Isolamento Acústico": ["Acústica", "Arquitectura"],
      "Tubagens e Acessórios": ["Águas e Esgotos", "Rede Enterrada"],
      "Equipamentos AVAC": ["AVAC"],
      "Equipamentos Eléctricos": ["Electricidade"],
    };
    const relevantSpecialties = new Set(categorySpecialties[materialCategory] || []);

    // Contract/reference doc types (always relevant)
    const contractTypes = new Set(["Caderno de Encargos", "Condições Técnicas", "Contrato", "Mapa de Quantidades (MQT)"]);
    // Certificate doc types (always relevant if keyword matches)
    const certTypes = new Set(["Certificados e Ensaios", "Fichas Técnicas", "Declarações de Desempenho (DoP)"]);

    // Score every document
    const scored = allDocs.map((doc: any) => {
      let score = 0;
      const docNameLower = (doc.document_name || "").toLowerCase();
      const summaryLower = (doc.summary || "").toLowerCase();
      const combined = docNameLower + " " + summaryLower;

      // Contract docs: always include
      if (contractTypes.has(doc.document_type)) score += 15;

      // Certificate doc types: bonus
      if (certTypes.has(doc.document_type)) score += 5;

      // Matching specialty: bonus
      if (relevantSpecialties.has(doc.specialty)) score += 5;

      // KEYWORD MATCHING IN CONTENT — this is the key fix!
      // Finds certificates even if classified as "Pormenores Construtivos"
      let keywordHits = 0;
      keywords.forEach((kw: string) => {
        if (combined.includes(kw)) {
          keywordHits++;
          score += 3;
        }
        // Extra weight for filename match
        if (docNameLower.includes(kw)) score += 2;
      });

      return { ...doc, _score: score, _hits: keywordHits };
    });

    // Filter: keep only docs with score > 0 (at least some relevance)
    const relevant = scored.filter((d: any) => d._score > 0);
    relevant.sort((a: any, b: any) => b._score - a._score);

    // Take top 10 documents MAX
    const finalDocs = relevant.slice(0, 10);

    if (finalDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No relevant docs found for", materialCategory);
      return "";
    }

    console.log(`PAM-KNOWLEDGE: Using ${finalDocs.length}/${allDocs.length} docs: ${finalDocs.map((d: any) => `${d.document_name}(s:${d._score},h:${d._hits})`).join(", ")}`);

    // Build context — compact summaries (max 400 words each)
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

    // Hard cap at 10000 chars
    if (context.length > 10000) {
      context = context.substring(0, 10000) + "\n[...]";
    }

    context += `\n\nCruza esta informação com o PAM. Quando referires dados de um documento, menciona o nome. Se encontrares certificados ou ensaios nos documentos acima, usa-os para validar o material proposto.`;

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

Analisa este PAM considerando TODAS as fontes de informação disponíveis:

1. O pedido de aprovação do empreiteiro (documento PDF acima)
2. Documentos PDF anexados directamente (MQT, Caderno de Encargos, Contrato, se existirem)
3. A BASE DE CONHECIMENTO DO PROJECTO (incluída no system prompt) — contém resumos de certificados PSG, documentos de classificação LNEC (DC), fichas técnicas, cadernos de encargos e outros documentos já processados

REGRA FUNDAMENTAL: Quando o PAM do empreiteiro refere "certificados em anexo" ou "conforme certificados", os certificados podem NÃO estar no PDF do PAM mas SIM na Base de Conhecimento do Projecto. O fiscal carregou os certificados separadamente porque são demasiados para enviar num único ficheiro. DEVES cruzar o PAM com os certificados da Base de Conhecimento como se fossem anexos ao PAM.

COMO AVALIAR:
- Se a Base de Conhecimento contém certificados PSG/Certif válidos para o tipo de aço proposto (ex: A500NR SD) de fabricantes identificados → os certificados EXISTEM, não são "ausentes"
- Se existem Documentos de Classificação LNEC (DC) para os fabricantes → a conformidade normativa está documentada
- O empreiteiro pode indicar "Vários" ou "Diversos" como fabricante porque vai usar aço de múltiplos fornecedores certificados — isso é normal em obras grandes. Verifica se TODOS os fabricantes nos certificados da Base de Conhecimento têm certificação válida
- Avalia a conformidade real do material, não apenas a qualidade documental do formulário PAM

${getAnalysisPrompt(material_category)}`,
    });

    // 8. Build system prompt with knowledge context
    let systemPrompt = `És o Eng. Silva, engenheiro civil sénior com 30+ anos de experiência em fiscalização de obras em Portugal. Estás a analisar um Pedido de Aprovação de Materiais (PAM) submetido por um empreiteiro.

CONTEXTO IMPORTANTE: O fiscal desta obra carrega os certificados de conformidade dos materiais na Base de Conhecimento do Projecto separadamente do PAM, porque o volume de documentos é grande demais para enviar tudo junto. Quando analisas um PAM, DEVES consultar a Base de Conhecimento (incluída abaixo) para verificar se existem certificados válidos para o material proposto. Os certificados na Base de Conhecimento têm o MESMO valor que se tivessem sido anexados directamente ao PAM.

A tua análise deve ser rigorosa, técnica e baseada nas normas portuguesas e europeias. Cruza a informação do PAM com TODOS os certificados e documentos disponíveis na Base de Conhecimento. Responde em português europeu.`;

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
      // Robust JSON extraction: handle ```json, ```, text before/after JSON, etc.
      let cleaned = replyText;
      
      // Remove markdown code fences
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      // Extract JSON object: find first { and last }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      
      cleaned = cleaned.trim();
      analysis = JSON.parse(cleaned);
      console.log("PAM: JSON parsed successfully, recommendation:", analysis.recommendation);
    } catch (parseErr) {
      console.error("PAM: Parse error:", replyText.substring(0, 300));
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
