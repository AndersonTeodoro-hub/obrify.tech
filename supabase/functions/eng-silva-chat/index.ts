import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  return [...new Set([...normalized, ...technicalTerms])];
}

// Map keywords to likely specialties
function inferSpecialties(keywords: string[]): string[] {
  const specialtyMap: Record<string, string[]> = {
    "Estrutural": ["betão", "betao", "armadura", "ferro", "ferros", "pilar", "pilares", "viga", "vigas", "laje", "lajes", "sapata", "sapatas", "fundação", "fundacao", "fundações", "estaca", "estacas", "muro", "muros", "berlim", "coroamento", "estrutura", "estrutural", "estruturas", "aço", "aco", "cofragem", "betonar", "betonagem", "resistência", "resistencia", "c25", "c30", "c35", "c40", "a500"],
    "Arquitectura": ["arquitectura", "arquitetura", "planta", "plantas", "fachada", "fachadas", "alçado", "alcado", "corte", "cortes", "piso", "pisos", "cave", "cobertura", "porta", "portas", "janela", "janelas", "caixilharia", "revestimento", "revestimentos", "acabamento", "acabamentos", "pavimento", "tecto", "teto", "parede", "paredes", "compartimento", "area", "área"],
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
  // First try: filter by specialty if we identified any
  if (specialties.length > 0) {
    const { data: bySpecialty } = await supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, specialty, summary, key_elements")
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

      // Sort by relevance score, take top 8
      scored.sort((a: any, b: any) => b._score - a._score);
      const relevant = scored.filter((d: any) => d._score > 0).slice(0, 8);

      // If we have good matches, return them
      if (relevant.length > 0) {
        return relevant.map(({ _score, ...doc }: any) => doc);
      }

      // Otherwise return all from matching specialties (max 8)
      return bySpecialty.slice(0, 8);
    }
  }

  // Second try: search across all documents by keyword matching in summary
  const { data: allDocs } = await supabase
    .from("eng_silva_project_knowledge")
    .select("document_name, specialty, summary, key_elements")
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
  const relevant = scored.filter((d: any) => d._score > 0).slice(0, 8);

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

  // Limit total context to 12000 chars (much more than the old 4000)
  if (context.length > 12000) {
    context = context.substring(0, 12000) + "\n[... informação adicional disponível — peça para aprofundar]";
  }

  context += `\n\nUsa este conhecimento para responder com precisão. Quando citas informação de um documento, menciona o nome do documento. Se a informação pedida não está nestes documentos, diz que não encontraste nos documentos carregados e sugere que o fiscal verifique ou carregue o documento relevante na Base de Conhecimento.`;

  return context;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversation_history, system, image, obra_id, user_id } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let systemPrompt = system || "";

    // Smart knowledge search if we have obra_id and a user message
    if (obra_id && user_id && message && supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const keywords = extractKeywords(message);
        const specialties = inferSpecialties(keywords);

        console.log(`ENG-SILVA-CHAT: Query="${message.substring(0, 80)}" | Keywords=[${keywords.slice(0, 10).join(",")}] | Specialties=[${specialties.join(",")}]`);

        const relevantDocs = await searchKnowledge(supabase, obra_id, user_id, keywords, specialties);

        console.log(`ENG-SILVA-CHAT: Found ${relevantDocs.length} relevant docs: ${relevantDocs.map((d: any) => d.document_name).join(", ")}`);

        if (relevantDocs.length > 0) {
          const knowledgeContext = buildKnowledgeContext(relevantDocs);
          // Remove old knowledge section if present and add new one
          systemPrompt = systemPrompt.replace(/\n\nCONHECIMENTO DO PROJECTO[\s\S]*?(?=\n\nEXTRAÇÃO DE PERFIL:|$)/, "");
          // Insert before EXTRAÇÃO DE PERFIL if it exists
          const profileIdx = systemPrompt.indexOf("\n\nEXTRAÇÃO DE PERFIL:");
          if (profileIdx > -1) {
            systemPrompt = systemPrompt.substring(0, profileIdx) + knowledgeContext + systemPrompt.substring(profileIdx);
          } else {
            systemPrompt += knowledgeContext;
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
    if (image) {
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: image,
            },
          },
          {
            type: "text",
            text: message || "Analisa esta imagem e diz-me o que vês do ponto de vista de fiscalização de obra.",
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: message });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1500,
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
