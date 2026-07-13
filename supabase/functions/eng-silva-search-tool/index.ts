import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { voyageEmbed } from "../_shared/embeddings/voyage-client.ts";
import { searchKnowledgeSemantic } from "../_shared/knowledge/semanticSearch.ts";

// CORS aberto (o chamador é o servidor da ElevenLabs, não um browser com Origin).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-tool-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_RESULT_CHARS = 1500;
const NADA = "Nada encontrado nos documentos da obra sobre isto.";
const FALHA = "A consulta aos documentos falhou temporariamente. Tenta de novo daqui a pouco.";

// Resposta 200 compacta para o LLM da voz ler.
function ok(resultado: string): Response {
  return new Response(JSON.stringify({ resultado }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Auth por header próprio (não JWT) ---
  const toolKey = Deno.env.get("ELEVENLABS_TOOL_KEY");
  const provided = req.headers.get("x-tool-key");
  if (!toolKey || !provided || provided !== toolKey) {
    console.error("SEARCH-TOOL: 401 — x-tool-key ausente ou inválida");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // A partir daqui NUNCA devolvemos 5xx ao ElevenLabs: falhas internas -> 200 com
  // mensagem legível, mas SEMPRE logadas (erros ruidosos).
  try {
    let query = "";
    try {
      const body = await req.json();
      query = typeof body?.query === "string" ? body.query.trim() : "";
    } catch (e) {
      console.error("SEARCH-TOOL: body inválido:", e);
      return ok(FALHA);
    }
    if (!query) {
      return ok(NADA);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const obraId = Deno.env.get("SILVA_TOOL_OBRA_ID");
    const userId = Deno.env.get("SILVA_TOOL_USER_ID");
    if (!supabaseUrl || !serviceKey || !obraId || !userId) {
      console.error("SEARCH-TOOL: config em falta (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SILVA_TOOL_OBRA_ID / SILVA_TOOL_USER_ID)");
      return ok(FALHA);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Embed da query (mesmo padrão do eng-silva-chat) + pesquisa semântica partilhada.
    const embedding = await voyageEmbed({ input: query, inputType: "query" });
    const chunks = await searchKnowledgeSemantic(
      supabase,
      obraId,
      userId,
      query,
      null, // p_fase — sem boost de escopo neste tool
      null, // p_nivel_id
      embedding,
      5,    // top 5 (voz: menos é melhor)
    );

    if (!chunks || chunks.length === 0) {
      console.log(`SEARCH-TOOL: 0 resultados para "${query.slice(0, 80)}"`);
      return ok(NADA);
    }

    // Formatar compacto para o LLM da voz ler (máx. ~1500 chars).
    const parts: string[] = [];
    let total = 0;
    const SEP = "\n---\n";
    for (const c of chunks) {
      const header = `[${c.document_name || "Documento"}${c.specialty ? " — " + c.specialty : ""}] `;
      const text = String(c.chunk_text || "").replace(/\s+/g, " ").trim();
      const entry = header + text;
      const addLen = (parts.length > 0 ? SEP.length : 0) + entry.length;
      if (total + addLen > MAX_RESULT_CHARS) {
        // Se ainda não coube nenhum, mete um recorte do primeiro para não vir vazio.
        if (parts.length === 0) parts.push(entry.slice(0, MAX_RESULT_CHARS));
        break;
      }
      parts.push(entry);
      total += addLen;
    }

    const resultado = parts.length > 0 ? parts.join(SEP) : NADA;
    console.log(`SEARCH-TOOL: "${query.slice(0, 80)}" -> ${parts.length} trecho(s), ${resultado.length} chars`);
    return ok(resultado);
  } catch (e) {
    console.error("SEARCH-TOOL: falha interna:", e);
    return ok(FALHA);
  }
});
