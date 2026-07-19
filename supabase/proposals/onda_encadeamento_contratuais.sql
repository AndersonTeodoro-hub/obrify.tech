-- ============================================================================
-- ONDA ENCADEAMENTO — extração contratual PERSISTENTE por obra.
-- Cada MQT/CE/CTE/Contrato é lido e extraído UMA vez por obra e reutilizado por
-- TODOS os PAMs seguintes e entre invocações encadeadas da mesma análise (retoma
-- idempotente: a function extrai só o que ainda não está aqui).
-- A function usa a service role key (bypassa RLS); as policies protegem acesso
-- directo do cliente. Tabela NOVA e vazia — não toca em dados existentes.
-- Reversível: DROP TABLE public.contractual_extractions;
-- APLICAR: correr manualmente no SQL Editor do Supabase (Anderson). NUNCA db push.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contractual_extractions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_name    text NOT NULL,
  doc_path    text NOT NULL,           -- identidade: storage path (único por objeto)
  bucket      text NOT NULL,           -- 'material-approvals' ou 'project-knowledge'
  pages       integer,
  extraction  jsonb NOT NULL,          -- array de items da extração F4 desse documento
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Chave de reutilização/upsert: uma extração por (obra, documento).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractual_extractions_obra_path
  ON public.contractual_extractions(obra_id, doc_path);
CREATE INDEX IF NOT EXISTS idx_contractual_extractions_obra
  ON public.contractual_extractions(obra_id);

ALTER TABLE public.contractual_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own contractual_extractions"   ON public.contractual_extractions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own contractual_extractions" ON public.contractual_extractions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own contractual_extractions" ON public.contractual_extractions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own contractual_extractions" ON public.contractual_extractions FOR DELETE USING (auth.uid() = user_id);
