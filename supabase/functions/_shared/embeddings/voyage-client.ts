export interface VoyageEmbedOptions {
  input: string | string[];
  inputType: "document" | "query";
  model?: string;
}

export interface VoyageRerankOptions {
  query: string;
  documents: string[];
  topK?: number;
  model?: string;
}

/**
 * Asymmetric retrieval pattern (Voyage 4 family):
 * - Documentos (corpus): voyage-4-large (qualidade máxima, one-shot)
 * - Queries: voyage-4 (mais leve, mesma embedding space)
 * - Ambos partilham embedding space — vectores compatíveis para similarity search
 */
export async function voyageEmbed(opts: VoyageEmbedOptions): Promise<number[][]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const defaultModel = opts.inputType === "document" ? "voyage-4-large" : "voyage-4";
  const model = opts.model || defaultModel;

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: Array.isArray(opts.input) ? opts.input : [opts.input],
      model,
      input_type: opts.inputType,
      output_dimension: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage embed failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.data.map((d: any) => d.embedding);
}

export async function voyageRerank(opts: VoyageRerankOptions): Promise<{
  index: number;
  relevance_score: number;
}[]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const response = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: opts.query,
      documents: opts.documents,
      model: opts.model || "rerank-2.5",
      top_k: opts.topK || 8,
      return_documents: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage rerank failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.data;
}
