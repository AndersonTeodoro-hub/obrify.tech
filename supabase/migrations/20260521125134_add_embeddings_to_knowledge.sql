-- Activar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de chunks vectorizados
CREATE TABLE IF NOT EXISTS public.eng_silva_knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES public.eng_silva_project_knowledge(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL,
  user_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice HNSW para cosine similarity
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_hnsw
  ON public.eng_silva_knowledge_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_obra
  ON public.eng_silva_knowledge_embeddings(obra_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_user
  ON public.eng_silva_knowledge_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_knowledge_id
  ON public.eng_silva_knowledge_embeddings(knowledge_id);

-- RLS
ALTER TABLE public.eng_silva_knowledge_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own embeddings"
  ON public.eng_silva_knowledge_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert embeddings"
  ON public.eng_silva_knowledge_embeddings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete embeddings"
  ON public.eng_silva_knowledge_embeddings FOR DELETE
  USING (true);

-- Função SQL para similarity search
CREATE OR REPLACE FUNCTION public.match_knowledge_embeddings(
  query_embedding vector(1024),
  match_obra_id UUID,
  match_user_id UUID,
  match_count INTEGER DEFAULT 30,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  knowledge_id UUID,
  chunk_text TEXT,
  chunk_type TEXT,
  similarity FLOAT,
  document_name TEXT,
  specialty TEXT,
  document_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.knowledge_id,
    e.chunk_text,
    e.chunk_type,
    1 - (e.embedding <=> query_embedding) AS similarity,
    k.document_name,
    k.specialty,
    k.document_type
  FROM public.eng_silva_knowledge_embeddings e
  JOIN public.eng_silva_project_knowledge k ON k.id = e.knowledge_id
  WHERE e.obra_id = match_obra_id
    AND e.user_id = match_user_id
    AND k.processed = true
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
