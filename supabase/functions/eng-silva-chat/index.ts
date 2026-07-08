import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { voyageEmbed, voyageRerank } from "../_shared/embeddings/voyage-client.ts";

type NivelCat = {
  id: string;
  specialty: string;
  fase: string | null;
  piso: string | null;
  cota: number | null;
  tipo: string | null;
};

// Deteta escopo de fase/nível na pergunta, validado contra o catálogo da obra.
// Sem match no catálogo → devolve nulls (retrieval normal, sem boost).
function detectScope(
  message: string,
  niveis: NivelCat[],
): { fase: string | null; nivelId: string | null } {
  const msg = message.toLowerCase();
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  // Fase: só aceita tokens \d+.\d+ que EXISTAM no catálogo da obra
  const fasesCat = [...new Set(niveis.map((n) => n.fase).filter(Boolean))] as string[];
  const faseTokens = message.match(/\b\d+\.\d+\b/g) || [];
  const fase = faseTokens.find((t) => fasesCat.includes(t)) || null;

  // Nível: match único por piso (substring) ou por cota (número presente na msg)
  const nums = (message.match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
  const candidatos = niveis.filter((n) => {
    const scopeOk = !fase || n.fase === fase;
    const pisoOk = n.piso ? msg.includes(norm(n.piso)) : false;
    const cotaOk = n.cota != null ? nums.some((v) => Math.abs(v - Number(n.cota)) < 0.005) : false;
    return scopeOk && (pisoOk || cotaOk);
  });
  const nivelId = candidatos.length === 1 ? candidatos[0].id : null;
  return { fase, nivelId };
}

// Bloco de contexto para o system prompt: catálogo de fases/níveis da obra +
// analysis_context do IncompatiCheck (se existir) + regras de senso construtivo.
function buildSilvaContextBlock(
  niveis: NivelCat[],
  analysisContext: string | null,
  scopeFase: string | null,
): string {
  const parts: string[] = [];

  parts.push(
    "SENSO CONSTRUTIVO (aplica sempre): distinguir betão tosco de acabado é normal; " +
    "fundações e sapatas situam-se abaixo da laje de piso — não é incompatibilidade; " +
    "nunca especules além dos documentos — se um dado não está nos trechos, dizes que não está.",
  );

  if (niveis.length > 0) {
    const especialidades = [...new Set(niveis.map((n) => n.specialty))];
    const linhas = especialidades.map((esp) => {
      const fases = [...new Set(
        niveis.filter((n) => n.specialty === esp).map((n) => n.fase).filter(Boolean),
      )];
      return `- ${esp}: ${fases.length ? "fases " + fases.join(", ") : "(sem fases definidas)"}`;
    });
    parts.push("CATÁLOGO DE FASES/NÍVEIS DESTA OBRA:\n" + linhas.join("\n"));
  }

  if (analysisContext && analysisContext.trim()) {
    parts.push("CONTEXTO DA OBRA (IncompatiCheck):\n" + analysisContext.trim());
  }

  if (scopeFase) {
    parts.push(
      `ESCOPO DA PERGUNTA: o fiscal referiu-se à Fase ${scopeFase}. Prioriza os documentos ` +
      `dessa fase e cita o escopo; usa documentos gerais como apoio e não mistures informação ` +
      `de outras fases.`,
    );
  }

  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

/**
 * Retrieval semântico com Voyage embeddings + reranking.
 *
 * Fluxo:
 * 1. Embed a query (voyage-4)
 * 2. RPC match_knowledge_embeddings para buscar top-30 chunks similares
 * 3. Rerank com rerank-2.5 para top-12 chunks
 * 4. Enriquecer com metadata do documento (file_path, etc)
 *
 * Devolve: array de chunks enriquecidos, formato:
 *   { knowledge_id, document_name, specialty, document_type,
 *     chunk_text, chunk_type, file_path, summary, key_elements,
 *     similarity, rerank_score }
 */
async function searchKnowledgeSemantic(
  supabase: any,
  obraId: string,
  userId: string,
  query: string,
  pFase: string | null,
  pNivelId: string | null
): Promise<any[]> {
  // 1. Embed query
  const queryEmbedding = await voyageEmbed({
    input: query,
    inputType: "query",
  });

  // 2. Retrieval inicial via RPC (top 30). p_fase/p_nivel_id são opcionais:
  //    funcionam como boost (escopo exato primeiro) e excluem OUTRAS fases;
  //    documentos gerais (fase NULL) continuam sempre elegíveis.
  const { data: chunks, error: rpcErr } = await supabase.rpc(
    "match_knowledge_embeddings",
    {
      query_embedding: queryEmbedding[0],
      match_obra_id: obraId,
      match_user_id: userId,
      match_count: 30,
      match_threshold: 0.3,
      p_fase: pFase,
      p_nivel_id: pNivelId,
    }
  );

  if (rpcErr) throw new Error(`RPC match failed: ${rpcErr.message}`);
  if (!chunks || chunks.length === 0) return [];

  // 3. Rerank top-12
  const chunkTexts = chunks.map((c: any) => c.chunk_text);
  const reranked = await voyageRerank({
    query,
    documents: chunkTexts,
    topK: 12,
  });

  // 4. Mapear rerank scores de volta para os chunks + adicionar metadata
  const topChunks = reranked.map((r: any) => ({
    ...chunks[r.index],
    rerank_score: r.relevance_score,
  }));

  // 5. Enriquecer com metadata do documento (file_path, summary, key_elements)
  const knowledgeIds = [...new Set(topChunks.map((c: any) => c.knowledge_id))];
  const { data: docs, error: docsErr } = await supabase
    .from("eng_silva_project_knowledge")
    .select("id, file_path, summary, key_elements")
    .in("id", knowledgeIds);

  if (docsErr) throw new Error(`Doc enrichment failed: ${docsErr.message}`);

  const docsById: Record<string, any> = {};
  for (const d of (docs || [])) docsById[d.id] = d;

  return topChunks.map((c: any) => ({
    ...c,
    file_path: docsById[c.knowledge_id]?.file_path || null,
    summary: docsById[c.knowledge_id]?.summary || null,
    key_elements: docsById[c.knowledge_id]?.key_elements || [],
  }));
}

// Extract search keywords from user message
function extractKeywordsLegacy(message: string): string[] {
  const stopWords = new Set([
    "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
    "em", "no", "na", "nos", "nas", "por", "para", "com", "sem", "que", "qual", "quais",
    "como", "onde", "quando", "é", "são", "está", "estão", "foi", "ser", "ter", "há",
    "me", "te", "se", "nos", "vos", "lhe", "lhes", "eu", "tu", "ele", "ela", "nós",
    "eles", "elas", "esse", "essa", "este", "esta", "isso", "isto", "aqui", "ali",
    "mais", "menos", "muito", "pouco", "bem", "mal", "já", "ainda", "também", "não",
    "sim", "mas", "ou", "e", "nem", "se", "porque", "pois", "então", "até", "entre",
    "sobre", "sob", "após", "antes", "depois", "durante", "ao", "à", "às", "aos",
    "silva", "eng", "engenheiro", "diz", "diga", "fala", "fale", "explica", "pode",
    "podes", "quero", "preciso", "saber", "conhecer", "ver", "olha", "olhe",
    "bom", "dia", "boa", "tarde", "noite", "obrigado", "obrigada", "por", "favor",
    "tipo", "tipos", "coisa", "coisas", "parte", "partes", "todo", "toda", "todos", "todas",
  ]);

  const normalized = message
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents for matching
    .replace(/[^a-z0-9\s\-\.\/]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  // Also extract multi-word technical terms
  const lowerMsg = message.toLowerCase();
  const technicalTerms: string[] = [];
  
  const multiWordPatterns = [
    "classe de exposição", "classe de resistência", "classe de consistência",
    "betão armado", "betão pronto", "betão projetado", "betão colorido",
    "muro de berlim", "muros de berlim", "cortina de estacas",
    "viga de coroamento", "vigas de coroamento",
    "laje fungiforme", "laje maciça", "laje aligeirada",
    "água quente", "água fria", "águas residuais", "águas pluviais",
    "quadro eléctrico", "quadro elétrico",
    "piso -1", "piso -2", "piso 0", "piso 1", "piso 2",
    "cave -1", "cave -2", "cave 1", "cave 2",
    "rede de incêndio", "rede de esgotos", "rede de águas",
    "mapa de quantidades", "caderno de encargos", "memória descritiva",
    "plano de segurança", "controlo de qualidade",
    "fase 1", "fase 2", "fase 1.1", "fase 1.2", "fase 2.1",
  ];

  multiWordPatterns.forEach(term => {
    if (lowerMsg.includes(term)) {
      technicalTerms.push(term);
    }
  });

  // Regex patterns for compound technical references
  const regexPatterns: RegExp[] = [
    /\bpiso\s*-?\s*\d+\b/gi,
    /\bn[íi]vel\s*-?\s*\d+(?:[.,]\d+)?\b/gi,
    /\bcota\s*-?\s*\d+(?:[.,]\d+)?\b/gi,
    /\bn\s*[+\-]\s*\d+(?:[.,]\d+)?\b/gi,
    /\bcave\s*-?\s*\d+\b/gi,
    /\b[A-Z]{2,4}-[A-Z0-9]{2,4}-\d{2,4}\b/g,
    /\b[A-Z]{2,4}\.\d{2,4}(?:\.\d+)?\b/g,
  ];

  const compoundTerms: string[] = [];
  regexPatterns.forEach(rx => {
    const matches = message.match(rx);
    if (matches) {
      matches.forEach(m => compoundTerms.push(m.toLowerCase().replace(/\s+/g, " ").trim()));
    }
  });

  return [...new Set([...normalized, ...technicalTerms, ...compoundTerms])];
}

// Map keywords to likely specialties
function inferSpecialtiesLegacy(keywords: string[]): string[] {
  const specialtyMap: Record<string, string[]> = {
    "Estrutural": ["betão", "betao", "armadura", "ferro", "ferros", "pilar", "pilares", "viga", "vigas", "laje", "lajes", "sapata", "sapatas", "fundação", "fundacao", "fundações", "estaca", "estacas", "muro", "muros", "berlim", "coroamento", "estrutura", "estrutural", "estruturas", "aço", "aco", "cofragem", "betonar", "betonagem", "resistência", "resistencia", "c25", "c30", "c35", "c40", "a500", "cota", "cotas", "nivel", "nível", "niveis", "níveis", "fase", "piso", "pisos", "cave", "caves"],
    "Arquitectura": ["arquitectura", "arquitetura", "planta", "plantas", "fachada", "fachadas", "alçado", "alcado", "corte", "cortes", "piso", "pisos", "cave", "cobertura", "porta", "portas", "janela", "janelas", "caixilharia", "revestimento", "revestimentos", "acabamento", "acabamentos", "pavimento", "tecto", "teto", "parede", "paredes", "compartimento", "area", "área", "cota", "cotas", "nivel", "nível", "niveis", "níveis", "fase"],
    "Águas e Esgotos": ["água", "agua", "aguas", "esgoto", "esgotos", "residuais", "pluviais", "tubagem", "tubo", "tubos", "caixa", "visita", "saneamento", "drenagem", "ramal", "colector", "coletor", "fossa"],
    "AVAC": ["avac", "climatização", "climatizacao", "ventilação", "ventilacao", "ar condicionado", "aquecimento", "arrefecimento", "conduta", "condutas", "chiller", "vrf", "split", "insuflação", "extração", "extracao"],
    "Electricidade": ["eléctrico", "eletrico", "electricidade", "eletricidade", "quadro", "circuito", "tomada", "iluminação", "iluminacao", "cabo", "cabos", "potência", "potencia", "disjuntor", "transformador"],
    "Incêndio": ["incêndio", "incendio", "scie", "sprinkler", "extintor", "alarme", "detecção", "detecao", "compartimentação", "evacuação"],
    "Gás": ["gás", "gas", "tubagem gás", "ramal gás", "contador"],
    "Telecomunicações": ["telecomunicações", "telecomunicacoes", "ited", "fibra", "telefone", "dados", "rede dados"],
    "Térmica": ["térmica", "termica", "isolamento térmico", "reh", "recs", "etics", "xps", "eps", "poliuretano"],
    "Acústica": ["acústica", "acustica", "isolamento acústico", "rrae", "ruído", "ruido", "som"],
    "Topografia": ["topografia", "topográfico", "topografico", "implantação", "implantacao", "cota", "cotas", "altimetria", "planimetria", "levantamento"],
    "Contrato": ["contrato", "empreitada", "prazo", "valor", "penalidade", "cláusula", "clausula", "adjudicação", "caderno encargos"],
    "Certificados e Ensaios": ["certificado", "certificados", "ensaio", "ensaios", "psg", "dc", "lnec", "laudo", "laudos", "ficha técnica", "ficha tecnica", "dop", "declaração desempenho"],
    "Pormenores Construtivos": ["pormenor", "pormenores", "detalhe", "detalhes", "construtivo", "construtivos", "nó", "nos", "ligação", "ligacao"],
    "Memória Descritiva": ["memória descritiva", "memoria descritiva", "especificação", "especificacao"],
    "MQT": ["mqt", "mapa quantidades", "quantidade", "quantidades", "artigo", "artigos", "medição", "medicao"],
  };

  const matched: Set<string> = new Set();
  const joinedKeywords = keywords.join(" ");

  Object.entries(specialtyMap).forEach(([specialty, terms]) => {
    terms.forEach(term => {
      if (keywords.some(k => k.includes(term) || term.includes(k)) || joinedKeywords.includes(term)) {
        matched.add(specialty);
      }
    });
  });

  return Array.from(matched);
}

// Search knowledge base for relevant documents
async function searchKnowledgeLegacy(
  supabase: any,
  obraId: string,
  userId: string,
  keywords: string[],
  specialties: string[]
): Promise<any[]> {
  // If only Topografia matched (likely from ambiguous "cota"), fall through to global search
  const isAmbiguousSingle = specialties.length === 1 && specialties[0] === "Topografia";

  // First try: filter by specialty if we identified any (and not ambiguous single)
  if (specialties.length > 0 && !isAmbiguousSingle) {
    const { data: bySpecialty } = await supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, specialty, summary, key_elements, file_path, fase")
      .eq("obra_id", obraId)
      .eq("user_id", userId)
      .eq("processed", true)
      .in("specialty", specialties)
      .order("specialty");

    if (bySpecialty && bySpecialty.length > 0) {
      // Further filter by keyword relevance in summary and key_elements
      const scored = bySpecialty.map((doc: any) => {
        let score = 0;
        const summaryLower = (doc.summary || "").toLowerCase();
        const elementsStr = JSON.stringify(doc.key_elements || []).toLowerCase();
        const combined = summaryLower + " " + elementsStr;

        keywords.forEach(kw => {
          // Triple weight for matches in key_elements (precise technical IDs)
          if (elementsStr.includes(kw)) score += 6;
          // Normal weight for matches in summary
          if (summaryLower.includes(kw)) score += 2;
          // Partial match (relaxed, smaller bonus)
          if (kw.length > 3 && combined.includes(kw.substring(0, kw.length - 1))) score += 1;
        });

        return { ...doc, _score: score };
      });

      // Sort by relevance score, take top 15
      scored.sort((a: any, b: any) => b._score - a._score);
      const relevant = scored.filter((d: any) => d._score > 0).slice(0, 15);

      // If we have good matches, return them
      if (relevant.length > 0) {
        return relevant.map(({ _score, ...doc }: any) => doc);
      }

      // Otherwise return all from matching specialties (max 15)
      return bySpecialty.slice(0, 15);
    }
  }

  // Second try: search across all documents by keyword matching in summary
  const { data: allDocs } = await supabase
    .from("eng_silva_project_knowledge")
    .select("document_name, specialty, summary, key_elements, file_path")
    .eq("obra_id", obraId)
    .eq("user_id", userId)
    .eq("processed", true)
    .order("specialty");

  if (!allDocs || allDocs.length === 0) return [];

  // Score all documents
  const scored = allDocs.map((doc: any) => {
    let score = 0;
    const summaryLower = (doc.summary || "").toLowerCase();
    const elementsStr = JSON.stringify(doc.key_elements || []).toLowerCase();
    const combined = summaryLower + " " + elementsStr;

    keywords.forEach(kw => {
      // Triple weight for matches in key_elements (precise technical IDs)
      if (elementsStr.includes(kw)) score += 6;
      // Normal weight for matches in summary
      if (summaryLower.includes(kw)) score += 2;
      if (kw.length > 3 && combined.includes(kw.substring(0, kw.length - 1))) score += 1;
    });

    return { ...doc, _score: score };
  });

  scored.sort((a: any, b: any) => b._score - a._score);
  const relevant = scored.filter((d: any) => d._score > 0).slice(0, 15);

  if (relevant.length > 0) {
    return relevant.map(({ _score, ...doc }: any) => doc);
  }

  // No keyword matches — return empty (Silva will say he doesn't have specific info)
  return [];
}

function buildKnowledgeContext(chunks: any[]): string {
  if (!chunks || chunks.length === 0) return "";

  // Agrupar chunks por documento
  const byDoc: Record<string, any[]> = {};
  const docMeta: Record<string, { specialty: string | null; document_type: string | null; fase: string | null }> = {};

  for (const chunk of chunks) {
    const docName = chunk.document_name || "Documento sem nome";
    if (!byDoc[docName]) {
      byDoc[docName] = [];
      docMeta[docName] = {
        specialty: chunk.specialty,
        document_type: chunk.document_type,
        fase: chunk.fase || null,
      };
    }
    byDoc[docName].push(chunk);
  }

  let context = "## CONHECIMENTO DO PROJECTO (retrieval semântico)\n\n";
  let totalChars = context.length;
  const CHAR_LIMIT = 25000;

  for (const [docName, docChunks] of Object.entries(byDoc)) {
    const meta = docMeta[docName];
    const header = `### ${docName}` +
      (meta.specialty ? ` — ${meta.specialty}` : "") +
      (meta.fase ? ` [Fase ${meta.fase}]` : " [Geral]") +
      (meta.document_type ? ` (${meta.document_type})` : "") +
      "\n";

    if (totalChars + header.length > CHAR_LIMIT) break;
    context += header;
    totalChars += header.length;

    for (const chunk of docChunks) {
      const line = `- ${chunk.chunk_text}\n`;
      if (totalChars + line.length > CHAR_LIMIT) {
        context += "\n[... mais informação disponível — peça para aprofundar]\n";
        return context + "\n" + criticalRule();
      }
      context += line;
      totalChars += line.length;
    }
    context += "\n";
    totalChars += 1;
  }

  return context + criticalRule();
}

function criticalRule(): string {
  return "\nREGRA CRÍTICA: Responde APENAS com base nos trechos acima. " +
    "NUNCA inventes dados, normas, números ou referências que não estejam " +
    "explicitamente presentes nos documentos citados. Se não souberes algo, " +
    "diz claramente que não encontrou nos documentos do projecto.";
}

// Max base64 size per file (~4.5MB base64 ≈ ~3.4MB raw)
const MAX_BASE64_SIZE = 4_500_000;

function getMimeTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/pdf";
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

async function downloadFileAsBase64(
  supabase: any,
  filePath: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const { data, error } = await supabase.storage
      .from("project-knowledge")
      .download(filePath);
    if (error || !data) {
      console.error("ENG-SILVA-CHAT: Download failed for", filePath, error);
      return null;
    }
    const buffer = await data.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    // Processar em blocos para evitar stack overflow em ficheiros grandes
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    const base64 = btoa(binary);
    if (base64.length > MAX_BASE64_SIZE) {
      console.log(`ENG-SILVA-CHAT: File ${filePath} too large (${base64.length} chars), skipping`);
      return null;
    }
    return { base64, mimeType: getMimeTypeFromPath(filePath) };
  } catch (err) {
    console.error("ENG-SILVA-CHAT: Error downloading", filePath, err);
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrlAuth = Deno.env.get("SUPABASE_URL")!;
    const supabaseKeyAuth = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authSupabase = createClient(supabaseUrlAuth, supabaseKeyAuth);
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await authSupabase.auth.getUser(authToken);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { message, conversation_history, system, image, obra_id, user_id, mode, meta } = await req.json();

    // ── MODO LEGENDA (relatório fotográfico) ─────────────────────────────
    // Short-circuit: sem retrieval de conhecimento nem download de PDFs.
    // Input: { mode:'caption', image(base64), meta:{obra,especialidade,fase,piso,cota,notas,data} }
    // Output: { caption } — máx. 2 frases, tom de fiscal sénior, PT-PT.
    if (mode === "caption") {
      if (!image) {
        return new Response(JSON.stringify({ error: "image is required for caption mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const apiKeyCap = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKeyCap) {
        return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY em falta" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const m = meta || {};
      const ctx = [
        m.obra ? `Obra: ${m.obra}.` : "",
        m.especialidade ? `Especialidade: ${m.especialidade}.` : "",
        m.fase ? `Fase: ${m.fase}.` : "",
        (m.piso || m.cota != null) ? `Nível: ${m.piso || ""}${m.cota != null ? ` (cota ${m.cota})` : ""}.` : "",
        m.ambiente ? `Ambiente: ${m.ambiente}.` : "",
        m.atividade ? `Atividade: ${m.atividade}.` : "",
        m.data ? `Data: ${m.data}.` : "",
        m.notas ? `Notas do fiscal: ${m.notas}.` : "",
      ].filter(Boolean).join(" ");

      const captionSystem =
        "És o Eng. Silva, director de fiscalização de obra. Escreves a legenda de uma " +
        "fotografia para um relatório fotográfico diário. Regras: português europeu; " +
        "tom técnico de fiscal sénior; NO MÁXIMO DUAS frases; descreve o elemento e o " +
        "estado/observação relevante para fiscalização (não faças descrição genérica de " +
        "imagem nem listas). Usa os metadados apenas como contexto — não os repitas em bruto. " +
        "Responde só com a legenda, sem aspas nem prefixos.";

      const capResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKeyCap, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 150,
          temperature: 0.4,
          system: captionSystem,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: `Contexto: ${ctx || "(sem metadados)"}\nEscreve a legenda (máx. 2 frases).` },
          ]}],
        }),
      });
      if (!capResp.ok) {
        const errBody = await capResp.text();
        console.error(`ENG-SILVA-CHAT[caption]: Anthropic ${capResp.status}:`, errBody);
        return new Response(JSON.stringify({ error: `Anthropic ${capResp.status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const capJson = await capResp.json();
      const caption = (capJson.content?.[0]?.text || "").trim();
      if (!caption) {
        console.error("ENG-SILVA-CHAT[caption]: resposta sem texto:", JSON.stringify(capJson).slice(0, 1000));
        return new Response(JSON.stringify({ error: "Sem legenda gerada" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ caption }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ── FIM MODO LEGENDA ─────────────────────────────────────────────────

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      if (!image) {
        return new Response(JSON.stringify({ error: "message or image is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (message && message.length > 4000) {
      return new Response(JSON.stringify({ error: "message exceeds max length 4000" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (Array.isArray(conversation_history) && conversation_history.length > 50) {
      return new Response(JSON.stringify({ error: "conversation_history exceeds max 50" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let systemPrompt = system || "";
    let downloadedFiles: { document_name: string; base64: string; mimeType: string }[] = [];
    // Resumos de texto dos documentos anexados como PDF, para degradação elegante
    // caso a Anthropic recuse o pedido com os PDFs inteiros.
    let attachedPdfSummaries: { document_name: string; summary: string | null }[] = [];

    // Smart knowledge search if we have obra_id and a user message
    if (obra_id && user_id && message && supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Catálogo de níveis da obra (para detetar escopo e anotar o contexto).
        // Erro ruidoso mas não fatal: o chat continua sem boost de fase.
        let niveisCat: NivelCat[] = [];
        {
          const { data: niveisData, error: niveisErr } = await supabase
            .from("eng_silva_niveis")
            .select("id, specialty, fase, piso, cota, tipo")
            .eq("obra_id", obra_id);
          if (niveisErr) console.error("ENG-SILVA-CHAT: catálogo de níveis falhou:", niveisErr);
          else niveisCat = niveisData || [];
        }

        // Contexto da obra IncompatiCheck ligada (analysis_context), se existir.
        let analysisContext: string | null = null;
        {
          const { data: obraRow, error: obraErr } = await supabase
            .from("incompaticheck_obras")
            .select("analysis_context")
            .eq("id", obra_id)
            .maybeSingle();
          if (obraErr) console.error("ENG-SILVA-CHAT: analysis_context falhou:", obraErr);
          else analysisContext = (obraRow as any)?.analysis_context || null;
        }

        const { fase: scopeFase, nivelId: scopeNivelId } = detectScope(message, niveisCat);
        console.log(`[retrieval] escopo detetado: fase=${scopeFase ?? "-"}, nivel=${scopeNivelId ?? "-"}`);

        let relevantDocs: any[] = [];
        let retrievalMode = "semantic";

        try {
          relevantDocs = await searchKnowledgeSemantic(
            supabase,
            obra_id,
            user_id,
            message,
            scopeFase,
            scopeNivelId,
          );
          console.log(`[retrieval] semantic OK: ${relevantDocs.length} chunks`);
        } catch (semanticErr) {
          console.error(`[retrieval] semantic FAILED, falling back to legacy:`, semanticErr);
          retrievalMode = "legacy";
          const keywords = extractKeywordsLegacy(message);
          const specialties = Array.from(inferSpecialtiesLegacy(keywords));
          relevantDocs = await searchKnowledgeLegacy(
            supabase,
            obra_id,
            user_id,
            keywords,
            specialties,
          );
          console.log(`[retrieval] legacy fallback: ${relevantDocs.length} docs`);
        }

        // Deduplicate por knowledge_id (chunks múltiplos do mesmo doc → 1 doc)
        const uniqueDocs: any[] = [];
        const seenKnowledgeIds = new Set<string>();
        for (const item of relevantDocs) {
          const kid = item.knowledge_id || item.id;
          if (kid && !seenKnowledgeIds.has(kid)) {
            seenKnowledgeIds.add(kid);
            uniqueDocs.push(item);
          } else if (!kid) {
            uniqueDocs.push(item); // legacy items sem knowledge_id
          }
        }

        // Keywords necessárias para a heurística de elemento técnico abaixo
        // (calculadas independentemente do retrieval mode para preservar prioritização de PDF)
        const keywords = extractKeywordsLegacy(message);

        // Separar top 3 com file_path para download de originais, resto usa resumos
        const docsWithFile = uniqueDocs.filter((d: any) => d.file_path);

        // Se o fiscal perguntou sobre um elemento técnico específico, priorizar PDFs que o contêm em key_elements
        const elementTypes = ["estaca", "pilar", "viga", "sapata", "laje", "muro", "cortina", "coroamento", "fundação", "fundacao", "bloco", "armadura"];
        const mentionedElement = elementTypes.find(et => keywords.some(k => k.includes(et)));

        let prioritizedDocs = docsWithFile;
        if (mentionedElement) {
          const withElement = docsWithFile.filter((d: any) =>
            JSON.stringify(d.key_elements || []).toLowerCase().includes(mentionedElement)
          );
          const withoutElement = docsWithFile.filter((d: any) => !withElement.includes(d));
          prioritizedDocs = [...withElement, ...withoutElement];
          console.log(`ENG-SILVA-CHAT: Element "${mentionedElement}" mentioned — ${withElement.length} PDFs prioritized`);
        }
        const top5ForPdf = prioritizedDocs.slice(0, 5);
        const restDocs = relevantDocs.filter((d: any) => !top5ForPdf.includes(d));

        // Descarregar os top 5 PDFs/imagens originais em paralelo
        if (top5ForPdf.length > 0) {
          const downloads = await Promise.all(
            top5ForPdf.map(async (doc: any) => {
              const result = await downloadFileAsBase64(supabase, doc.file_path);
              if (result) {
                return { document_name: doc.document_name, ...result };
              }
              return null;
            })
          );
          downloadedFiles = downloads.filter((d: any): d is NonNullable<typeof d> => d !== null);
          console.log(`ENG-SILVA-CHAT: Downloaded ${downloadedFiles.length}/${top5ForPdf.length} original files`);
        }

        // Documentos cujo download falhou voltam para o grupo de resumos
        const downloadedNames = new Set(downloadedFiles.map(d => d.document_name));
        const failedDownloads = top5ForPdf.filter((d: any) => !downloadedNames.has(d.document_name));
        const summaryDocs = [...restDocs, ...failedDownloads];

        // Guardar o resumo de texto dos documentos que vão como PDF, para poder
        // responder a partir deles se a Anthropic recusar o pedido com os anexos.
        attachedPdfSummaries = top5ForPdf
          .filter((d: any) => downloadedNames.has(d.document_name))
          .map((d: any) => ({ document_name: d.document_name, summary: d.summary || null }));

        if (relevantDocs.length > 0) {
          // Contexto de resumos para os documentos sem PDF original
          const knowledgeContext = summaryDocs.length > 0
            ? buildKnowledgeContext(summaryDocs)
            : "";

          if (knowledgeContext) {
            // Remove old knowledge section if present and add new one
            systemPrompt = systemPrompt.replace(/\n\nCONHECIMENTO DO PROJECTO[\s\S]*?(?=\n\nEXTRAÇÃO DE PERFIL:|$)/, "");
            // Insert before EXTRAÇÃO DE PERFIL if it exists
            const profileIdx = systemPrompt.indexOf("\n\nEXTRAÇÃO DE PERFIL:");
            if (profileIdx > -1) {
              systemPrompt = systemPrompt.substring(0, profileIdx) + knowledgeContext + systemPrompt.substring(profileIdx);
            } else {
              systemPrompt += knowledgeContext;
            }
          }

          // Guardar ficheiros descarregados para incluir como content blocks na mensagem
          if (downloadedFiles.length > 0) {
            const docListNote = `\n\nDOCUMENTOS ORIGINAIS ANEXADOS: ${downloadedFiles.map(d => d.document_name).join(", ")}. Estes documentos foram enviados na íntegra — usa-os para responder com o máximo de detalhe e precisão. Cita o nome do documento quando referires informação.`;
            systemPrompt += docListNote;
          }
        } else if (keywords.length > 2) {
          // We searched but found nothing specific — tell Silva
          const noResultsNote = `\n\nNOTA: O fiscal fez uma pergunta específica mas não foram encontrados documentos relevantes na Base de Conhecimento para os termos pesquisados. Se não tiveres informação suficiente para responder, diz ao fiscal que não encontraste essa informação nos documentos carregados e sugere que carregue o documento relevante na Base de Conhecimento do Projecto, ou que seja mais específico na pergunta.`;
          const profileIdx = systemPrompt.indexOf("\n\nEXTRAÇÃO DE PERFIL:");
          if (profileIdx > -1) {
            systemPrompt = systemPrompt.substring(0, profileIdx) + noResultsNote + systemPrompt.substring(profileIdx);
          } else {
            systemPrompt += noResultsNote;
          }
        }

        // Catálogo de fases/níveis + contexto da obra + senso construtivo.
        // Injetado independentemente de haver documentos encontrados.
        const contextBlock = buildSilvaContextBlock(niveisCat, analysisContext, scopeFase);
        if (contextBlock) {
          const profileIdx2 = systemPrompt.indexOf("\n\nEXTRAÇÃO DE PERFIL:");
          if (profileIdx2 > -1) {
            systemPrompt = systemPrompt.substring(0, profileIdx2) + contextBlock + systemPrompt.substring(profileIdx2);
          } else {
            systemPrompt += contextBlock;
          }
        }
      } catch (searchErr) {
        console.error("ENG-SILVA-CHAT: Knowledge search error:", searchErr);
        // Continue without knowledge — don't break the conversation
      }
    }

    const messages = [...(conversation_history || [])];

    // Construir content blocks para a mensagem do utilizador
    const userContent: any[] = [];

    // Adicionar documentos originais descarregados (top 3)
    if (downloadedFiles && downloadedFiles.length > 0) {
      for (const file of downloadedFiles) {
        if (isImageMime(file.mimeType)) {
          userContent.push({
            type: "image",
            source: { type: "base64", media_type: file.mimeType, data: file.base64 },
          });
        } else {
          userContent.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: file.base64 },
          });
        }
        userContent.push({
          type: "text",
          text: `[Documento original: ${file.document_name}]`,
        });
      }
    }

    // Adicionar imagem do utilizador se enviada
    if (image) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: image },
      });
    }

    // Adicionar mensagem de texto do utilizador
    userContent.push({
      type: "text",
      text: message || "Analisa esta imagem e diz-me o que vês do ponto de vista de fiscalização de obra.",
    });

    messages.push({ role: "user", content: userContent });

    // Bloco de resumos dos documentos anexados como PDF — usado se for preciso
    // repetir a chamada sem os PDFs (ver ramo de degradação elegante abaixo).
    const attachedPdfSummaryBlock = attachedPdfSummaries.length > 0
      ? "RESUMOS DOS DOCUMENTOS DO PROJECTO (o documento original não pôde ser anexado na íntegra; usa estes resumos para responder e cita o nome do documento):\n\n" +
        attachedPdfSummaries
          .map((d) => `### ${d.document_name}\n${d.summary || "(sem resumo disponível)"}`)
          .join("\n\n")
      : "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 600,
        temperature: 0.3,
        system: systemPrompt,
        messages,
      }),
    });

    // não falhar em silêncio: se a Anthropic devolveu erro, regista-o
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`ENG-SILVA-CHAT: Anthropic API ${response.status}:`, errBody);

      // Degradação elegante: se o pedido levava PDFs anexados, a recusa pode
      // dever-se a eles (documento longo, demasiadas páginas, tamanho, etc).
      // Repetir UMA vez sem os PDFs, injetando os resumos de texto desses
      // documentos para o conhecimento não se perder.
      const hadPdfAttachments = downloadedFiles.some((f) => !isImageMime(f.mimeType));
      if (hadPdfAttachments) {
        const textOnlyContent = userContent.filter((b: any) => b.type !== "document");
        if (attachedPdfSummaryBlock) {
          textOnlyContent.unshift({ type: "text", text: attachedPdfSummaryBlock });
        }
        const retryMessages = [
          ...(conversation_history || []),
          { role: "user", content: textOnlyContent },
        ];

        const retryResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 600,
            temperature: 0.3,
            system: systemPrompt,
            messages: retryMessages,
          }),
        });

        if (retryResponse.ok) {
          const retryResult = await retryResponse.json();
          const retryReply = retryResult.content?.[0]?.text;
          if (retryReply) {
            return new Response(JSON.stringify({ reply: retryReply }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.error("ENG-SILVA-CHAT: retry sem PDF — resposta sem content:", JSON.stringify(retryResult).slice(0, 2000));
        } else {
          const retryErrBody = await retryResponse.text();
          console.error(`ENG-SILVA-CHAT: retry sem PDF — Anthropic API ${retryResponse.status}:`, retryErrBody);
        }
      }

      return new Response(JSON.stringify({
        reply: "Desculpa, não consegui processar este pedido agora.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const reply = result.content?.[0]?.text;
    if (!reply) {
      // resposta 2xx mas sem content — regista o corpo real para diagnóstico
      console.error("ENG-SILVA-CHAT: resposta Anthropic sem content:", JSON.stringify(result).slice(0, 2000));
      return new Response(JSON.stringify({
        reply: "Desculpa, não consegui processar. Tenta novamente.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
