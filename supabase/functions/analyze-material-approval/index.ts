import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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

    // Filter: keep certificates ALWAYS (bypass score filter), plus other docs with score > 0
    const relevant = scored.filter((d: any) => d._score > 0 || certTypes.has(d.document_type));
    relevant.sort((a: any, b: any) => b._score - a._score);

    // Take top 20 documents — must include ALL certificates
    const finalDocs = relevant.slice(0, 20);

    if (finalDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No relevant docs found for", materialCategory);
      return "";
    }

    // Diagnóstico: contagem de certificados incluídos vs existentes na obra
    const totalCertsInObra = allDocs.filter((d: any) => certTypes.has(d.document_type)).length;
    const certsIncluded = finalDocs.filter((d: any) => certTypes.has(d.document_type)).length;
    console.log(`PAM-KNOWLEDGE: Certificates included: ${certsIncluded}/${totalCertsInObra} (certTypes only)`);
    console.log(`PAM-KNOWLEDGE: Using ${finalDocs.length}/${allDocs.length} docs: ${finalDocs.map((d: any) => `${d.document_name}(s:${d._score},h:${d._hits})`).join(", ")}`);

    // Quando há muitos docs, reduz o summary para caber tudo
    const summaryWordLimit = finalDocs.length > 10 ? 100 : 200;

    // Build context — include ALL relevant docs with full summaries
    let context = `\n\nBASE DE CONHECIMENTO DO PROJECTO (${finalDocs.length} documentos relevantes — ANALISA TODOS):`;

    finalDocs.forEach((doc: any) => {
      const summary = (doc.summary || "").split(" ").slice(0, summaryWordLimit).join(" ");
      context += `\n\n--- ${doc.document_name} ---`;
      context += `\n${summary}`;

      if (doc.key_elements && doc.key_elements.length > 0) {
        const validElements = doc.key_elements
          .filter((e: any) => e && e.type && e.id)
          .slice(0, 3);
        if (validElements.length > 0) {
          context += `\nElementos: ${validElements.map((e: any) => `${e.type}:${e.id}${e.details ? ` (${e.details})` : ""}`).join("; ")}`;
        }
      }
    });

    // Hard cap at 80000 chars — Claude Sonnet 4.5 aguenta facilmente
    if (context.length > 80000) {
      context = context.substring(0, 80000) + "\n[...]";
    }

    context += `\n\nANALISA CADA UM dos ${finalDocs.length} documentos acima individualmente. Não ignores nenhum certificado. Cada fornecedor deve ter uma entrada na tabela de verificações de conformidade.`;

    return context;
  } catch (err) {
    console.error("PAM-KNOWLEDGE: Error fetching knowledge:", err);
    return "";
  }
}

function getAnalysisPrompt(material_category: string): string {
  return `Analisa este Pedido de Aprovação de Materiais (PAM) para a categoria "${material_category}".

INSTRUÇÕES DE ANÁLISE:

1. ANALISA CADA FORNECEDOR/FABRICANTE INDIVIDUALMENTE. Se existem certificados de múltiplos fabricantes na Base de Conhecimento, avalia CADA UM separadamente. Identifica quais estão aprovados e quais têm problemas.

2. VERIFICA A VALIDADE de cada certificado:
   - Data de validade do certificado PSG (campo "válido até")
   - Se o Documento de Classificação LNEC (DC) está referenciado e é recente
   - Se existem indicações de que algum DC possa ter sido substituído ou revogado
   - Alerta se algum certificado caduca durante o período provável de execução da obra

3. DECISÃO PODE SER PARCIAL: Se alguns fornecedores estão conformes mas outros não, usa "approved_with_reservations" e especifica claramente quais estão aprovados e quais não.

4. TOM: Escreve como um engenheiro fiscal experiente que comunica com o empreiteiro. Sê directo, claro e prático. Evita repetição. Não uses linguagem genérica — sê específico com nomes de fornecedores, números de certificados e datas.

PROCESSO: Primeiro, usa a ferramenta web_search para verificar os Documentos de Classificação LNEC (DCs) referenciados nos certificados — pesquisa cada DC para confirmar se está em vigor. Depois de completares as pesquisas necessárias, responde com o JSON estruturado abaixo (sem markdown, sem backticks):
{
  "recommendation": "approved" | "approved_with_reservations" | "rejected",
  "confidence": 85,
  "material_proposed": {
    "name": "nome do material proposto",
    "manufacturer": "lista dos fabricantes identificados nos certificados",
    "model": "modelo/referência",
    "specifications": ["especificação 1", "especificação 2"]
  },
  "material_specified": {
    "description": "resumo conciso do que está especificado no projecto para esta categoria",
    "requirements": ["requisito chave 1", "requisito chave 2"]
  },
  "compliance_checks": [
    {
      "aspect": "Fornecedor X — Certificado PSG-XXX/XXXX",
      "status": "conforme" | "não_conforme" | "a_verificar",
      "detail": "Certificado válido até DD/MM/AAAA. DC XXX em vigor. Material conforme."
    },
    {
      "aspect": "Fornecedor Y — Certificado PSG-YYY/YYYY",
      "status": "não_conforme",
      "detail": "DC YYY não consta na lista de DCs em vigor do LNEC. Fornecedor não aprovado."
    }
  ],
  "issues": ["problema específico com nome do fornecedor e certificado"],
  "conditions": ["condição prática e específica para aprovação"],
  "justification": "Parecer directo em 3-5 frases, como um fiscal escreveria num email ao empreiteiro. Identifica quem está aprovado, quem não está, e o que falta.",
  "norms_referenced": ["EN 10080", "LNEC E 460-2017"]
}

IMPORTANTE: Cada compliance_check deve corresponder a um fornecedor/certificado OU a um aspecto técnico específico. Não uses verificações genéricas como "Conformidade normativa" — sê concreto.

REGRA CRÍTICA DE FIABILIDADE:
- NUNCA inventes nomes de fornecedores, números de certificados PSG, números de DC, ou datas. Usa APENAS dados que encontras nos documentos da Base de Conhecimento.
- O nome do ficheiro na Base de Conhecimento contém a informação real (ex: "PSG 001-2022 e DC 380 SN Maia.pdf" → fornecedor é SN Maia, certificado é PSG-001/2022, DC é 380).
- Em cada compliance_check, no campo "detail", inclui SEMPRE a referência ao documento fonte entre parêntesis no final, ex: "(Fonte: PSG 001-2022 e DC 380 SN Maia.pdf)"
- Se não encontras informação sobre um fornecedor ou certificado na Base de Conhecimento, diz explicitamente "Sem documentação na Base de Conhecimento" — NUNCA inventes dados.
- Na justificação, lista os documentos consultados com os nomes exactos dos ficheiros.`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    let systemPrompt = `És o Eng. Silva, engenheiro civil sénior com 30+ anos de experiência em fiscalização de obras em Portugal. Comunicas como um profissional experiente — directo, claro, sem rodeios. Não repetes informação. Vais ao essencial.

COMO TRABALHAS:
- Analisas cada fornecedor/fabricante INDIVIDUALMENTE
- Verificas se cada certificado PSG está dentro da validade
- Verificas se cada Documento de Classificação LNEC (DC) é recente e provavelmente está em vigor (DCs podem ser revogados — se um DC parece antigo ou substituído, sinalizas como "a_verificar")
- Se um fornecedor não tem documentação válida, REJEITAS esse fornecedor mas podes aprovar os outros (aprovação parcial)
- Alertas para certificados que caducam durante a obra (normalmente 2-3 anos de execução)
- Escreves a justificação como se fosse um email ao empreiteiro — profissional mas humano

CONTEXTO: O fiscal carrega os certificados na Base de Conhecimento separadamente do PAM porque são muitos documentos. Quando o PAM refere "certificados em anexo", esses certificados estão na Base de Conhecimento abaixo. Trata-os como se fossem anexos ao PAM.

FIABILIDADE: Os nomes dos ficheiros na Base de Conhecimento são a tua referência principal. Exemplo: "PSG 001-2022 e DC 380 SN Maia.pdf" significa que o fornecedor é SN Maia, o certificado PSG é 001/2022 e o DC LNEC é 380. USA estes dados exactos — nunca inventes números ou nomes. Quando citas um certificado, indica o nome do ficheiro como fonte.

VERIFICAÇÃO LNEC OBRIGATÓRIA: Para cada Documento de Classificação LNEC (DC) mencionado nos certificados da Base de Conhecimento, DEVES usar a ferramenta web_search para confirmar se o DC continua em vigor. Pesquisa por exemplo "LNEC DC 391 documento classificação aço em vigor" ou "LNEC lista documentos classificação". Se um DC não aparece como em vigor nos resultados, marca o fornecedor correspondente como "não_conforme" e indica que o DC pode ter sido revogado. Esta verificação é CRÍTICA — não a saltes.

Responde em português europeu.`;

    if (hasKnowledge) {
      systemPrompt += knowledgeContext;
    }

    // (Instrução LNEC já está agora no system prompt, com mais peso)

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8000,
        messages: [{ role: "user", content }],
        system: systemPrompt,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
          }
        ],
        // Quando há base de conhecimento com DCs LNEC, FORÇAMOS o uso de pelo menos
        // uma tool — com só web_search definida, isto obriga Claude a fazer search
        // antes de produzir o JSON. Sem isto, o modelo escolhia saltar a verificação.
        ...(hasKnowledge ? { tool_choice: { type: "any" } } : {}),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("PAM: Claude API error body:", errBody);
      throw new Error(`Claude API error: ${response.status} - ${errBody.substring(0, 300)}`);
    }

    const result = await response.json();

    // Diagnóstico: stop_reason, tipos de blocks e nº de web searches efectivamente feitas
    const blockTypes = (result.content || []).map((b: any) => b.type);
    const webSearchCount = result.usage?.server_tool_use?.web_search_requests ?? 0;
    console.log(`PAM: stop_reason=${result.stop_reason} block_types=${JSON.stringify(blockTypes)} web_searches=${webSearchCount}`);

    if (webSearchCount === 0 && hasKnowledge) {
      console.warn("PAM: WARNING — web_search NÃO foi invocada apesar de haver base de conhecimento. Verificar se está habilitada na Anthropic Console (Settings → Privacy).");
    }

    // Aviso explícito se ficou pendurado em tool_use (server tool não devia, mas garantir)
    if (result.stop_reason === "tool_use") {
      console.warn("PAM: WARNING — response stopped at tool_use. Server tool web_search may not have completed correctly.");
    }

    // pause_turn: server tools podem pausar a meio. Avisar — sem loop de continuação por agora.
    if (result.stop_reason === "pause_turn") {
      console.warn("PAM: WARNING — stop_reason=pause_turn. Resposta incompleta; análise pode estar truncada.");
    }

    // With web search, response may have multiple content blocks (text + tool results)
    // Extract all text blocks and concatenate
    const allText = (result.content || [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text || "")
      .join("\n");
    
    const replyText = allText || "{}";

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
