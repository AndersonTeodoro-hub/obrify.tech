export interface DocumentChunk {
  chunk_index: number;
  chunk_text: string;
  chunk_type: "summary" | "key_element" | "document_name";
}

/**
 * Gera chunks a partir de um documento da base de conhecimento.
 *
 * Estratégia:
 * 1. document_name + specialty + document_type → 1 chunk (identidade)
 * 2. summary completo → 1 chunk (visão geral)
 * 3. Cada key_element → 1 chunk (granularidade fina)
 */
export function chunkKnowledgeDocument(doc: {
  id: string;
  document_name: string;
  document_type: string | null;
  specialty: string | null;
  summary: string | null;
  key_elements: any[] | null;
}): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let idx = 0;

  const identityText = [
    `Documento: ${doc.document_name}`,
    doc.document_type ? `Tipo: ${doc.document_type}` : null,
    doc.specialty ? `Especialidade: ${doc.specialty}` : null,
  ].filter(Boolean).join(" | ");

  chunks.push({
    chunk_index: idx++,
    chunk_text: identityText,
    chunk_type: "document_name",
  });

  if (doc.summary && doc.summary.trim().length > 0) {
    chunks.push({
      chunk_index: idx++,
      chunk_text: doc.summary,
      chunk_type: "summary",
    });
  }

  if (Array.isArray(doc.key_elements)) {
    for (const el of doc.key_elements) {
      const text = formatKeyElement(el);
      if (text && text.trim().length >= 30) {
        chunks.push({
          chunk_index: idx++,
          chunk_text: text,
          chunk_type: "key_element",
        });
      }
    }
  }

  return chunks;
}

function formatKeyElement(el: any): string {
  if (typeof el === "string") return el;
  if (typeof el !== "object" || el === null) return "";

  // Estrutura real em produção: { id, type, details }
  const id = typeof el.id === "string" ? el.id.trim() : "";
  const type = typeof el.type === "string" ? el.type.trim() : "";
  const details = typeof el.details === "string" ? el.details.trim() : "";

  // Caso principal: temos pelo menos id + details
  if (id && details) {
    return type ? `${id} — ${type}. ${details}` : `${id}. ${details}`;
  }

  // Fallbacks defensivos
  if (id && type) return `${id} (${type})`;
  if (id) return id;
  if (details) return details;

  // Estrutura desconhecida — não fazer JSON.stringify (gera ruído nos embeddings)
  return "";
}
