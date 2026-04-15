import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Extract search keywords from user message
function extractKeywords(message: string): string[] {
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
function inferSpecialties(keywords: string[]): string[] {
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
async function searchKnowledge(
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
      .select("document_name, specialty, summary, key_elements, file_path")
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
          if (combined.includes(kw)) score += 2;
          // Partial match
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
      if (combined.includes(kw)) score += 2;
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

// Build knowledge context string from documents
function buildKnowledgeContext(docs: any[]): string {
  if (!docs || docs.length === 0) return "";

  let context = `\n\nCONHECIMENTO DO PROJECTO (${docs.length} documentos relevantes encontrados):`;

  const bySpecialty: Record<string, any[]> = {};
  docs.forEach(doc => {
    if (!bySpecialty[doc.specialty]) bySpecialty[doc.specialty] = [];
    bySpecialty[doc.specialty].push(doc);
  });

  Object.entries(bySpecialty).forEach(([specialty, specDocs]) => {
    context += `\n\n--- ${specialty.toUpperCase()} ---`;
    specDocs.forEach(doc => {
      // Use full summary (up to 800 words) instead of truncated 100 words
      const summary = (doc.summary || "").split(" ").slice(0, 800).join(" ");
      context += `\n\n${doc.document_name}:\n${summary}`;

      if (doc.key_elements && doc.key_elements.length > 0) {
        const validElements = doc.key_elements
          .filter((e: any) => e && e.type && e.id)
          .slice(0, 15);
        if (validElements.length > 0) {
          context += `\nElementos: ${validElements.map((e: any) => `${e.type}:${e.id}${e.details ? ` (${e.details})` : ""}`).join("; ")}`;
        }
      }
    });
  });

  // Limit total context to 25000 chars
  if (context.length > 25000) {
    context = context.substring(0, 25000) + "\n[... informação adicional disponível — peça para aprofundar]";
  }

  context += `\n\nUsa este conhecimento para responder com precisão. Quando citas informação de um documento, menciona o nome do documento. Se a informação pedida não está nestes documentos, diz que não encontraste nos documentos carregados e sugere que o fiscal verifique ou carregue o documento relevante na Base de Conhecimento.`;

  return context;
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

    const { message, conversation_history, system, image, obra_id, user_id } = await req.json();
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

    // Smart knowledge search if we have obra_id and a user message
    if (obra_id && user_id && message && supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const keywords = extractKeywords(message);
        const specialties = inferSpecialties(keywords);

        console.log(`ENG-SILVA-CHAT: Query="${message.substring(0, 80)}" | Keywords=[${keywords.slice(0, 10).join(",")}] | Specialties=[${specialties.join(",")}]`);

        const relevantDocs = await searchKnowledge(supabase, obra_id, user_id, keywords, specialties);

        console.log(`ENG-SILVA-CHAT: Found ${relevantDocs.length} relevant docs: ${relevantDocs.map((d: any) => d.document_name).join(", ")}`);

        // Separar top 3 com file_path para download de originais, resto usa resumos
        const docsWithFile = relevantDocs.filter((d: any) => d.file_path);
        const top5ForPdf = docsWithFile.slice(0, 5);
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

    const result = await response.json();
    const reply = result.content?.[0]?.text || "Desculpa, não consegui processar. Tenta novamente.";

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
