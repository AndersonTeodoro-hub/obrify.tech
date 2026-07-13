import { voyageRerank } from "../embeddings/voyage-client.ts";

/**
 * Retrieval semântico com Voyage embeddings + reranking.
 *
 * Fluxo:
 * 1. Embed a query (voyage-4) — calculado a montante e passado em queryEmbedding
 * 2. RPC match_knowledge_embeddings para buscar top-30 chunks similares
 * 3. Rerank com rerank-2.5 (topK; default 12, como no eng-silva-chat)
 * 4. Enriquecer com metadata do documento (file_path, etc)
 *
 * Devolve: array de chunks enriquecidos, formato:
 *   { knowledge_id, document_name, specialty, document_type,
 *     chunk_text, chunk_type, file_path, summary, key_elements,
 *     similarity, rerank_score }
 *
 * Extraído do eng-silva-chat para ser partilhado (eng-silva-search-tool).
 * Comportamento idêntico ao original; topK é o único parâmetro novo (opcional).
 */
export async function searchKnowledgeSemantic(
  supabase: any,
  obraId: string,
  userId: string,
  query: string,
  pFase: string | null,
  pNivelId: string | null,
  queryEmbedding: number[][],
  topK = 12,
): Promise<any[]> {
  // Retrieval inicial via RPC (top 30). O embedding da pergunta é calculado a
  // montante (em paralelo com o catálogo/contexto). p_fase/p_nivel_id são opcionais:
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

  // Rerank
  const chunkTexts = chunks.map((c: any) => c.chunk_text);
  const reranked = await voyageRerank({
    query,
    documents: chunkTexts,
    topK,
  });

  // Mapear rerank scores de volta para os chunks + adicionar metadata
  const topChunks = reranked.map((r: any) => ({
    ...chunks[r.index],
    rerank_score: r.relevance_score,
  }));

  // Enriquecer com metadata do documento (file_path, summary, key_elements)
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
