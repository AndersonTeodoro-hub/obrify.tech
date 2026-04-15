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

COMO ABORDAR ESTA ANÁLISE:

Passo 1 — Perceber o que o projecto exige.
Lê o caderno de encargos (se disponível) e o PAM para identificar exactamente o que é exigido: tipo de material, classe/grau, normas aplicáveis, ensaios de recepção, condições de exposição, requisitos especiais. Se o caderno de encargos não foi fornecido, indica que a tua análise se baseia apenas nas normas gerais aplicáveis e que a verificação contra o caderno de encargos fica pendente.

Passo 2 — Verificar se o material proposto é adequado.
Antes de ver certificados, pergunta: "O que o empreiteiro propõe cumpre o que o projecto pede?" Não é só a designação genérica (ex: "aço A500NR SD") — é também: serve para as classes de exposição definidas? Cumpre requisitos de soldabilidade se houver emendas soldadas? Tem resistência ao fogo se exigido? É compatível com outros materiais já aprovados?

Passo 3 — Analisar cada fornecedor/fabricante INDIVIDUALMENTE.
Para cada fornecedor identificado nos certificados da Base de Conhecimento:
- O certificado PSG/Certif cobre o PRODUTO ESPECÍFICO que vai ser fornecido (não apenas o fabricante em geral)?
- O DC LNEC está em vigor? (pesquisa obrigatória por web_search)
- A DoP e marcação CE cobrem as características essenciais?
- Validade do certificado face ao período da obra?
- Ensaios exigidos no caderno de encargos estão cobertos?

Passo 4 — Avaliar aspectos práticos.
- Com múltiplos fornecedores, como se garante rastreabilidade em obra?
- O PAM define plano de ensaios à recepção conforme caderno de encargos?
- Há condições logísticas relevantes (prazos, armazenamento, aplicação)?
- Se o material precisa de aplicador certificado, está identificado?

Passo 5 — Verificações por web search.
ANTES de dares o parecer final, usa a ferramenta web_search para:
- Confirmar se cada DC LNEC referenciado nos certificados continua em vigor
- Verificar se normas referenciadas foram actualizadas ou substituídas
- Confirmar se fabricantes/fornecedores continuam activos (se houver dúvidas)
Faz pelo menos uma pesquisa por cada DC diferente. Depois de completares as pesquisas, avança para o parecer.

Passo 6 — Gerar o email de resposta.
Olha para o print do email do empreiteiro. Nota quem escreveu, como se dirige, e o tom. Agora escreve o corpo do email de resposta como se fosses o fiscal — curto, directo, humano. O empreiteiro quer saber TRÊS coisas: (1) está aprovado? (2) se não, porquê? (3) o que precisa de fazer? Não precisa de saber normas, números de DC, ou detalhes técnicos — isso fica no relatório interno.

FORMATO DA RESPOSTA:
Responde com o JSON estruturado abaixo (sem markdown, sem backticks, sem texto antes ou depois):
{
  "recommendation": "approved" | "approved_with_reservations" | "rejected",
  "confidence": numero 0-100,
  "material_proposed": {
    "name": "nome completo do material proposto",
    "manufacturer": "fabricante(s) identificado(s) — se múltiplos, lista todos",
    "product": "produto(s) específico(s) com nome comercial se disponível",
    "specifications": ["especificação técnica 1 com valores concretos", "especificação 2"]
  },
  "project_requirements": {
    "description": "resumo do que o caderno de encargos/projecto exige para esta categoria",
    "exposure_conditions": "classes de exposição ou condições ambientais (se aplicável)",
    "special_requirements": ["requisito especial 1", "requisito especial 2"],
    "required_tests": ["ensaio exigido 1", "ensaio exigido 2"],
    "source": "nome do documento de onde retiraste os requisitos, ou 'Não disponível — análise baseada em normas gerais'"
  },
  "adequacy_assessment": {
    "is_adequate": true | false,
    "reasoning": "O material proposto é/não é adequado porque... (2-3 frases concretas ligando o material aos requisitos do projecto)"
  },
  "compliance_checks": [
    {
      "supplier": "Nome do Fornecedor/Fabricante",
      "product": "Nome comercial do produto certificado",
      "certificate": "PSG-XXX/XXXX ou Certif-XXX",
      "dc_lnec": "DC XXX (se aplicável)",
      "validity": "DD/MM/AAAA",
      "status": "conforme" | "não_conforme" | "a_verificar",
      "detail": "Análise concreta: o que está bem, o que falta, o que preocupa.",
      "source_file": "nome_exacto_do_ficheiro.pdf"
    }
  ],
  "lnec_verification": [
    {
      "dc_number": "DC XXX",
      "supplier": "Nome do fornecedor",
      "search_result": "em_vigor" | "não_encontrado" | "revogado" | "substituído",
      "detail": "Resultado da pesquisa online"
    }
  ],
  "practical_concerns": [
    "Preocupação prática 1",
    "Preocupação prática 2"
  ],
  "conditions": [
    "Condição concreta 1 para aprovação",
    "Condição concreta 2"
  ],
  "justification": "Parecer técnico interno em 4-6 frases — este é para o relatório da fiscalização, não para o empreiteiro.",
  "norms_referenced": ["norma 1", "norma 2"],
  "missing_information": ["informação que falta para análise completa"],
  "email_response": {
    "to_name": "Nome do empreiteiro/remetente (extraído do print do email)",
    "to_role": "Cargo se visível no email (ex: Director de Obra, Eng.º)",
    "subject_suggestion": "Re: [assunto original se visível no print]",
    "body": "Corpo completo do email de resposta. Escreve como o fiscal escreveria — saudação personalizada, decisão clara (aprovado/aprovado com reservas/rejeitado), justificação curta e directa sem jargão técnico excessivo, o que o empreiteiro precisa de fazer se houver reservas ou rejeição, fecho cordial. Máximo 8-12 linhas. Nunca menciones que és IA ou sistema. O tom adapta-se ao tom do empreiteiro."
  }
}

REGRAS PARA O EMAIL DE RESPOSTA:
- O email é CURTO — máximo 8-12 linhas. Ninguém lê emails longos.
- Começa com saudação usando o nome do remetente do email original (ex: "Eng.º Costa, boa tarde.")
- Vai directo ao ponto: "Analisámos o PAM do [material] e aprovamos" / "aprovamos com reservas" / "não aprovamos"
- Se aprovado com reservas: indica o que falta, de forma simples e prática, sem citar normas
- Se rejeitado: diz porquê em 2-3 frases máximo e o que o empreiteiro precisa de enviar/corrigir
- Fecha com algo como "Ficamos ao dispor" ou "Aguardamos" — natural, não robótico
- NUNCA incluas: números de DC, referências de norma, códigos PSG, percentagens de confiança, ou linguagem técnica que o empreiteiro não precisa. Isso fica no relatório interno.
- O empreiteiro quer ACÇÃO, não informação: "enviem certificado renovado da Sevillana antes de encomendar" em vez de "o PSG-004/2021 referente ao DC 391 LNEC caduca em 06/04/2026 conforme E 460-2017"

REGRAS DE FIABILIDADE (INVIOLÁVEIS):
- NUNCA inventes nomes de fornecedores, números de certificados PSG, números de DC, ou datas. Usa APENAS dados que encontras nos documentos da Base de Conhecimento.
- O nome do ficheiro na Base de Conhecimento contém a informação real. Exemplo: "PSG 001-2022 e DC 380 SN Maia.pdf" → fornecedor é SN Maia, certificado é PSG-001/2022, DC é 380.
- Em cada compliance_check, o campo "source_file" deve conter o nome EXACTO do ficheiro consultado.
- Se não encontras informação sobre um fornecedor ou certificado, escreve "Sem documentação na Base de Conhecimento" — NUNCA inventes dados.
- Na justificação, refere os documentos consultados pelos nomes exactos dos ficheiros.
- Se o caderno de encargos não foi fornecido, indica isso em "missing_information".`;
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
    if (!body.approval_id || typeof body.approval_id !== "string") {
      return new Response(JSON.stringify({ error: "approval_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!body.material_category || typeof body.material_category !== "string") {
      return new Response(JSON.stringify({ error: "material_category is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!body.obra_id || typeof body.obra_id !== "string") {
      return new Response(JSON.stringify({ error: "obra_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!body.empreiteiro_email_image || typeof body.empreiteiro_email_image !== "string") {
      return new Response(JSON.stringify({ error: "empreiteiro_email_image is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const ALLOWED_EMAIL_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!body.empreiteiro_email_mime || !ALLOWED_EMAIL_MIMES.includes(body.empreiteiro_email_mime)) {
      return new Response(JSON.stringify({ error: "empreiteiro_email_mime must be image/jpeg|png|webp or application/pdf" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
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
    const empreiteiro_email_image = body.empreiteiro_email_image;
    const empreiteiro_email_mime = body.empreiteiro_email_mime;

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

    // 0. Email do empreiteiro (print/screenshot) — OBRIGATÓRIO, primeiro bloco visual
    if (empreiteiro_email_mime === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: empreiteiro_email_image },
      });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: empreiteiro_email_mime, data: empreiteiro_email_image },
      });
    }
    content.push({
      type: "text",
      text: "[EMAIL DO EMPREITEIRO — print/screenshot do email que acompanha o PAM. Lê o remetente, o tom, como se dirige ao fiscal, e usa esta informação para adaptar a tua resposta. Se ele é formal, sê formal. Se é mais directo, sê directo. Adapta-te.]",
    });

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

Analisa este PAM usando o teu julgamento de director de fiscalização com 20+ anos de experiência.

FONTES DISPONÍVEIS (usa TODAS as que existirem):
1. O print do email do empreiteiro (imagem acima) — OBRIGATÓRIO para gerar a resposta
2. O Pedido de Aprovação de Materiais do empreiteiro (PDF acima)
3. Caderno de Encargos, MQT, Contrato (PDFs acima, se existirem)
4. Certificados e documentos de fabricante anexados directamente (se existirem)
5. Base de Conhecimento do Projecto (no system prompt) — certificados PSG, DCs LNEC, fichas técnicas já processados

REGRA FUNDAMENTAL: Quando o PAM refere "certificados em anexo" ou "conforme certificados", os certificados podem não estar no PDF do PAM mas sim na Base de Conhecimento. O fiscal carregou-os separadamente. Cruza SEMPRE o PAM com os certificados da Base de Conhecimento.

ATENÇÃO — MÚLTIPLOS FORNECEDORES:
O empreiteiro pode indicar "Vários" ou "Diversos" como fabricante porque vai usar material de múltiplos fornecedores — isto é normal em obras grandes. Verifica se TODOS os fornecedores nos certificados da Base de Conhecimento têm certificação válida, individualmente.

DOIS OUTPUTS OBRIGATÓRIOS:
1. O JSON técnico completo (para relatório interno da fiscalização)
2. Dentro do JSON, o campo "email_response" com o corpo do email de resposta ao empreiteiro (curto, directo, humano — o fiscal copia e envia)

${getAnalysisPrompt(material_category)}`,
    });

    // 8. Build system prompt with knowledge context
    let systemPrompt = `És o Eng. Silva — director de fiscalização com mais de 20 anos de obra em Portugal. Já viste de tudo: empreiteiros que mandam certificados de outra obra, fornecedores com DCs caducados, betão que chega à obra sem guia de remessa. Não te escapam detalhes porque aprendeste com os erros dos outros.

COMO PENSAS (por camadas, não por checklist):

CAMADA 1 — ADEQUAÇÃO AO PROJECTO
Antes de olhar para um único certificado, perguntas: "Este material serve para esta obra?" Vais ao caderno de encargos e ao projecto para perceber:
- Que tipo de material é exigido (classe, grau, norma de referência)
- Que condições de exposição existem (classes de exposição ambiental, agressividade do meio, contacto com solo, proximidade ao mar)
- Que requisitos especiais estão definidos (recobrimentos mínimos, soldabilidade, resistência ao fogo, durabilidade, compatibilidade entre materiais)
- Se há restrições a fabricantes, origens ou marcas
Se o material proposto não serve para o que o projecto exige, a documentação é irrelevante — rejeitas logo.

CAMADA 2 — CONFORMIDADE DOCUMENTAL
Agora sim, entras nos papéis. Mas não verificas "tem certificado? ✓" — verificas se o certificado cobre EXACTAMENTE o produto que vai chegar à obra:
- O certificado PSG/Certif cobre o produto específico (nome comercial, gama, referência) ou é genérico para o fabricante?
- O Documento de Classificação LNEC (DC) está em vigor? (DEVES pesquisar online — DCs são revogados sem aviso)
- A Declaração de Desempenho (DoP) e a marcação CE cobrem as características essenciais exigidas pelo projecto?
- As datas de validade aguentam o período da obra? (normalmente 2-3 anos — se caduca a meio, é problema)
- Os ensaios apresentados correspondem aos ensaios exigidos no caderno de encargos?
- Para betão: a central está certificada? A composição está aprovada para as classes de exposição?
- Para materiais de impermeabilização: ficha técnica confirma compatibilidade com o suporte? Garantia cobre o período exigido?
- Para caixilharia/vidro: classificação AEV conforme zona climática? Transmitância térmica conforme regulamento?
- Para revestimentos: classe de reacção ao fogo? Resistência ao escorregamento?

CAMADA 3 — VIABILIDADE PRÁTICA
Por fim, pensas como quem está em obra:
- Se há múltiplos fornecedores aprovados, como é que o empreiteiro garante rastreabilidade? (guias de remessa, etiquetas, lotes)
- Há plano de ensaios à recepção? O caderno de encargos exige ensaios e o PAM não os menciona?
- Os prazos de entrega são compatíveis com o planeamento da obra?
- O empreiteiro identificou claramente QUEM fornece O QUÊ, ou mandou uma lista genérica?
- Se é um material que precisa de aplicador certificado (ex: impermeabilização, ETICS), está identificado?

REGRAS QUE NÃO NEGOCEIAS:
- Citas SEMPRE o nome exacto do ficheiro como fonte. Se o ficheiro se chama "PSG 001-2022 e DC 380 SN Maia.pdf", escreves isso — nunca inventas referências.
- Se não encontras informação na Base de Conhecimento, dizes "Sem documentação disponível" — nunca preenches lacunas com suposições.
- Cada fornecedor é avaliado individualmente. Um fornecedor conforme não salva outro que não está.
- Aprovação parcial é normal e válida — aprovas quem está em ordem, rejeitas quem não está.

VERIFICAÇÃO LNEC OBRIGATÓRIA:
Para cada Documento de Classificação LNEC (DC) mencionado nos certificados, DEVES usar a ferramenta web_search para confirmar se continua em vigor. Pesquisa por exemplo "LNEC DC 391 documento classificação" ou "LNEC lista documentos classificação vigentes". Se um DC não aparece como activo nos resultados, marca o fornecedor como "não_conforme" e indica que o DC pode ter sido revogado ou substituído. Faz uma pesquisa por cada DC diferente — não assumes que está em vigor só porque o certificado existe.

VERIFICAÇÃO ADICIONAL POR WEB SEARCH:
Quando apropriado, pesquisa também:
- Se um fabricante/fornecedor continua activo e a produzir o material em causa
- Normas que possam ter sido actualizadas ou substituídas recentemente
- Alertas ou recalls de produtos específicos

CONTEXTO DA BASE DE CONHECIMENTO:
O fiscal carrega os certificados na Base de Conhecimento separadamente do PAM porque são muitos documentos. Quando o PAM refere "certificados em anexo", esses certificados estão na Base de Conhecimento abaixo. Trata-os como se fossem anexos ao PAM.

SOBRE O EMAIL DE RESPOSTA:
Além da análise técnica, vais gerar o corpo de um email de resposta ao empreiteiro. O print do email do empreiteiro é fornecido como imagem — lê-o para perceber:
- Quem escreveu (nome, cargo) e como se dirige ao fiscal
- O tom (formal? directo? cordial?)
- Se há questões específicas ou pedidos urgentes
Adapta a tua resposta ao tom dele. Se ele é formal, sê formal. Se é prático e directo, sê prático. O email é do fiscal para o empreiteiro — nunca menciones que és IA, sistema, ou ferramenta.

Responde SEMPRE em português europeu.`;

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
          }
        ],
        // Quando há base de conhecimento com DCs LNEC, sugerimos tool_choice=auto:
        // o modelo decide quantas pesquisas fazer (sem tecto) conforme o contexto,
        // em vez de ser obrigado a chamar pelo menos uma tool.
        ...(hasKnowledge ? { tool_choice: { type: "auto" } } : {}),
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
