-- ============================================================================
-- REGISTO HISTÓRICO (movido de supabase/migrations/ nesta onda).
-- A tabela eng_silva_niveis JÁ FOI aplicada em produção fora do versionamento.
-- Este ficheiro fica em proposals/ apenas como registo — NUNCA corre via CLI.
-- O SQL vivo desta onda está em supabase/proposals/onda_silva_fases.sql.
-- ============================================================================

-- Passo 1 — Catálogo canónico de Níveis por obra+especialidade.
-- Tabela NOVA e VAZIA. Não toca em dados existentes (Palmares intacto).
-- Documental/contratual fica separado de forma estrutural: não tem nível
-- associado (fase/nivel a NULL na KB — decisão D1, sem coluna discriminadora).
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
CREATE POLICY "Users read own niveis"   ON public.eng_silva_niveis FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own niveis" ON public.eng_silva_niveis FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own niveis" ON public.eng_silva_niveis FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own niveis" ON public.eng_silva_niveis FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_niveis_obra      ON public.eng_silva_niveis(obra_id);
CREATE INDEX IF NOT EXISTS idx_niveis_obra_spec ON public.eng_silva_niveis(obra_id, specialty);
