import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { voyageEmbed, voyageRerank } from "../_shared/embeddings/voyage-client.ts";
import { runClaudeWithContinuation } from "../_shared/anthropic-loop.ts";

// ── [LEGACY] Fetch knowledge from eng_silva_project_knowledge (keyword scoring) ──
// Fallback de emergência quando o retrieval híbrido falha (ex.: Voyage/RPC em baixo).
// Antes marcada "NÃO modificar" — snapshot de rollback do commit a3c33bc.
// EXCEÇÃO REGISTADA (2026-07-13, ponto 4 da correção PAM): alterada de forma ADITIVA
// para força-inclusão dos documentos contratuais por `specialty`
// (HYBRID_CONTRACT_SPECIALTIES), garantindo que NENHUM caminho de retrieval perde o
// MQT/Caderno de Encargos. Motivo: o filtro por `document_type` deixava cair contratuais
// classificados sob outra especialidade. O scoring NÃO foi tocado; a função passou também
// a devolver KnowledgeResult para os avisos e a lista de fontes funcionarem neste caminho.
async function fetchProjectKnowledgeLegacy(
  supabase: any,
  obraId: string,
  materialCategory: string,
  userId: string | null,
): Promise<KnowledgeResult> {
  try {
    // Strategy: fetch ALL docs for the obra, then score by relevance to this material category.
    // This ensures we find certificates classified under any type (e.g. "Pormenores Construtivos").
    let query = supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, document_type, specialty, summary, key_elements, file_path, num_pages")
      .eq("obra_id", obraId)
      .eq("processed", true);
    if (userId) query = query.eq("user_id", userId);

    const { data: allDocs, error } = await query;

    if (error || !allDocs || allDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No knowledge docs found for obra", obraId);
      return { context: "", sources: [], hasContractual: false, ceForCategoryFound: false };
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
      "Redes Enterradas": ["tubagem enterrada", "saneamento", "drenagem", "águas pluviais", "coletor", "colector", "pead", "pp corrugado", "pvc corrugado", "caixa de visita", "caixas de visita", "tampa", "grelha", "câmara de inspecção", "rede enterrada"],
      "Redes Embebidas": ["tubagem embebida", "embebido", "embebidos", "roço", "roços", "negativo", "negativos", "manga", "mangas", "courette", "courettes", "espera", "esperas", "passagem em laje"],
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
      "Redes Enterradas": ["Rede Enterrada", "Águas e Esgotos"],
      "Redes Embebidas": ["Águas e Esgotos", "Electricidade"],
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

    // Ponto 4 (aditivo): detetar contratuais por SPECIALTY, não por document_type.
    const isContractualBySpecialty = (d: any) => HYBRID_CONTRACT_SPECIALTIES.includes(d.specialty);

    // Filter: manter certificados SEMPRE (bypass score), contratuais SEMPRE por specialty,
    // e restantes docs com score > 0. (scoring não foi alterado — só o filtro de inclusão.)
    const relevant = scored.filter(
      (d: any) => d._score > 0 || certTypes.has(d.document_type) || isContractualBySpecialty(d),
    );
    relevant.sort((a: any, b: any) => b._score - a._score);

    // Take top 20 — mas os contratuais (CE/MQT/Contrato/Condições Técnicas) NUNCA são
    // cortados pelo limite: força-inclusão de todos, e top-20 para os restantes.
    const contractualDocs = relevant.filter(isContractualBySpecialty);
    const otherDocs = relevant.filter((d: any) => !isContractualBySpecialty(d)).slice(0, 20);
    const finalDocs = [...contractualDocs, ...otherDocs];

    if (finalDocs.length === 0) {
      console.log("PAM-KNOWLEDGE: No relevant docs found for", materialCategory);
      return { context: "", sources: [], hasContractual: false, ceForCategoryFound: false };
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

    // Fontes autoritativas (o que REALMENTE entrou no contexto) + sinais de aviso.
    const sources = finalDocs.map((d: any) => {
      let origin: "contratual" | "certificado" | "semantica";
      if (isContractualBySpecialty(d)) origin = "contratual";
      else if (certTypes.has(d.document_type) || d.specialty === HYBRID_CERT_SPECIALTY) origin = "certificado";
      else origin = "semantica";
      return { document_name: d.document_name, origin };
    });
    const ceForCategoryFound = keywords.length === 0
      ? finalDocs.some((d: any) => d.specialty === "Caderno de Encargos")
      : finalDocs.some((d: any) => {
          if (d.specialty !== "Caderno de Encargos") return false;
          const hay = ((d.document_name || "") + " " + (d.summary || "")).toLowerCase();
          return keywords.some((kw: string) => hay.includes(kw));
        });
    const mqtConsulted = finalDocs
      .filter((d: any) => d.specialty === "Mapa de Quantidades (MQT)")
      .map((d: any) => d.document_name);

    // Via 2 (caminho legacy): contratuais com file_path, gated por categoria (fallback = todos).
    const legacyContractsWithFile = contractualDocs.filter((d: any) => d.file_path);
    const legacyMatched = keywords.length === 0
      ? legacyContractsWithFile
      : legacyContractsWithFile.filter((d: any) => {
          const hay = ((d.document_name || "") + " " + (d.summary || "")).toLowerCase();
          return keywords.some((kw: string) => hay.includes(kw));
        });
    if (keywords.length > 0 && legacyMatched.length === 0 && legacyContractsWithFile.length > 0) {
      console.log(`F2: sem match de categoria — a incluir todos os ${legacyContractsWithFile.length} contratuais como PDF (fallback).`);
    }
    const contractualFiles = (legacyMatched.length > 0 ? legacyMatched : legacyContractsWithFile)
      .map((d: any) => ({ document_name: d.document_name, file_path: d.file_path, pages: d.num_pages ?? null }));

    return {
      context,
      sources,
      hasContractual: contractualDocs.length > 0,
      ceForCategoryFound,
      mqt_consulted: mqtConsulted,
      contractualFiles,
    };
  } catch (err) {
    console.error("PAM-KNOWLEDGE: Error fetching knowledge:", err);
    return { context: "", sources: [], hasContractual: false, ceForCategoryFound: false };
  }
}

// ── Keyword map por categoria (14 categorias do dropdown do frontend) ──
// Usado SÓ pela via determinística do retrieval híbrido como gate de relevância.
// Mantido separado do mapa da legacy para não alterar o comportamento desta.
const HYBRID_CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Aço (armaduras)": ["aço", "aco", "armadura", "armaduras", "ferro", "varão", "malha", "a500", "nervurado", "certificado", "ensaio", "tracção", "tracao", "dobragem", "soldabilidade", "en 10080", "lote", "siderurgia", "conformidade", "dop", "declaração de desempenho", "ficha técnica", "resistência à tracção", "megasteel", "chaveriat"],
  "Betão (classes)": ["betão", "betao", "cimento", "c25", "c30", "c35", "c40", "resistência", "en 206", "ensaio", "compressão", "conformidade", "central", "abrams", "slump"],
  "Cofragem": ["cofragem", "cofragens", "molde", "descofragem", "escoramento", "contraplacado"],
  "Impermeabilização": ["impermeabilização", "membrana", "tela", "betuminosa", "geotêxtil", "dreno"],
  "Isolamento Térmico": ["térmico", "etics", "xps", "eps", "poliuretano", "lã mineral", "reh"],
  "Isolamento Acústico": ["acústico", "rrae", "ruído", "lã", "resiliente"],
  "Revestimentos": ["revestimento", "cerâmico", "mosaico", "pedra", "reboco", "argamassa"],
  "Tubagens e Acessórios": ["tubagem", "tubo", "ppr", "pvc", "pead", "válvula"],
  "Redes Enterradas": ["tubagem enterrada", "saneamento", "drenagem", "aguas pluviais", "coletor", "coletores", "pead", "pp corrugado", "pvc corrugado", "caixa de visita", "caixas de visita", "tampa", "tampas", "grelha", "grelhas", "camara de inspecao", "rede enterrada"],
  "Redes Embebidas": ["tubagem embebida", "embebido", "embebidos", "roco", "rocos", "negativo", "negativos", "manga", "mangas", "courette", "courettes", "espera", "esperas", "passagem em laje"],
  "Equipamentos AVAC": ["avac", "climatização", "ventilação", "conduta", "chiller", "vrf"],
  "Equipamentos Eléctricos": ["eléctrico", "quadro", "cabo", "disjuntor", "iluminação"],
  "Caixilharia": ["caixilharia", "alumínio", "janela", "porta", "vidro"],
  "Tintas e Acabamentos": ["tinta", "verniz", "primário", "pintura", "esmalte"],
  "Elementos Pré-fabricados": ["pré-fabricado", "prefabricado", "préfabricado", "pré-esforçado", "preesforcado", "viga", "laje alveolar", "painel", "elemento estrutural prefabricado"],
  "Outros": [], // sem keywords → via determinística inclui TODOS os certificados (fallback seguro)
};

const HYBRID_CERT_SPECIALTY = "Certificados e Ensaios";
const HYBRID_CONTRACT_SPECIALTIES = ["Caderno de Encargos", "Mapa de Quantidades (MQT)", "Contrato", "Condições Técnicas"];

// Normaliza texto para matching robusto: minúsculas + remove acentos.
function normalizeForMatch(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Formata um documento para o contexto: nome + especialidade + summary limitado + key_elements.
function formatDocBlock(doc: any, summaryWordLimit: number): string {
  let block = `\n\n--- ${doc.document_name}${doc.specialty ? ` [${doc.specialty}]` : ""} ---`;
  const summary = (doc.summary || "").split(" ").slice(0, summaryWordLimit).join(" ");
  block += `\n${summary}`;
  if (doc.key_elements && doc.key_elements.length > 0) {
    const validElements = doc.key_elements
      .filter((e: any) => e && e.type && e.id)
      .slice(0, 3);
    if (validElements.length > 0) {
      block += `\nElementos: ${validElements.map((e: any) => `${e.type}:${e.id}${e.details ? ` (${e.details})` : ""}`).join("; ")}`;
    }
  }
  return block;
}

// Resultado do retrieval: contexto + lista autoritativa de fontes + sinais de aviso.
interface KnowledgeResult {
  context: string;
  sources: Array<{ document_name: string; origin: "contratual" | "certificado" | "semantica" }>;
  hasContractual: boolean;      // entrou algum CE/MQT/Contrato/Condições Técnicas no contexto?
  ceForCategoryFound: boolean;  // existe Caderno de Encargos que cobre esta categoria de material?
  mqt_consulted?: string[];     // nomes dos MQT (specialty "Mapa de Quantidades (MQT)") no contexto
  contractualFiles?: Array<{ document_name: string; file_path: string; pages?: number | null }>; // Via 2: contratuais da KB para anexar como PDF (gated por categoria)
}

// ── Retrieval híbrido: Via A determinística (certificados + contratuais) + Via B semântica ──
async function fetchProjectKnowledgeHybrid(
  supabase: any,
  obraId: string,
  materialCategory: string,
  userId: string | null,
  materialQuery: string,
): Promise<KnowledgeResult> {
  // ═══ VIA A — DETERMINÍSTICA (sem threshold, sem score) ═══

  // A1. Certificados: specialty = "Certificados e Ensaios", com gate de categoria por keywords.
  let certQuery = supabase
    .from("eng_silva_project_knowledge")
    .select("id, document_name, document_type, specialty, summary, key_elements")
    .eq("obra_id", obraId)
    .eq("processed", true)
    .eq("specialty", HYBRID_CERT_SPECIALTY)
    .order("document_name", { ascending: true });
  if (userId) certQuery = certQuery.eq("user_id", userId);
  const { data: allCerts, error: certErr } = await certQuery;
  if (certErr) throw new Error(`Via A certs failed: ${certErr.message}`);

  const keywords = (HYBRID_CATEGORY_KEYWORDS[materialCategory] || []).map(normalizeForMatch);
  const certs = (allCerts || []).filter((doc: any) => {
    if (keywords.length === 0) return true; // categoria sem keywords → incluir todos (fallback seguro)
    const haystack = normalizeForMatch(
      (doc.summary || "") + " " + (doc.document_name || "") + " " + JSON.stringify(doc.key_elements || []),
    );
    return keywords.some((kw) => haystack.includes(kw));
  });

  // A2. Contratuais e normativos: sempre incluídos, sem gate.
  let contractQuery = supabase
    .from("eng_silva_project_knowledge")
    .select("id, document_name, document_type, specialty, summary, key_elements, file_path, num_pages")
    .eq("obra_id", obraId)
    .eq("processed", true)
    .in("specialty", HYBRID_CONTRACT_SPECIALTIES)
    .order("document_name", { ascending: true });
  if (userId) contractQuery = contractQuery.eq("user_id", userId);
  const { data: contractDocs, error: contractErr } = await contractQuery;
  if (contractErr) throw new Error(`Via A contracts failed: ${contractErr.message}`);
  const contracts = contractDocs || [];

  // knowledge_ids já garantidos pela Via A — excluídos da Via B para evitar duplicação.
  const viaAIds = new Set<string>([
    ...certs.map((d: any) => d.id),
    ...contracts.map((d: any) => d.id),
  ]);

  // ═══ VIA B — SEMÂNTICA (sobre os restantes docs do projecto) ═══
  let semanticDocs: any[] = [];
  const query = `${materialCategory}. ${materialQuery || ""}`.trim();
  const queryEmbedding = await voyageEmbed({ input: query, inputType: "query" });

  const { data: chunks, error: rpcErr } = await supabase.rpc("match_knowledge_embeddings", {
    query_embedding: queryEmbedding[0],
    match_obra_id: obraId,
    match_user_id: userId,
    match_count: 30,
    match_threshold: 0.3,
  });
  if (rpcErr) throw new Error(`Via B RPC failed: ${rpcErr.message}`);

  if (chunks && chunks.length > 0) {
    // Rerank top-12
    const reranked = await voyageRerank({
      query,
      documents: chunks.map((c: any) => c.chunk_text),
      topK: 12,
    });
    const topChunks = reranked.map((r: any) => chunks[r.index]);

    // Dedupe por knowledge_id + excluir os já garantidos pela Via A (preserva ordem do rerank).
    const seen = new Set<string>();
    const semanticIds: string[] = [];
    for (const c of topChunks) {
      const kid = c.knowledge_id;
      if (kid && !viaAIds.has(kid) && !seen.has(kid)) {
        seen.add(kid);
        semanticIds.push(kid);
      }
    }

    // Enriquecer com metadata (summary, key_elements) — a RPC não os devolve.
    if (semanticIds.length > 0) {
      const { data: enriched, error: enrichErr } = await supabase
        .from("eng_silva_project_knowledge")
        .select("id, document_name, specialty, summary, key_elements")
        .in("id", semanticIds);
      if (enrichErr) throw new Error(`Via B enrichment failed: ${enrichErr.message}`);
      const byId: Record<string, any> = {};
      for (const d of (enriched || [])) byId[d.id] = d;
      semanticDocs = semanticIds.map((id) => byId[id]).filter(Boolean);
    }
  }

  // ═══ COMBINAÇÃO ═══
  if (certs.length === 0 && contracts.length === 0 && semanticDocs.length === 0) {
    console.log("PAM-HYBRID: No relevant docs found for", materialCategory);
    return { context: "", sources: [], hasContractual: false, ceForCategoryFound: false };
  }

  console.log(`PAM-HYBRID: certs=${certs.length} contracts=${contracts.length} semantic=${semanticDocs.length} (cat="${materialCategory}", gate_keywords=${keywords.length})`);

  // Com muitos docs, reduz o summary para caber tudo (mesma heurística da legacy).
  const totalDocs = certs.length + contracts.length + semanticDocs.length;
  const summaryWordLimit = totalDocs > 10 ? 100 : 200;

  let context = `\n\nBASE DE CONHECIMENTO DO PROJECTO (retrieval híbrido — ${totalDocs} documentos):`;

  if (certs.length > 0) {
    context += `\n\n## CERTIFICADOS DO MATERIAL (${certs.length} — analisa CADA UM individualmente)`;
    certs.forEach((doc: any) => { context += formatDocBlock(doc, summaryWordLimit); });
  }

  if (contracts.length > 0) {
    context += `\n\n## DOCUMENTOS CONTRATUAIS E NORMATIVOS DO PROJECTO (${contracts.length})`;
    contracts.forEach((doc: any) => { context += formatDocBlock(doc, summaryWordLimit); });
  }

  if (semanticDocs.length > 0) {
    context += `\n\n## ESPECIFICAÇÕES RELEVANTES DO PROJECTO (retrieval semântico — ${semanticDocs.length})`;
    semanticDocs.forEach((doc: any) => { context += formatDocBlock(doc, summaryWordLimit); });
  }

  // Hard-cap 80000 chars — preserva o limite da versão actual.
  if (context.length > 80000) {
    context = context.substring(0, 80000) + "\n[...]";
  }

  if (certs.length > 0) {
    context += `\n\nANALISA CADA UM dos ${certs.length} certificados acima individualmente. Não ignores nenhum. Cada fornecedor deve ter uma entrada na tabela de verificações de conformidade.`;
  }

  // Fontes autoritativas (o que REALMENTE entrou no contexto) + sinais de aviso.
  const sources = [
    ...certs.map((d: any) => ({ document_name: d.document_name, origin: "certificado" as const })),
    ...contracts.map((d: any) => ({ document_name: d.document_name, origin: "contratual" as const })),
    ...semanticDocs.map((d: any) => ({ document_name: d.document_name, origin: "semantica" as const })),
  ];
  const ceDocs = contracts.filter((d: any) => d.specialty === "Caderno de Encargos");
  const ceForCategoryFound = keywords.length === 0
    ? ceDocs.length > 0 // categoria sem keywords ("Outros"): qualquer CE conta
    : ceDocs.some((d: any) => {
        const hay = normalizeForMatch((d.document_name || "") + " " + (d.summary || ""));
        return keywords.some((kw) => hay.includes(kw));
      });
  const mqtConsulted = contracts
    .filter((d: any) => d.specialty === "Mapa de Quantidades (MQT)")
    .map((d: any) => d.document_name);

  // Via 2: contratuais com file_path, gated por categoria (fallback = todos se nenhum match).
  const contractsWithFile = contracts.filter((d: any) => d.file_path);
  const contractMatched = keywords.length === 0
    ? contractsWithFile
    : contractsWithFile.filter((d: any) => {
        const hay = normalizeForMatch((d.document_name || "") + " " + (d.summary || ""));
        return keywords.some((kw) => hay.includes(kw));
      });
  if (keywords.length > 0 && contractMatched.length === 0 && contractsWithFile.length > 0) {
    console.log(`F2: sem match de categoria — a incluir todos os ${contractsWithFile.length} contratuais como PDF (fallback).`);
  }
  const contractualFiles = (contractMatched.length > 0 ? contractMatched : contractsWithFile)
    .map((d: any) => ({ document_name: d.document_name, file_path: d.file_path, pages: d.num_pages ?? null }));

  return {
    context,
    sources,
    hasContractual: contracts.length > 0,
    ceForCategoryFound,
    mqt_consulted: mqtConsulted,
    contractualFiles,
  };
}

function getAnalysisPrompt(material_category: string, today: string, fiscalName: string | null, fiscalCompany: string | null): string {
  const assinaturaRegra = fiscalName
    ? `- ASSINATURA: assina EXACTAMENTE com "${fiscalName}"${fiscalCompany ? `, ${fiscalCompany}` : ""}. NUNCA inventes outro nome, cargo ou empresa.`
    : `- ASSINATURA: NÃO tens o nome do fiscal. NUNCA inventes um nome próprio. Fecha com fórmula neutra ("A Fiscalização") — nenhuma identidade fabricada.`;
  return `Analisa este Pedido de Aprovação de Materiais (PAM) para a categoria "${material_category}".

DATA DE HOJE: ${today}. Usa esta data para aferir a validade/caducidade de cada certificado e laudo.

COMO ABORDAR ESTA ANÁLISE:

Passo 1 — Perceber o que o MQT fixa (é ele que valida).
O documento que VALIDA o material é o MQT: identifica o que ELE fixa para este trabalho — tipo de material, classe/grau, normas, diâmetros, ensaios de recepção. Lê também o caderno de encargos / CTE e o PAM como REFERÊNCIA de 2.ª prioridade (cita-se e verifica-se, não decide). Se não tens o MQT ao nível do artigo, declara-o em "missing_information" e não finjas o confronto.

Passo 2 — Verificar se o material cumpre o que o MQT fixa.
Antes de ver certificados, pergunta: "O que o empreiteiro propõe cumpre o que o MQT fixa?" — não a designação do CTE. É também: serve para as classes de exposição? Cumpre soldabilidade se houver emendas soldadas? Resistência ao fogo se exigido? Compatível com materiais já aprovados? Uma divergência entre a designação do CTE e a do MQT NÃO é inadequação: regista-se na tabela CTE com os dados dos dois lados; o veredicto sai do MQT.

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

CRITÉRIOS DE VEREDITO (o veredito DERIVA destas regras, não do estilo):
- "rejected" SE qualquer: material NÃO adequado — e adequação afere-se SEMPRE contra o MQT/PAM, NUNCA contra o CTE isolado (is_adequate=false só é legítimo quando o proposto é INFERIOR ao que o MQT fixa ou INCOMPATÍVEL com a aplicação; divergir do CTE NÃO conta e NUNCA rejeita); DC LNEC revogado/substituído confirmado por web_search; certificado expirado para o produto a fornecer; ausência total de documentação do(s) fornecedor(es) proposto(s).
- "approved_with_reservations" SE, não havendo motivo de rejeição, qualquer: certificado/DoP/DC caduca dentro do período previsível da obra; dúvida de adequação ao ambiente (classes de exposição, agressividade, solo/mar) por esclarecer; MQT/CE citado no PAM mas NÃO consultado ao nível do artigo (mqt_confrontation "mqt_nao_consultado" ou missing_information sobre o CE); ensaios de recepção exigidos e não previstos no PAM; rastreabilidade entre múltiplos fornecedores não garantida; qualquer compliance_check "a_verificar".
- "approved" (liso) SÓ SE: adequação confirmada, TODOS os fornecedores com documentação válida e vigente para o produto específico, DCs LNEC confirmados em vigor por web_search, e nenhuma reserva acima.
- REGRA DE OURO: na dúvida entre "approved" e "approved_with_reservations", escolhe SEMPRE "approved_with_reservations" e escreve a condição em "conditions". Um parecer técnico nunca aprova liso o que não confirmou.
- COERÊNCIA: is_adequate=false ⇒ "rejected". Se "conditions" não estiver vazio ⇒ NÃO pode ser "approved" liso.
- COERÊNCIA COM A HIERARQUIA DOCUMENTAL: is_adequate=false NÃO pode fundamentar-se numa divergência
  com o CTE quando o material CUMPRE o MQT. Material que cumpre o MQT tem is_adequate=true; a
  divergência com o CTE regista-se em "cte_sections" com os dados de ambos os lados e não altera o
  veredicto. Nenhuma característica SUPERIOR à exigida pode gerar "rejected" nem compliance_check
  "nao_conforme".

FORMATO DA RESPOSTA:
Responde com o JSON estruturado abaixo (sem markdown, sem backticks, sem texto antes ou depois):
{
  "recommendation": "um de: approved, approved_with_reservations, rejected",
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
  "certificates_validity": [
    {
      "file": "nome exacto do ficheiro do certificado/laudo",
      "type": "um de: DoP, certificado_CE, laudo_ensaio, ficha_tecnica, outro",
      "issuer": "entidade emissora",
      "issue_date": "DD/MM/AAAA ou null",
      "expiry_date": "DD/MM/AAAA ou null",
      "status": "um de: valido, expirado, sem_data, ilegivel",
      "note": "observação curta (ex: caduca a meio da obra)"
    }
  ],
  "mqt_confrontation": [
    {
      "article": "artigo do MQT/CE citado no PAM (ex: 1.3.4)",
      "mqt_specifies": "o que o MQT/CE exige, se disponível no contexto; senão null",
      "proposed": "o que o empreiteiro propõe para esse artigo",
      "verdict": "um de: cumpre, nao_cumpre, mqt_nao_consultado"
    }
  ],
  "pam_reference": "referência do PAM tal como consta do documento (ex: PAM 011) ou null se não constar",
  "empreiteiro": "SÓ o nome da EMPRESA empreiteira (ex: Ferreira Build Power). NUNCA a pessoa que assinou o email, NUNCA cargo, NUNCA parênteses ou explicações. null se não constar",
  "documents_crossed": ["rótulo COMPACTO de cada contratual cruzado (ex: 'MQT Fases 1.1/1.2', 'CTE Esgotos Domésticos', 'CTE Esgotos Pluviais'). NUNCA nome de ficheiro, NUNCA datas nem revisões. Vazio se nenhum."],
  "analysis_date": "data desta análise em DD/MM/AAAA",
  "header_sintese": {
    "veredito": "rótulo que resume o parecer (ex: APROVADO CONDICIONADO, APROVADO, APROVADO COM RESERVAS, REJEITADO)",
    "base_analise": "1-2 frases: em que assenta o parecer. Ex: 'confirmado após cruzamento com o MQT Fases 1.1/1.2 + CTE Esgotos Domésticos + CTE Esgotos Pluviais'. Se NÃO houve MQT/CTE no contexto: 'sem confronto contratual — baseado em normas gerais'.",
    "material": "material + fabricante + marca em obra (1 frase)"
  },
  "mqt_articles_by_phase": [
    {
      "fase": "fase da obra (ex: Fase 1.1 — Pisos -5/-6) ou null",
      "revisao": "revisão do documento (ex: Rev.02, Dez 2025) ou null",
      "article": "artigo do MQT (ex: 1.3.3.1–.3)",
      "description": "descrição do artigo",
      "diameter": "diâmetro(s) (ex: 125 / 160 / 200) ou null",
      "quantity": "quantidade(s) SEM unidade, separadas por ' / ' (ex: 74,05 / 30,25 / 43,45) ou null — a unidade vai no cabeçalho da tabela",
      "norm": "norma (ex: EN ISO 1452 – PN10) ou null"
    }
  ],
  "cte_sections": [
    {
      "section": "documento/secção do CTE (ex: Domésticos — 3.4.1 Tubagens e Acessórios)",
      "requirement": "requisito de projeto",
      "verification": "verificação da fiscalização",
      "verdict": "um de: CONFORME, CONFORME_POR_EXCESSO, NAO_CONFORME, A_ACAUTELAR_EM_EXECUCAO"
    }
  ],
  "supporting_documents": [
    {
      "number": "nº do documento/certificado (ex: AENOR 001/006265)",
      "norm": "norma (ex: EN ISO 1452-2)",
      "scope": "âmbito/produto coberto (ex: saneamento c/ pressão, PN10 Ø110–630)",
      "validity": "validade (ex: 02/2031) ou null"
    }
  ],
  "documents_without_application": [
    {
      "document": "documento(s) entregue(s) SEM aplicação a este PAM. AGRUPA numa só entrada os que partilham a MESMA razão (ex: 'Ferroplast, Plimat e FERSIL'); usa entradas separadas quando as razões diferem",
      "reason": "porquê não se aplica — comum a todos os documentos desta entrada (ex: EN 1329-1 Série B — evacuação no interior de edifícios; MQT fixa PN10 enterrado)"
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
- Escreve como uma pessoa escreve, não como um relatório: frases curtas, sem "venho por este meio", sem bullet points no email, sem repetir o nome do material em todas as frases. Uma saudação, o essencial, o passo seguinte, um fecho.
${assinaturaRegra}

CONFRONTO CONTRATUAL (OBRIGATÓRIO quando o PAM cita o MQT/CE):
- Identifica no PAM os artigos do MQT/Caderno de Encargos citados (ex.: "Art.º 1.3.4-1.3.6", "1.4.5-1.4.9", "1.4.11", "Conforme MQT").
- Para CADA artigo citado, confronta o que o MQT/CE especifica (do contexto disponível) com o que o empreiteiro propõe → preenche "mqt_confrontation".
- HONESTIDADE (inviolável): se o conteúdo do artigo do MQT/CE NÃO estiver no contexto (só tens o nome/resumo do documento, não a especificação do artigo), NÃO escrevas "conforme MQT" nem finjas o confronto — DECLARA "MQT não consultado ao nível do artigo <X>" em "missing_information", e uma rejeição não pode assentar num confronto que não fizeste.

HIERARQUIA DOCUMENTAL (INVIOLÁVEL — determina QUEM decide o veredicto):
- O MQT É O DOCUMENTO QUE VALIDA O MATERIAL. Prioridade 1. O veredicto sai SEMPRE do MQT.
  Se o MQT fixa uma característica (classe de pressão, norma, diâmetro), propor essa
  característica é CUMPRIR o contratual — nunca um erro nem uma designação a corrigir.
- O CTE / Caderno de Encargos é prioridade 2: é CITADO como referência e VERIFICADO, e o
  resultado dessa verificação vai para "cte_sections". Nunca decide o veredicto.
- Classificação de cada secção do CTE em "cte_sections.verdict":
  · bate 100% com o MQT/PAM → "CONFORME";
  · o MQT/PAM EXCEDE o requisito do CTE (ex.: PN10 onde o CTE pede PN6) → "CONFORME_POR_EXCESSO".
    Característica SUPERIOR à exigida NUNCA é não-conformidade;
  · o CTE DIVERGE do MQT → REGISTA a divergência em "verification" com os DADOS REAIS DOS DOIS
    LADOS (o que o MQT fixa e o que o CTE pede, com valores). O relatório entrega os factos ao
    fiscal; a decisão sobre a divergência é DELE, não tua. O veredicto do PAM não muda;
  · requisito de execução/ensaio a controlar em obra → "A_ACAUTELAR_EM_EXECUCAO".
- PROIBIDO rejeitar o PAM com base no CTE contra o MQT.
- PROIBIDO declarar que o MQT está errado, desactualizado ou que deve ser corrigido.
- Só há divergência a assinalar quando o proposto é INFERIOR ao que o MQT fixa ou INCOMPATÍVEL
  com a aplicação (norma de âmbito diferente, produto fora do uso previsto).
- Isto NÃO revoga a regra de HONESTIDADE acima: se não tens o MQT ao nível do artigo, declara-o.

CABEÇALHO DO RELATÓRIO (campos do topo — extrai do PAM, nunca inventes):
- "pam_reference": a referência tal como está escrita no documento (ex: "PAM 011"). Se não
  constar → null e declara em "missing_information".
- "empreiteiro": APENAS o nome da EMPRESA empreiteira que submete o pedido, extraído do PAM.
  NUNCA a pessoa que assinou o email, NUNCA o cargo, NUNCA texto entre parênteses ou explicações
  (ex: correcto = "Ferreira Build Power"; ERRADO = "Tiago Gonçalves (Director de Obra…)"). Se só
  souberes uma pessoa, usa a empresa a que pertence; se nem a empresa constar → null e declara em
  "missing_information". NUNCA deduzas nem inventes.
- "documents_crossed": rótulo COMPACTO de cada contratual cruzado, um por entrada (ex:
  "MQT Fases 1.1/1.2", "CTE Esgotos Domésticos", "CTE Esgotos Pluviais"). NUNCA nomes de ficheiro,
  NUNCA datas nem revisões. Vazio se nenhum.

TABELAS DA REFERÊNCIA (5 blocos — preenche com dados REAIS, nunca inventados):
- "header_sintese": veredito + base da análise + material. A base_analise diz explicitamente com que MQT/CTE se cruzou; se não houve nenhum no contexto, escreve "sem confronto contratual — baseado em normas gerais".
- "mqt_articles_by_phase" e "cte_sections" (tabelas 1 e 2): SÓ preenche se tiveres o MQT/CTE no contexto (PDF anexado, contratual da Base de Conhecimento, ou resumo com o artigo/secção). Se NÃO houver MQT/CTE ao nível do artigo/secção, devolve ARRAY VAZIO [] e declara em "missing_information" que "as tabelas de MQT/CTE não foram preenchidas — documento não consultado". NUNCA inventes artigos, fases, diâmetros, quantidades ou secções. Coerência total com a regra do mqt_confrontation.
- "supporting_documents" e "documents_without_application" (tabelas 3 e 4): constrói a partir dos certificados/documentos de fabricante ANALISADOS — sejam os PDFs anexados OU as EXTRAÇÕES ESTRUTURADAS fornecidas no contexto (quando a análise foi feita por grupos). Usa nº, norma, âmbito e validade REAIS. Em "documents_without_application" explica porque cada documento entregue não se aplica a este PAM. AGRUPAMENTO OBRIGATÓRIO: documentos que não se aplicam PELA MESMA razão vão numa ÚNICA entrada, com os nomes juntos em "document" (ex: "Ferroplast, Plimat e FERSIL") e a razão comum em "reason". Só usa entradas separadas quando as razões são efectivamente diferentes. O relatório imprime este bloco como prosa corrida, por isso o agrupamento é teu, não do gerador.

REGRAS DE FIABILIDADE (INVIOLÁVEIS):
- NUNCA inventes nomes de fornecedores, números de certificados PSG, números de DC, ou datas. Usa APENAS dados que encontras nos documentos da Base de Conhecimento.
- O nome do ficheiro na Base de Conhecimento contém a informação real. Exemplo: "PSG 001-2022 e DC 380 SN Maia.pdf" → fornecedor é SN Maia, certificado é PSG-001/2022, DC é 380.
- Em cada compliance_check, o campo "source_file" deve conter o nome EXACTO do ficheiro consultado.
- Se não encontras informação sobre um fornecedor ou certificado, escreve "Sem documentação na Base de Conhecimento" — NUNCA inventes dados.
- Na justificação, refere os documentos consultados pelos nomes exactos dos ficheiros.
- Se o caderno de encargos não foi fornecido, indica isso em "missing_information".
- Preenche "certificates_validity" para CADA certificado/laudo que consigas ler (anexado ou da Base de Conhecimento). Compara a data de validade com a DATA DE HOJE (${today}): já passou → status "expirado"; sem data de validade legível → "sem_data"; documento ilegível/incompleto → "ilegivel"; caso contrário → "valido".`;
}

// Signed URL de um objecto do storage (a Anthropic vai buscar por url) — ZERO bytes de PDF na memória.
// TTL cobre a análise (400s background) + fetch da Anthropic, em todas as passagens. Erro ruidoso; null → caller decide.
const SIGNED_URL_TTL = 1800; // 30 min
async function signedUrl(supabase: any, path: string, bucket = "material-approvals"): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) {
      console.error(`PAM: signed URL FALHOU (${bucket}/${path}):`, error?.message || "sem url");
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.error(`PAM: signed URL EXCEPÇÃO (${bucket}/${path}):`, (e as any)?.message || e);
    return null;
  }
}
const isImageName = (name: string) => /\.(jpe?g|png|webp|gif)$/i.test(name || "");

// Background tasks do Supabase (Pro+: até 400s). Declarado para o deno check; guardado em runtime.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

// Orçamento de PÁGINAS de PDF por request. Anthropic: 100pp/request em modelos 200k
// (Sonnet 4.5). Margem para overhead → 85. Imagens NÃO contam para este limite.
const MAX_PAGES_PER_PASS = 85;
// Custo assumido para um PDF sem contagem conhecida (legado/medição falhada): ocupa o
// orçamento inteiro → isolado na sua passagem. Nunca deixa por ler; só rebenta
// (declarado) se um único PDF real exceder 100pp.
const UNKNOWN_PDF_PAGES = MAX_PAGES_PER_PASS;

interface DocBlock { name: string; url: string; isImage: boolean; kind: "cert" | "mfg"; pages: number; path: string; }

// Custo de orçamento de um bloco: imagens = 0; PDF com contagem = a contagem; PDF sem = UNKNOWN.
function pdfPages(isImage: boolean, pages: number | null | undefined): number {
  if (isImage) return 0;
  return (typeof pages === "number" && pages > 0) ? pages : UNKNOWN_PDF_PAGES;
}

// Blocos de conteúdo Anthropic (source url) para certs/docs de fabricante.
function docContentBlocks(docs: DocBlock[]): any[] {
  const blocks: any[] = [];
  for (const d of docs) {
    blocks.push({ type: d.isImage ? "image" : "document", source: { type: "url", url: d.url } });
    blocks.push({ type: "text", text: `[${d.kind === "cert" ? "CERTIFICADO/LAUDO" : "DOCUMENTO DO FABRICANTE"}: ${d.name}]` });
  }
  return blocks;
}

// Agrupa por ORÇAMENTO DE PÁGINAS (guloso, preserva ordem). Um doc cujo custo excede o
// budget vai sozinho (e se for PDF real > 100pp, a passagem rebenta na Anthropic → declarado).
function packByPages<T extends { pages: number }>(docs: T[], budget: number): T[][] {
  const groups: T[][] = [];
  let cur: T[] = [], used = 0;
  for (const d of docs) {
    if (cur.length > 0 && used + d.pages > budget) { groups.push(cur); cur = []; used = 0; }
    cur.push(d); used += d.pages;
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

// Persiste progresso em ai_analysis._progress SEM destruir o resto (lê→merge→escreve). Sem migração.
async function writeProgress(supabase: any, approvalId: string, progress: { current: number; total: number; label: string }): Promise<void> {
  try {
    const { data } = await supabase.from("material_approvals").select("ai_analysis").eq("id", approvalId).single();
    const prev = (data?.ai_analysis && typeof data.ai_analysis === "object") ? data.ai_analysis : {};
    await supabase.from("material_approvals")
      .update({ ai_analysis: { ...prev, _progress: { ...progress, at: new Date().toISOString() } }, updated_at: new Date().toISOString() })
      .eq("id", approvalId);
  } catch (e) { console.error("PAM: falha ao escrever progresso:", (e as any)?.message || e); }
}

// Orçamento de tempo POR INVOCAÇÃO. Wall-clock Pro = 400s; deixamos margem para
// persistir o progresso + re-invocar antes de a plataforma matar o worker.
const WALL_CLOCK_MS = 400_000;
const SAFE_BUDGET_MS = 300_000;   // extrações: pára e re-invoca ao passar isto
const FINAL_RESERVE_MS = 200_000; // a passagem final (web_search) exige pelo menos isto disponível
// Margem que fica DEPOIS de abortarmos a passagem final, para o catch escrever _error e
// repor 'pending'. Sem este colchão o wall-clock mata o worker antes de registar a falha.
const FINAL_ABORT_MARGIN_MS = 25_000;
// Handoff entre invocações encadeadas.
const HANDOFF_TIMEOUT_MS = 20_000; // um handoff que não responde é falha, não espera eterna
const MAX_HOPS = 12;               // teto de passagens: se não converge, DECLARA em vez de encadear sem fim
// Marcador de build: aparece no log de arranque de CADA invocação. Serve para saber, numa
// autópsia, que código correu naquela passagem. Actualizar quando o comportamento mudar.
const PAM_BUILD = "2026-07-21 handoff-verificado+timeout-final";

// Persiste o estado das extrações de certs em ai_analysis._cert_extractions (merge, sem
// migração). Erro RUIDOSO — perder o estado obrigaria a re-extrair na invocação seguinte.
async function mergeCertState(supabase: any, approvalId: string, cert: { items: any[]; done_paths: string[] }): Promise<void> {
  const { data } = await supabase.from("material_approvals").select("ai_analysis").eq("id", approvalId).single();
  const prev = (data?.ai_analysis && typeof data.ai_analysis === "object") ? data.ai_analysis : {};
  const { error } = await supabase.from("material_approvals")
    .update({ ai_analysis: { ...prev, _cert_extractions: cert }, updated_at: new Date().toISOString() })
    .eq("id", approvalId);
  if (error) throw new Error(`Falha a persistir estado de certs: ${error.message}`);
}

// Extração robusta de JSON (objecto ou array).
function extractJson(text: string): any {
  let cleaned = (text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const firstObj = cleaned.indexOf("{"), firstArr = cleaned.indexOf("[");
  const start = (firstArr !== -1 && (firstArr < firstObj || firstObj === -1)) ? firstArr : firstObj;
  const last = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start !== -1 && last > start) cleaned = cleaned.substring(start, last + 1);
  return JSON.parse(cleaned);
}

const EXTRACTION_SYSTEM = `És o Eng. Silva a fazer TRIAGEM DOCUMENTAL (não é o parecer final). Recebes o PAM, o email, os contratuais e um GRUPO de certificados/documentos de fabricante. Extrai, para CADA documento do grupo, os dados estruturados — sem dar veredito, sem pesquisar online. Cita o nome EXACTO do ficheiro. Se um dado não estiver no documento, usa null. NUNCA inventes. Responde SÓ com um ARRAY JSON (sem markdown), cada item:
{"supplier": "fornecedor/fabricante", "document": "nome exacto do ficheiro", "doc_type": "um de: DoP, certificado_CE, laudo_ensaio, ficha_tecnica, outro", "certificate_number": "PSG/Certif/nº ou null", "dc_lnec": "DC xxx ou null", "norm": "norma(s) ou null", "scope": "âmbito/produto coberto (classe, diâmetros, pressão) ou null", "issue_date": "DD/MM/AAAA ou null", "expiry_date": "DD/MM/AAAA ou null", "adequacy": "1 frase: adequação ao material do PAM", "notes": "o que falta/preocupa ou null"}
Responde SEMPRE em português europeu.`;

const EXTRACTION_INSTRUCTION = "Extrai os dados estruturados dos certificados/documentos de fabricante ACIMA (só deste grupo), como ARRAY JSON conforme o teu system prompt. Não dês parecer nem pesquises online.";

// Extração PRÉVIA dos contratuais: lê MQT/CE/CTE/Contrato INTEGRALMENTE e extrai a
// estrutura por artigo/secção (formato F4). Substitui os PDFs contratuais nas passagens
// seguintes quando o prefixo contratual não cabe no orçamento de páginas.
const CONTRACTUAL_EXTRACTION_SYSTEM = `És o Eng. Silva a fazer LEITURA INTEGRAL dos documentos contratuais (MQT / Caderno de Encargos / Condições Técnicas / Contrato) — NÃO é o parecer. Recebes o PAM, o email e um GRUPO de contratuais. Extrai a estrutura por artigo/secção que servirá para confrontar o PAM. Cita o nome EXACTO do ficheiro. Se um dado não estiver no documento, usa null. NUNCA inventes artigos, diâmetros, quantidades ou secções. Responde SÓ com um ARRAY JSON (sem markdown), um item por documento contratual:
{"document": "nome exacto do ficheiro", "doc_kind": "um de: MQT, CE, CTE, Contrato, outro", "revisao": "revisão (ex. Rev.02, Dez 2025) ou null", "mqt_articles": [{"fase": "fase da obra ou null", "article": "artigo (ex. 1.3.3.1–.3)", "description": "descrição", "diameter": "diâmetro(s) ou null", "quantity": "quantidade(s) com unidade ou null", "norm": "norma ou null"}], "cte_sections": [{"section": "documento/secção (ex. Domésticos — 3.4.1)", "requirement": "requisito de projeto"}]}
Responde SEMPRE em português europeu.`;

const CONTRACTUAL_EXTRACTION_INSTRUCTION = "Lê INTEGRALMENTE os documentos contratuais ACIMA (só deste grupo) e extrai a estrutura por artigo/secção, como ARRAY JSON conforme o teu system prompt. Não dês parecer.";

// Uma passagem de extração. Sinaliza truncamento (NÃO faz throw) para a rede de
// degradação decidir re-dividir. Throw só em falha dura de JSON. Truncamento é ruidoso.
async function runExtractionPass(opts: {
  apiKey: string; content: any[]; system: string; maxTokens: number; label: string;
}): Promise<{ truncated: boolean; data: any[] }> {
  const { apiKey, content, system, maxTokens, label } = opts;
  const loop = await runClaudeWithContinuation({
    apiKey, model: "claude-sonnet-4-5-20250929", maxTokens, temperature: 0,
    system, messages: [{ role: "user", content }],
    maxIterations: 2, logPrefix: `[PAM ${label}]`,
  });
  if (loop.finalStopReason === "max_tokens" || loop.hitIterationCap) {
    console.warn(`PAM: extração (${label}) truncada (stop_reason=${loop.finalStopReason}) — a rede vai re-dividir se houver >1 doc.`);
    return { truncated: true, data: [] };
  }
  // Falha da API numa continuação: accumulatedText é PARCIAL. Interpretá-lo produziria um
  // "JSON inválido" que esconde a causa verdadeira. Erro nomeado, com a causa da API.
  if (loop.apiFailed) {
    throw new Error(`Extração (${label}): falha na API Anthropic — ${loop.apiError} (resposta parcial, ${(loop.accumulatedText || "").length} chars; parse não tentado).`);
  }
  const replyText = loop.accumulatedText || "[]";
  let arr: any;
  try { arr = extractJson(replyText); } catch (e) {
    // Log rico (mesmo formato do parecer final, :1268): sem head/tail/stop_reason um JSON
    // malformado é indistinguível de uma resposta cortada e fica indiagnosticável depois.
    console.error(`PAM: EXTRAÇÃO PARSE FALHOU (${label}) —`, JSON.stringify({
      message: (e as any)?.message,
      stop_reason: loop.finalStopReason,
      iterations_used: loop.iterationsUsed,
      reply_length: replyText.length,
      reply_head: replyText.slice(0, 600),
      reply_tail: replyText.slice(-600),
    }));
    throw new Error(`Extração (${label}): JSON inválido — ${(e as any)?.message}`);
  }
  return { truncated: false, data: Array.isArray(arr) ? arr : [arr] };
}

// REDE DE DEGRADAÇÃO: corre a extração de um grupo; se truncar (max_tokens) e houver
// >1 doc, re-divide ao meio e repete cada metade (recursivo, até grupos de 1 doc). O
// pipeline nunca trava por um grupo gordo — adapta-se. PER-DOC CACHE (chave = url única
// por doc): um documento extraído com sucesso individualmente é memoizado e NUNCA
// re-processado numa re-divisão. Só falha DECLARADO se um ÚNICO documento truncar
// sozinho, com o nome do doc (nunca silenciado).
async function extractGroupAdaptive<T extends { name: string; url: string }>(
  blocks: T[],
  buildContent: (bs: T[]) => any[],
  cfg: { apiKey: string; system: string; maxTokens: number; label: string },
  cache: Map<string, any[]> = new Map(),
): Promise<any[]> {
  const cachedData = blocks.filter((b) => cache.has(b.url)).flatMap((b) => cache.get(b.url)!);
  const pending = blocks.filter((b) => !cache.has(b.url));
  if (pending.length === 0) return cachedData;

  const res = await runExtractionPass({
    apiKey: cfg.apiKey, content: buildContent(pending), system: cfg.system,
    maxTokens: cfg.maxTokens, label: cfg.label,
  });
  if (!res.truncated) {
    if (pending.length === 1) cache.set(pending[0].url, res.data); // memoiza o doc individual
    return [...cachedData, ...res.data];
  }
  if (pending.length <= 1) {
    throw new Error(`Extração (${cfg.label}) do documento "${pending[0]?.name ?? "?"}" truncada mesmo com ${cfg.maxTokens} tokens de output — documento demasiado denso para uma única passagem. Falha declarada (nunca silenciada).`);
  }
  const mid = Math.ceil(pending.length / 2);
  console.warn(`PAM: ${cfg.label} truncou com ${pending.length} docs — re-dividir ${mid}+${pending.length - mid} e repetir.`);
  const left = await extractGroupAdaptive(pending.slice(0, mid), buildContent, { ...cfg, label: `${cfg.label}·A` }, cache);
  const right = await extractGroupAdaptive(pending.slice(mid), buildContent, { ...cfg, label: `${cfg.label}·B` }, cache);
  return [...cachedData, ...left, ...right];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Refs para o catch repor 'pending' se algo rebentar DEPOIS de adquirir o lock.
  let supabaseRef: any = null;
  let lockedApprovalId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabaseRef = supabase;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authToken = authHeader.replace("Bearer ", "");

    const body = await req.json();
    if (!body.approval_id || typeof body.approval_id !== "string") {
      return new Response(JSON.stringify({ error: "approval_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const approval_id = body.approval_id;
    // Identidade REAL do fiscal (do cliente) para assinar o email — nunca inventada pelo modelo.
    const fiscal_name = (typeof body.fiscal_name === "string" && body.fiscal_name.trim()) ? body.fiscal_name.trim() : null;
    const fiscal_company = (typeof body.fiscal_company === "string" && body.fiscal_company.trim()) ? body.fiscal_company.trim() : null;

    // CONTINUAÇÃO INTERNA: só a própria function (service key) pode encadear invocações.
    // Salta a auth de utilizador e o lock (já adquiridos pela 1ª invocação).
    const isContinuation = body._continuation === true && authToken === supabaseKey;

    let authedUserId: string | null = null;
    if (!isContinuation) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      authedUserId = user.id;
    }

    // Registo = fonte única de verdade. Normal: gated por dono (RLS aplicativo).
    // Continuação: por id (o dono já foi validado na 1ª invocação).
    let recQuery = supabase
      .from("material_approvals")
      .select("obra_id, user_id, material_category, status, ai_analysis, pdm_file_path, pdm_page_count, email_file_path, email_file_mime, email_page_count, mqt_file_path, mqt_name, mqt_page_count, ce_file_path, ce_file_name, ce_page_count, contract_file_path, contract_file_name, contract_page_count, certificates, manufacturer_docs")
      .eq("id", approval_id);
    if (!isContinuation) recQuery = recQuery.eq("user_id", authedUserId);
    const { data: rec, error: recErr } = await recQuery.single();
    if (recErr || !rec) {
      console.warn(`PAM: registo não encontrado ou sem permissão (approval_id=${approval_id}, continuation=${isContinuation}): ${recErr?.message || "vazio"}`);
      return new Response(JSON.stringify({ error: "Aprovação não encontrada ou sem permissão." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const obra_id = rec.obra_id;
    const user_id = rec.user_id;
    const material_category = rec.material_category;
    if (!rec.pdm_file_path) {
      return new Response(JSON.stringify({ error: "PAM em falta no registo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!rec.email_file_path) {
      return new Response(JSON.stringify({ error: "Print do email do empreiteiro em falta no registo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const certificates: Array<{ name: string; path: string; size?: number }> = Array.isArray(rec.certificates) ? rec.certificates : [];
    const manufacturer_docs: Array<{ name: string; path: string; size?: number }> = Array.isArray(rec.manufacturer_docs) ? rec.manufacturer_docs : [];

    // ARRANQUE — primeira linha de CADA invocação (inclui as encadeadas). Sem isto, uma
    // passagem que morra cedo não deixa rasto nenhum e a autópsia fica impossível.
    const hopIn = Number(body._hop) || 0;
    console.log(`PAM ARRANQUE: build=${PAM_BUILD} | hop=${hopIn} | continuation=${isContinuation} | approval=${approval_id} | status_lido=${rec.status} | certs=${certificates.length} mfg=${manufacturer_docs.length}`);

    console.log("PAM: Request received:", JSON.stringify({
      approval_id, obra_id, material_category, user_id,
      has_mqt: !!rec.mqt_file_path,
      has_ce: !!rec.ce_file_path,
      has_contract: !!rec.contract_file_path,
      certs: certificates.length,
      mfg_docs: manufacturer_docs.length,
    }));

    // Lock atómico (só na 1ª invocação). UPDATE único (atómico à linha) → duas invocações
    // simultâneas não passam ambas; a 2ª afecta 0 linhas → 409. A continuação NÃO re-adquire
    // (o lock 'analyzing' já é nosso) — apenas confirma que ainda é a nossa análise.
    if (!isContinuation) {
      const { data: locked, error: lockErr } = await supabase
        .from("material_approvals")
        .update({ status: "analyzing", updated_at: new Date().toISOString() })
        .eq("id", approval_id)
        .neq("status", "analyzing")
        .select("id");
      if (lockErr) {
        // Erro ruidoso — falha ao adquirir o lock nunca é mascarada.
        throw new Error(`Falha ao adquirir lock de análise: ${lockErr.message}`);
      }
      if (!locked || locked.length === 0) {
        console.warn(`PAM: análise JÁ em curso para ${approval_id} — invocação paralela rejeitada (409).`);
        return new Response(
          JSON.stringify({ error: "Já existe uma análise em curso para este PAM. Aguarde a conclusão." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (rec.status !== "analyzing") {
      // Continuação órfã: alguém repôs 'pending' ou eliminou. Aborta limpo (não re-processa).
      console.warn(`PAM: continuação abortada — status=${rec.status} (já não é a nossa análise).`);
      return new Response(JSON.stringify({ ok: true, aborted: rec.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    lockedApprovalId = approval_id; // a partir daqui o catch externo deve repor 'pending'

    // Respond-early (F3): a análise corre em background (Pro+: até 400s), sem tocar no idle de 150s.
    // O corpo do pipeline abaixo corre dentro desta closure.
    const runInBackground = async () => {
    try {

    // Data de hoje (para o modelo aferir validade/caducidade dos certificados).
    const todayISO = new Date().toISOString().slice(0, 10);
    const t0 = Date.now(); // checkpoints de observabilidade (dão a timeline de cada etapa nos logs)

    // Encadeamento: cada invocação processa o que couber em SAFE_BUDGET_MS e re-invoca-se
    // para continuar. Teto de 400s POR invocação, nunca por análise. Retoma idempotente
    // (a function extrai só o que ainda não está persistido).
    const functionUrl = `${supabaseUrl}/functions/v1/analyze-material-approval`;
    let processedThisInvocation = 0;
    const overBudget = () => (Date.now() - t0) > SAFE_BUDGET_MS;
    // Handoff para a passagem seguinte. TUDO o que possa correr mal aqui tem de ser
    // ruidoso: um handoff perdido em silêncio deixa o registo preso em 'analyzing' para
    // sempre, sem _error e sem forma de saber que parou. O throw sobe ao catch do
    // background, que escreve _error e repõe 'pending' → falha visível e recuperável.
    const reinvoke = async (reason: string) => {
      const hop = hopIn + 1;
      console.log(`PAM HANDOFF: orçamento (${Date.now() - t0}ms) — passar para hop ${hop} (${reason}).`);
      // Teto de encadeamento: sem isto, uma análise que não converge encadeia-se
      // indefinidamente e consome tempo sem nunca declarar nada.
      if (hop > MAX_HOPS) {
        throw new Error(`Handoff abortado: ${hop} passagens encadeadas excedem o limite de ${MAX_HOPS} — a análise não está a convergir (razão da última: ${reason}).`);
      }
      await writeProgress(supabase, approval_id, { current: 0, total: 0, label: `A continuar noutra passagem (${reason})…` });
      let resp: Response;
      try {
        resp = await fetch(functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ approval_id, fiscal_name, fiscal_company, _continuation: true, _hop: hop }),
          signal: AbortSignal.timeout(HANDOFF_TIMEOUT_MS),
        });
      } catch (hopErr: any) {
        const nm = hopErr?.name;
        const why = (nm === "TimeoutError" || nm === "AbortError")
          ? `sem resposta em ${HANDOFF_TIMEOUT_MS}ms`
          : (hopErr?.message || String(hopErr));
        throw new Error(`Handoff falhou (hop ${hop}, ${reason}): ${why}`);
      }
      if (!resp.ok) {
        throw new Error(`Handoff falhou (hop ${hop}, ${reason}): HTTP ${resp.status} — ${(await resp.text().catch(() => "")).slice(0, 300)}`);
      }
      // ATENÇÃO: 2xx confirma só que a passagem seguinte ACEITOU (respond-early, 202).
      // NÃO confirma que ela concluiu — se morrer no background, quem fala é o ARRANQUE
      // dela nos logs (ou a ausência dele).
      console.log(`PAM HANDOFF: hop ${hop} aceite (HTTP ${resp.status}) — esta passagem termina aqui.`);
    };

    // 6. Retrieval MOVIDO para antes da montagem: contratuais da KB (Via 2) têm de ser
    // anexados ANTES dos certificados (prioridade de orçamento).
    let knowledge: KnowledgeResult = { context: "", sources: [], hasContractual: false, ceForCategoryFound: false };
    let retrievalMode = "hybrid";
    try {
      const materialQuery = material_category;
      knowledge = await fetchProjectKnowledgeHybrid(supabase, obra_id, material_category, user_id, materialQuery);
      console.log(`[PAM retrieval] hybrid OK, context length: ${knowledge.context.length}, sources: ${knowledge.sources.length}`);
    } catch (hybridErr) {
      console.error(`[PAM retrieval] hybrid FAILED, fallback to legacy:`, hybridErr);
      retrievalMode = "legacy";
      knowledge = await fetchProjectKnowledgeLegacy(supabase, obra_id, material_category, user_id);
      console.log(`[PAM retrieval] legacy fallback, context length: ${knowledge.context.length}, sources: ${knowledge.sources.length}`);
    }
    const knowledgeContext = knowledge.context;
    const hasKnowledge = knowledgeContext.length > 0;
    console.log(`PAM: Knowledge context (${retrievalMode}): ${hasKnowledge ? `${knowledgeContext.length} chars` : "none"}`);
    console.log(`PAM CK: retrieval feito (+${Date.now() - t0}ms)`);

    const analyzedCerts: string[] = [];
    const skippedCerts: Array<{ name: string; reason: string }> = [];
    const analyzedMfg: string[] = [];
    const skippedMfg: Array<{ name: string; reason: string }> = [];
    const attachedContractuais: string[] = [];
    const skippedContractuais: Array<{ name: string; reason: string }> = [];

    const content: any[] = [];

    // 0. Email do empreiteiro — OBRIGATÓRIO. Signed URL (a Anthropic vai buscar). Fail-loud → throw (BG catch escreve _error).
    const emailUrl = await signedUrl(supabase, rec.email_file_path);
    if (!emailUrl) throw new Error("Falha ao gerar signed URL do print do email.");
    const emailIsPdf = rec.email_file_mime === "application/pdf" || /\.pdf$/i.test(rec.email_file_path);
    content.push(emailIsPdf
      ? { type: "document", source: { type: "url", url: emailUrl } }
      : { type: "image", source: { type: "url", url: emailUrl } });
    content.push({
      type: "text",
      text: "[EMAIL DO EMPREITEIRO — print/screenshot do email que acompanha o PAM. Lê o remetente, o tom, como se dirige ao fiscal, e usa esta informação para adaptar a tua resposta. Se ele é formal, sê formal. Se é mais directo, sê directo. Adapta-te.]",
    });
    console.log(`PAM CK: email pronto (+${Date.now() - t0}ms)`);

    // 1. PAM (sempre) — signed URL. Fail-loud → throw.
    const pamUrl = await signedUrl(supabase, rec.pdm_file_path);
    if (!pamUrl) throw new Error("Falha ao gerar signed URL do PAM.");
    content.push({ type: "document", source: { type: "url", url: pamUrl } });
    content.push({
      type: "text",
      text: "[PEDIDO DE APROVAÇÃO DE MATERIAIS (PAM) — documento do empreiteiro acima]",
    });
    console.log(`PAM CK: PAM pronto (+${Date.now() - t0}ms)`);

    // Páginas do prefixo NÃO-contratual (email + PAM). Imagens = 0.
    const emailPages = pdfPages(!emailIsPdf, rec.email_page_count);
    const pamPages = pdfPages(false, rec.pdm_page_count);
    const prefixCost = emailPages + pamPages;

    // 2. CONTRATUAIS (Via 1 manual + Via 2 KB) — fila dedup (URLs só para os pendentes).
    const normName = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
    const contractualQueue: Array<{ name: string; path: string; bucket: string; label: string; pages: number | null }> = [];
    if (rec.mqt_file_path) contractualQueue.push({ name: rec.mqt_name || "MQT", path: rec.mqt_file_path, bucket: "material-approvals", label: "MQT / MAPA DE QUANTIDADES — mapa de quantidades e trabalhos do projecto", pages: rec.mqt_page_count });
    if (rec.ce_file_path) contractualQueue.push({ name: rec.ce_file_name || "Caderno de Encargos", path: rec.ce_file_path, bucket: "material-approvals", label: "CADERNO DE ENCARGOS — condições técnicas, especificações de materiais, ensaios exigidos", pages: rec.ce_page_count });
    if (rec.contract_file_path) contractualQueue.push({ name: rec.contract_file_name || "Contrato", path: rec.contract_file_path, bucket: "material-approvals", label: "CONTRATO DA OBRA — contrato de empreitada", pages: rec.contract_page_count });
    for (const kb of (knowledge.contractualFiles || [])) {
      contractualQueue.push({ name: kb.document_name, path: kb.file_path, bucket: "project-knowledge", label: `CONTRATUAL DA BASE DE CONHECIMENTO: ${kb.document_name}`, pages: kb.pages ?? null });
    }
    const seenContractual = new Set<string>();
    const contractualDocs = contractualQueue.filter((c) => {
      const key = normName(c.name);
      if (key && seenContractual.has(key)) return false;
      if (key) seenContractual.add(key);
      return true;
    });

    // 4 + 5. Certificados e docs de fabricante — signed URL + páginas + path (ZERO bytes na memória).
    const docBlocks: DocBlock[] = [];
    for (const cert of certificates) {
      const url = await signedUrl(supabase, cert.path);
      if (!url) { skippedCerts.push({ name: cert.name, reason: "signed URL falhou" }); continue; }
      const isImg = isImageName(cert.name);
      docBlocks.push({ name: cert.name, url, isImage: isImg, kind: "cert", pages: pdfPages(isImg, (cert as any).pages), path: cert.path });
    }
    for (const mdoc of manufacturer_docs) {
      const url = await signedUrl(supabase, mdoc.path);
      if (!url) { skippedMfg.push({ name: mdoc.name, reason: "signed URL falhou" }); continue; }
      const isImg = isImageName(mdoc.name);
      docBlocks.push({ name: mdoc.name, url, isImage: isImg, kind: "mfg", pages: pdfPages(isImg, (mdoc as any).pages), path: mdoc.path });
    }

    console.log(`PAM CK: páginas — email=${emailPages} PAM=${pamPages} | contratuais=[${contractualDocs.map((c) => `${c.name}:${c.pages ?? "?"}`).join("; ")}] | certs/mfg=[${docBlocks.map((d) => `${d.name}:${d.isImage ? "img" : d.pages}`).join("; ")}] | orçamento/passagem=${MAX_PAGES_PER_PASS} (+${Date.now() - t0}ms)`);

    // ========================================================================
    // FASE CONTRATUAIS — 1 doc/passagem, extração PERSISTIDA por obra (reutilizada
    // por TODOS os PAMs e entre invocações encadeadas). Leitura integral mantida.
    // ========================================================================
    const contractualPaths = contractualDocs.map((c) => c.path);
    const { data: doneRows, error: doneErr } = contractualPaths.length > 0
      ? await supabase.from("contractual_extractions").select("doc_path, extraction").eq("obra_id", obra_id).in("doc_path", contractualPaths)
      : { data: [] as any[], error: null };
    if (doneErr) throw new Error(`Falha ao ler contractual_extractions: ${doneErr.message}`);
    const doneContractual = new Map<string, any[]>();
    // A coluna `extraction` é TEXT: o PostgREST devolve STRING, não array. Sem parse, o
    // Array.isArray dava sempre false e guardávamos a string JSON inteira como "um item" —
    // a consolidação recebia um blob duplamente escapado em vez de estrutura navegável.
    // Normaliza para o MESMO formato que :1140 guarda (array de objectos), venha text ou jsonb.
    for (const r of (doneRows || [])) {
      let ex: unknown = r.extraction;
      if (typeof ex === "string") {
        // Ruidoso: uma extração persistida ilegível não pode passar por boa nem ser silenciada.
        try { ex = JSON.parse(ex); } catch (e) {
          throw new Error(`Extração contratual persistida ilegível (doc_path=${r.doc_path}): ${(e as any)?.message}`);
        }
      }
      doneContractual.set(r.doc_path, Array.isArray(ex) ? ex : [ex]);
    }
    // HERANÇA — o que esta passagem recebeu já feito e o que lhe resta. Numa autópsia, é
    // isto que diz se o encadeamento estava a progredir ou a repetir-se.
    const pendingContratuais = contractualDocs.filter((c) => !doneContractual.has(c.path)).map((c) => c.name);
    console.log(`PAM HERANÇA: hop=${hopIn} | contratuais já persistidas=${doneContractual.size}/${contractualDocs.length} | por processar=[${pendingContratuais.join("; ") || "nenhuma"}]`);

    for (const c of contractualDocs) {
      if (doneContractual.has(c.path)) continue; // reutiliza extração já persistida (voa)
      if (processedThisInvocation >= 1 && overBudget()) { await reinvoke("mais contratuais por ler"); return; }
      const url = await signedUrl(supabase, c.path, c.bucket);
      if (!url) { skippedContractuais.push({ name: c.name, reason: "signed URL falhou" }); continue; }
      const isImg = isImageName(c.name);
      const cb = { name: c.name, url, isImage: isImg, pages: pdfPages(isImg, c.pages), path: c.path, label: c.label };
      // Contagem REAL do documento (null = desconhecida). cb.pages é o custo de ORÇAMENTO
      // (sentinela UNKNOWN_PDF_PAGES quando desconhecida) e NUNCA deve ser registado como
      // se fosse a contagem: gravá-lo faz a tabela mentir (4 docs distintos com "85pp").
      const realPages = (typeof c.pages === "number" && c.pages > 0) ? c.pages : null;
      await writeProgress(supabase, approval_id, { current: doneContractual.size + 1, total: contractualDocs.length, label: `A ler contratual: ${c.name}…` });
      const build = (bs: (typeof cb)[]) => [...content, { type: bs[0].isImage ? "image" : "document", source: { type: "url", url: bs[0].url } }, { type: "text", text: `[${bs[0].label}]` }, { type: "text", text: CONTRACTUAL_EXTRACTION_INSTRUCTION }];
      let ex: any[];
      try {
        ex = await extractGroupAdaptive([cb], build, { apiKey: anthropicKey, system: CONTRACTUAL_EXTRACTION_SYSTEM, maxTokens: 16000, label: `contratual ${c.name}` });
      } catch (exErr: any) {
        // Um documento que falhe a extração NÃO mata a análise inteira. Fica DECLARADO em
        // documents_not_analyzed (:1292) e _ingestion.contratuais.skipped (:1285), além do
        // console.error — ruidoso e visível no relatório, mas não bloqueante.
        console.error(`PAM: contratual "${c.name}" FALHOU a extração — ${exErr?.message || String(exErr)}`);
        skippedContractuais.push({ name: c.name, reason: `extração falhou: ${exErr?.message || String(exErr)}` });
        processedThisInvocation++; // conta como trabalho feito: não re-tenta em ciclo
        continue;
      }
      const { error: upErr } = await supabase.from("contractual_extractions").upsert(
        { obra_id, user_id, doc_name: c.name, doc_path: c.path, bucket: c.bucket, pages: realPages, extraction: ex, updated_at: new Date().toISOString() },
        { onConflict: "obra_id,doc_path" });
      // Falha de persistência é SISTÉMICA (schema/BD), não do documento — continua a rebentar.
      if (upErr) throw new Error(`Falha a persistir extração contratual "${c.name}": ${upErr.message}`);
      doneContractual.set(c.path, ex);
      processedThisInvocation++;
      console.log(`PAM: contratual "${c.name}" extraído e persistido (${realPages ?? "?"}pp reais) (+${Date.now() - t0}ms).`);
    }

    // ========================================================================
    // FASE CERTS — grupos por páginas, estado em ai_analysis._cert_extractions.
    // ========================================================================
    const prevCert = (rec.ai_analysis && (rec.ai_analysis as any)._cert_extractions) || { items: [], done_paths: [] };
    const cert: { items: any[]; done_paths: string[] } = { items: [...(prevCert.items || [])], done_paths: [...(prevCert.done_paths || [])] };
    const donePaths = new Set(cert.done_paths);
    const pendingCerts = docBlocks.filter((d) => !donePaths.has(d.path));
    const certBudget = MAX_PAGES_PER_PASS - prefixCost;
    const certGroups = packByPages(pendingCerts, certBudget);
    for (let gi = 0; gi < certGroups.length; gi++) {
      if (processedThisInvocation >= 1 && overBudget()) { await reinvoke("mais certificados por ler"); return; }
      await writeProgress(supabase, approval_id, { current: cert.done_paths.length, total: docBlocks.length, label: `A analisar certificados (${cert.done_paths.length}/${docBlocks.length})…` });
      const buildK = (bs: DocBlock[]) => [...content, ...docContentBlocks(bs), { type: "text", text: EXTRACTION_INSTRUCTION }];
      const ex = await extractGroupAdaptive(certGroups[gi], buildK, { apiKey: anthropicKey, system: EXTRACTION_SYSTEM, maxTokens: 16000, label: `cert grupo ${gi + 1}` });
      cert.items.push(...ex);
      for (const d of certGroups[gi]) cert.done_paths.push(d.path);
      await mergeCertState(supabase, approval_id, cert);
      processedThisInvocation++;
      console.log(`PAM: certs grupo ${gi + 1}/${certGroups.length} extraído (${ex.length} docs; acumulado ${cert.items.length}) (+${Date.now() - t0}ms).`);
    }

    // Contratuais + certs completos. Reconstrói a completude a partir do estado persistido
    // (numa invocação de continuação, os arrays locais estavam vazios).
    for (const c of contractualDocs) if (doneContractual.has(c.path)) attachedContractuais.push(c.name);
    const doneCertSet = new Set(cert.done_paths);
    for (const d of docBlocks) if (doneCertSet.has(d.path)) (d.kind === "cert" ? analyzedCerts : analyzedMfg).push(d.name);

    if (skippedCerts.length > 0 || skippedMfg.length > 0 || skippedContractuais.length > 0) {
      console.warn(`PAM: docs não analisados — contratuais=${skippedContractuais.length}, certs=${skippedCerts.length}, mfg=${skippedMfg.length}`);
    }
    console.log(`PAM: analisados contratuais=${attachedContractuais.length}, certs=${analyzedCerts.length}/${certificates.length}, mfg=${analyzedMfg.length}/${manufacturer_docs.length}`);

    // FASE FINAL (web_search → parecer). Exige uma invocação com tempo — se sobra pouco,
    // re-invoca para a final arrancar fresca. Depois injecta os textos das extrações.
    // A passagem final é ATÓMICA e NÃO persistida: ou cabe inteira nesta invocação, ou
    // perde-se por completo. Por isso corre SEMPRE numa invocação dedicada — se esta já
    // gastou tempo em extrações, re-invoca para o parecer arrancar com o wall-clock inteiro
    // (~400s) em vez do resto. Converge: com tudo já persistido, processedThisInvocation=0.
    const elapsedBeforeFinal = Date.now() - t0;
    if (processedThisInvocation > 0 || elapsedBeforeFinal > (WALL_CLOCK_MS - FINAL_RESERVE_MS)) {
      await reinvoke(`parecer final (esta passagem gastou ${elapsedBeforeFinal}ms em ${processedThisInvocation} extrações)`);
      return;
    }
    await writeProgress(supabase, approval_id, { current: docBlocks.length, total: docBlocks.length, label: "A consolidar o parecer final…" });
    const allContractualEx = contractualDocs.filter((c) => doneContractual.has(c.path)).flatMap((c) => doneContractual.get(c.path)!);
    if (allContractualEx.length > 0) content.push({ type: "text", text: `DOCUMENTOS CONTRATUAIS — EXTRAÇÕES ESTRUTURADAS (leitura integral persistida; TRATA-AS COMO OS PRÓPRIOS MQT/CE/CTE para o confronto contratual e para mqt_articles_by_phase / cte_sections):\n${JSON.stringify(allContractualEx, null, 2)}` });
    if (cert.items.length > 0) content.push({ type: "text", text: `CERTIFICADOS/DOCS DE FABRICANTE — EXTRAÇÕES ESTRUTURADAS (uma entrada de conformidade por fornecedor):\n${JSON.stringify(cert.items, null, 2)}` });

    // 7. Build context note based on available documents
    const docParts: string[] = [];
    if (attachedContractuais.length > 0) docParts.push(`os documentos contratuais em anexo (${attachedContractuais.length}: ${attachedContractuais.join("; ")})`);
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
5. Base de Conhecimento do Projecto (no system prompt) — inclui certificados PSG, DCs LNEC e fichas técnicas, MAS TAMBÉM os documentos contratuais processados: Caderno de Encargos, Mapa de Quantidades (MQT) e Contrato (como resumos). Se o PAM cita artigos do MQT/CE, procura-os nestes resumos.

REGRA FUNDAMENTAL: Quando o PAM refere "certificados em anexo" ou "conforme certificados", os certificados podem não estar no PDF do PAM mas sim na Base de Conhecimento. O fiscal carregou-os separadamente. Cruza SEMPRE o PAM com os certificados da Base de Conhecimento.

ATENÇÃO — MÚLTIPLOS FORNECEDORES:
O empreiteiro pode indicar "Vários" ou "Diversos" como fabricante porque vai usar material de múltiplos fornecedores — isto é normal em obras grandes. Verifica se TODOS os fornecedores nos certificados da Base de Conhecimento têm certificação válida, individualmente.

DOIS OUTPUTS OBRIGATÓRIOS:
1. O JSON técnico completo (para relatório interno da fiscalização)
2. Dentro do JSON, o campo "email_response" com o corpo do email de resposta ao empreiteiro (curto, directo, humano — o fiscal copia e envia)

${getAnalysisPrompt(material_category, todayISO, fiscal_name, fiscal_company)}`,
    });

    // 8. Build system prompt with knowledge context
    let systemPrompt = `És o Eng. Silva — director de fiscalização com mais de 20 anos de obra em Portugal. Já viste de tudo: empreiteiros que mandam certificados de outra obra, fornecedores com DCs caducados, betão que chega à obra sem guia de remessa. Não te escapam detalhes porque aprendeste com os erros dos outros.

COMO PENSAS (por camadas, não por checklist):

CAMADA 1 — ADEQUAÇÃO AO QUE O MQT FIXA (hierarquia documental inviolável)
Antes de olhar para um único certificado, perguntas: "O material proposto cumpre o que o MQT fixa para este trabalho?" O documento que VALIDA o material é o MQT (Mapa de Quantidades e Trabalhos) — é ele que fixa classe, norma e diâmetros, e é dele que sai SEMPRE o veredicto. O caderno de encargos / CTE e o projecto são REFERÊNCIA de 2.ª prioridade: citam-se e verificam-se, nunca decidem.
- O que o MQT fixa (classe, grau, norma de referência, diâmetros) — é ESTE o requisito de adequação.
- Que condições de exposição existem (classes ambientais, agressividade, contacto com solo, proximidade ao mar) — como contexto, não para contrariar o MQT.
- Que requisitos especiais estão definidos (recobrimentos, soldabilidade, resistência ao fogo, durabilidade, compatibilidade).
- Se há restrições a fabricantes, origens ou marcas.
REGRAS QUE NÃO PODES QUEBRAR:
- Se o material cumpre o que o MQT fixa, é ADEQUADO — ainda que o CTE use outra designação ou uma classe inferior. Uma divergência CTE-vs-MQT NUNCA torna o material inadequado nem rejeita o PAM: REGISTA-la na tabela CTE com os valores dos DOIS lados (o que o MQT fixa e o que o CTE pede), para o FISCAL decidir — o veredicto mantém-se o do MQT.
- Característica SUPERIOR à exigida (ex.: PN10 onde o CTE pede PN6) é CONFORME POR EXCESSO, nunca não-conformidade.
- É PROIBIDO declarar que o MQT está errado, desactualizado, ou que "a designação correcta seria" outra. O MQT é facto contratual; não o corriges nem o contestas.
- Só rejeitas por inadequação quando o proposto é INFERIOR ao que o MQT fixa, ou INCOMPATÍVEL com a aplicação por razão que o próprio MQT não cobre — NUNCA por divergir do CTE.

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

    // Loop de continuação para server tools (web_search pode pausar).
    // Mecânica isolada em _shared/anthropic-loop.ts para reutilização.
    const loopResult = await runClaudeWithContinuation({
      apiKey: anthropicKey,
      model: "claude-sonnet-4-5-20250929",
      maxTokens: 32000, // 5 blocos novos no output; margem sobre 16000 (o 009 rebentou 8000). Cabe nos 400s de background.
      temperature: 0, // parecer técnico é reprodutível, não escrita criativa (era default 1.0)
      system: systemPrompt,
      messages: [{ role: "user", content }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      toolChoice: hasKnowledge ? { type: "auto" } : undefined,
      maxIterations: 5,
      logPrefix: "[PAM loop]",
      // Aborta ANTES do wall-clock da plataforma, deixando FINAL_ABORT_MARGIN_MS para o
      // catch registar a falha. Era exactamente isto que faltava: sem timeout, a passagem
      // final excedeu os 400s, o worker foi morto ("shutdown/WallClockTime") e o catch
      // nunca correu — sem _error, sem repor 'pending', lock preso e falha SILENCIOSA.
      timeoutMs: Math.max(60_000, WALL_CLOCK_MS - (Date.now() - t0) - FINAL_ABORT_MARGIN_MS),
    });

    const accumulatedText = loopResult.accumulatedText;
    const totalWebSearches = loopResult.totalServerToolCalls;

    if (totalWebSearches === 0 && hasKnowledge) {
      console.warn("PAM: WARNING — web_search NÃO foi invocada apesar de haver base de conhecimento. Verificar se está habilitada na Anthropic Console (Settings → Privacy).");
    }

    const replyText = accumulatedText || "{}";

    // Guarda de truncação: resposta incompleta (max_tokens / cap de iterações) NUNCA vira parecer.
    if (loopResult.finalStopReason === "max_tokens" || loopResult.hitIterationCap) {
      console.error("PAM: resposta INCOMPLETA — sem parecer:", JSON.stringify({
        stop_reason: loopResult.finalStopReason,
        hit_iteration_cap: loopResult.hitIterationCap,
        reply_length: replyText.length,
        reply_tail: replyText.slice(-600),
      }));
      throw new Error("Resposta truncada (limite de tokens) — nenhum parecer gerado.");
    }

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
      // Fail-loud: NÃO fabricar veredito. Log completo (head+tail+stop_reason) + erro explícito.
      console.error("PAM: PARSE FALHOU — sem parecer:", JSON.stringify({
        message: (parseErr as any)?.message,
        stop_reason: loopResult.finalStopReason,
        reply_length: replyText.length,
        reply_head: replyText.slice(0, 600),
        reply_tail: replyText.slice(-600),
      }));
      throw new Error("Resposta do modelo inválida (JSON não interpretável) — nenhum parecer gerado.");
    }

    // Metadados AUTORITATIVOS (do NOSSO código, não do modelo) — transparência + avisos.
    analysis.sources_consulted = knowledge.sources;
    analysis.retrieval_path = retrievalMode;
    analysis.mqt_consulted = knowledge.mqt_consulted || [];
    analysis.no_contractual_in_context = !knowledge.hasContractual && !rec.mqt_file_path && !rec.ce_file_path && !rec.contract_file_path;
    analysis.ce_for_category_missing = !knowledge.ceForCategoryFound && !rec.ce_file_path;
    analysis.attachments_processing = {
      contractuais: { attached: attachedContractuais, skipped: skippedContractuais },
      certificates: { received: certificates.length, analyzed: analyzedCerts, skipped: skippedCerts },
      manufacturer_docs: { received: manufacturer_docs.length, analyzed: analyzedMfg, skipped: skippedMfg },
    };
    // Lista AUTORITATIVA (do nosso código) de tudo o que foi/não foi analisado — para o
    // escrutínio humano antes da assinatura. Nada cai "por tamanho"; skips só por URL/ilegível.
    analysis.documents_analyzed = [...attachedContractuais, ...analyzedCerts, ...analyzedMfg];
    analysis.documents_not_analyzed = [...skippedContractuais, ...skippedCerts, ...skippedMfg];

    // Update the approval record
    // Única escrita do parecer em todo o fluxo. Sem verificação, uma falha aqui era
    // silenciada: o log dizia "Analysis complete", o status ficava por actualizar e o
    // trabalho todo perdia-se sem rasto. Fail-loud → o catch do BG regista _error e repõe
    // 'pending'. O .select("id") apanha o caso de 0 linhas afectadas (registo eliminado
    // durante a análise), que um erro de BD não sinaliza.
    const { data: saved, error: saveErr } = await supabase
      .from("material_approvals")
      .update({
        status: analysis.recommendation,
        ai_analysis: analysis,
        ai_recommendation: analysis.justification,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approval_id)
      .select("id");
    if (saveErr) throw new Error(`Falha a gravar o parecer final (approval ${approval_id}): ${saveErr.message}`);
    if (!saved || saved.length === 0) throw new Error(`Parecer NÃO gravado: o registo ${approval_id} já não existe (eliminado durante a análise?).`);

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
    } catch (bgErr: any) {
      // Falha em background: repõe 'pending' e regista a causa em ai_analysis._error (preserva o resto).
      console.error("PAM BG ERROR:", bgErr);
      try {
        const { data: cur } = await supabaseRef.from("material_approvals").select("ai_analysis").eq("id", lockedApprovalId).single();
        const prev = (cur?.ai_analysis && typeof cur.ai_analysis === "object") ? cur.ai_analysis : {};
        const { _progress: _drop, ...rest } = prev;
        await supabaseRef.from("material_approvals")
          .update({ status: "pending", ai_analysis: { ...rest, _error: { message: bgErr?.message || String(bgErr), at: new Date().toISOString() } }, updated_at: new Date().toISOString() })
          .eq("id", lockedApprovalId);
      } catch (e) { console.error("PAM: falha ao repor pending no BG catch:", e); }
    }
    };
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(runInBackground());
    else await runInBackground();
    return new Response(JSON.stringify({ ok: true, started: true }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("PAM ERROR (pré-background):", error);
    // Orphan-guard: se o lock 'analyzing' já era nosso, repõe 'pending' — nunca deixa preso.
    if (supabaseRef && lockedApprovalId) {
      try {
        await supabaseRef.from("material_approvals")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", lockedApprovalId);
      } catch (resetErr) {
        console.error("PAM: falha ao repor 'pending' no catch:", resetErr);
      }
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
