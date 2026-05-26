import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { voyageEmbed } from "../_shared/embeddings/voyage-client.ts";
import { chunkKnowledgeDocument } from "../_shared/embeddings/chunking.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { knowledge_id } = await req.json();
    if (!knowledge_id) {
      return new Response(JSON.stringify({ error: "knowledge_id required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Buscar o documento
    const { data: doc, error: docErr } = await supabase
      .from("eng_silva_project_knowledge")
      .select("*")
      .eq("id", knowledge_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found", details: docErr?.message }), {
        status: 404,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 2. Apagar embeddings antigos (re-embed limpo)
    await supabase
      .from("eng_silva_knowledge_embeddings")
      .delete()
      .eq("knowledge_id", knowledge_id);

    // 3. Gerar chunks
    const chunks = chunkKnowledgeDocument(doc);
    if (chunks.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No chunks to embed",
        knowledge_id,
        chunks_embedded: 0,
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 4. Embed em batch (Voyage aceita até 128 inputs por request)
    const texts = chunks.map(c => c.chunk_text);
    const embeddings = await voyageEmbed({
      input: texts,
      inputType: "document",
    });

    // 5. Insert em batch
    const rows = chunks.map((chunk, i) => ({
      knowledge_id: doc.id,
      obra_id: doc.obra_id,
      user_id: doc.user_id,
      chunk_index: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      chunk_type: chunk.chunk_type,
      embedding: embeddings[i],
    }));

    const { error: insErr } = await supabase
      .from("eng_silva_knowledge_embeddings")
      .insert(rows);

    if (insErr) {
      return new Response(JSON.stringify({ error: `Insert failed: ${insErr.message}` }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      knowledge_id,
      document_name: doc.document_name,
      chunks_embedded: chunks.length,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
