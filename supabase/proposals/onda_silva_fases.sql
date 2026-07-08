-- ============================================================================
-- ONDA SILVA — FASES/NÍVEIS + RETRIEVAL DIRECIONADO
-- Proposta SQL. O Anderson executa MANUALMENTE no Supabase SQL Editor.
-- NUNCA correr via `npx supabase db push`. Produção é a autoridade.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1  Catálogo canónico de níveis (registo histórico)
--      A tabela public.eng_silva_niveis JÁ EXISTE em produção (foi aplicada
--      fora do versionamento). Este bloco é idempotente e serve de
--      documentação — não recria nem toca em dados existentes.
--      Confirmar existência antes:  SELECT to_regclass('public.eng_silva_niveis');
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eng_silva_niveis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     uuid NOT NULL,                 -- acoplamento solto, como a KB
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specialty   text NOT NULL,                 -- só especialidades técnicas
  fase        text,                          -- ex. '1.1', '2.1' (NULL = nível sem fase)
  cota        numeric(8,3),                  -- chave técnica, ex. -21.450
  piso        text,                          -- alias humano, ex. 'Piso -6'
  tipo        text,                          -- 'laje de fundação', 'laje corrente'...
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eng_silva_niveis ENABLE ROW LEVEL SECURITY;

-- Policies idempotentes (não falham se já existirem)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eng_silva_niveis' AND policyname='Users read own niveis') THEN
    CREATE POLICY "Users read own niveis"   ON public.eng_silva_niveis FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eng_silva_niveis' AND policyname='Users insert own niveis') THEN
    CREATE POLICY "Users insert own niveis" ON public.eng_silva_niveis FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eng_silva_niveis' AND policyname='Users update own niveis') THEN
    CREATE POLICY "Users update own niveis" ON public.eng_silva_niveis FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='eng_silva_niveis' AND policyname='Users delete own niveis') THEN
    CREATE POLICY "Users delete own niveis" ON public.eng_silva_niveis FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_niveis_obra      ON public.eng_silva_niveis(obra_id);
CREATE INDEX IF NOT EXISTS idx_niveis_obra_spec ON public.eng_silva_niveis(obra_id, specialty);

-- ----------------------------------------------------------------------------
-- 1.2  RPC match_knowledge_embeddings com escopo de fase/nível
--
--      Estado confirmado em produção pelo Anderson: a função está na versão
--      ORIGINAL (5 args, 8 colunas de retorno, JOIN simples, sem fase/nível).
--      A alteração da sessão antiga NUNCA chegou a produção.
--
--      Como o RETURNS TABLE muda (novas colunas), CREATE OR REPLACE não chega
--      ("cannot change return type"). Fazemos DROP da assinatura exata + CREATE.
--      O bloco DO remove defensivamente qualquer overload remanescente.
--
--      Verificar antes:  \df+ public.match_knowledge_embeddings
-- ----------------------------------------------------------------------------

-- DROP da assinatura antiga EXATA
DROP FUNCTION IF EXISTS public.match_knowledge_embeddings(
  vector, uuid, uuid, integer, double precision
);

-- Rede de segurança: remover qualquer overload deixado por sessões anteriores
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'match_knowledge_embeddings'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public.match_knowledge_embeddings(
  query_embedding vector(1024),
  match_obra_id   uuid,
  match_user_id   uuid,
  match_count     integer          DEFAULT 30,
  match_threshold double precision DEFAULT 0.3,
  p_fase          text             DEFAULT NULL,
  p_nivel_id      uuid             DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  knowledge_id  uuid,
  chunk_text    text,
  chunk_type    text,
  similarity    double precision,
  document_name text,
  specialty     text,
  document_type text,
  fase          text,
  nivel_id      uuid,
  piso          text,
  cota          numeric
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
    k.document_type,
    COALESCE(k.fase, n.fase) AS fase,
    k.nivel_id,
    n.piso,
    n.cota
  FROM public.eng_silva_knowledge_embeddings e
  JOIN public.eng_silva_project_knowledge k ON k.id = e.knowledge_id
  LEFT JOIN public.eng_silva_niveis n ON n.id = k.nivel_id
  WHERE e.obra_id = match_obra_id
    AND e.user_id = match_user_id
    AND k.processed = true
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
    -- BOOST, não filtro cego: exclui só documentos de OUTRAS fases;
    -- a fase pedida + os gerais (fase NULL) continuam sempre elegíveis.
    AND (p_fase IS NULL
         OR COALESCE(k.fase, n.fase) = p_fase
         OR COALESCE(k.fase, n.fase) IS NULL)
    AND (p_nivel_id IS NULL
         OR k.nivel_id = p_nivel_id
         OR k.nivel_id IS NULL)
  ORDER BY
    (p_fase     IS NOT NULL AND COALESCE(k.fase, n.fase) = p_fase) DESC, -- escopo exato 1.º
    (p_nivel_id IS NOT NULL AND k.nivel_id = p_nivel_id)          DESC,
    e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Nota: chamadas sem p_fase/p_nivel_id (ex.: a atual da edge function antes desta
-- onda) continuam válidas — os parâmetros são opcionais e default NULL reproduz
-- exatamente o comportamento original. Zero regressão para docs sem fase.
