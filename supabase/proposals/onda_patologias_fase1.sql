-- ============================================================================
-- ONDA PATOLOGIAS — FASE 1 (triagem embutida + validação do fiscal)
-- Fonte DDL versionada. Registo do SQL aplicado MANUALMENTE no SQL Editor.
-- NUNCA corre via CLI / db push. Executar bloco a bloco, pela ordem.
--
-- Spec: docs/especificacoes/OBRIFY_MODULO_PATOLOGIAS.md (secção 6).
-- Adaptação ao esquema real (aprovada, gap analysis E3):
--   spec 'fotos'  -> tabela real public.captures      (coluna: captura_id)
--   spec 'obra_id'-> public.sites (RLS can_access_site) (coluna: site_id)
-- ============================================================================

-- BLOCO 1 — Colunas de triagem por foto em public.captures (spec 6.1)
ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS triagem_anomalia jsonb,
  ADD COLUMN IF NOT EXISTS triagem_estado   text NOT NULL DEFAULT 'ok';  -- ok | triagem_falhou


-- BLOCO 2 — Tabela public.anomalias (spec 6.2)
CREATE TABLE IF NOT EXISTS public.anomalias (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captura_id         uuid NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,  -- spec: foto_id
  site_id            uuid NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,  -- spec: obra_id
  tipo               text NOT NULL,                 -- taxonomia (validada na app)
  confianca_triagem  text NOT NULL,                 -- baixa | media | alta
  analise            jsonb,                         -- previsto/vazio (Estágio 2, fase futura)
  gravidade_aparente text,                          -- NULL na Fase 1 (triagem não produz gravidade)
  requer_urgencia    boolean NOT NULL DEFAULT false,
  estado             text NOT NULL DEFAULT 'pendente'
                     CHECK (estado IN ('pendente','confirmada','reclassificada','descartada')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anomalias_captura_unica UNIQUE (captura_id)  -- 1 triagem/foto na Fase 1 (upsert); já cria índice
);
CREATE INDEX IF NOT EXISTS idx_anomalias_site   ON public.anomalias(site_id);
CREATE INDEX IF NOT EXISTS idx_anomalias_estado ON public.anomalias(estado);


-- BLOCO 3 — Tabela public.anomalias_feedback (ativo de dados) (spec 6.3)
CREATE TABLE IF NOT EXISTS public.anomalias_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomalia_id    uuid NOT NULL REFERENCES public.anomalias(id) ON DELETE CASCADE,
  fiscal_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decisao        text NOT NULL CHECK (decisao IN ('confirmada','reclassificada','descartada')),
  tipo_corrigido text,              -- preenchido se reclassificada (Select fechado da taxonomia, no front)
  observacoes    text,
  decidido_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anom_feedback_anomalia ON public.anomalias_feedback(anomalia_id);


-- BLOCO 4 — RLS (site-scoped via helper existente public.can_access_site)
ALTER TABLE public.anomalias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalias_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalias' AND policyname='anomalias_select') THEN
    CREATE POLICY "anomalias_select" ON public.anomalias FOR SELECT
      USING (public.can_access_site(auth.uid(), site_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalias' AND policyname='anomalias_insert') THEN
    CREATE POLICY "anomalias_insert" ON public.anomalias FOR INSERT
      WITH CHECK (public.can_access_site(auth.uid(), site_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalias' AND policyname='anomalias_update') THEN
    CREATE POLICY "anomalias_update" ON public.anomalias FOR UPDATE
      USING (public.can_access_site(auth.uid(), site_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalias_feedback' AND policyname='anom_feedback_select') THEN
    CREATE POLICY "anom_feedback_select" ON public.anomalias_feedback FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.anomalias a
                     WHERE a.id = anomalias_feedback.anomalia_id
                       AND public.can_access_site(auth.uid(), a.site_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalias_feedback' AND policyname='anom_feedback_insert') THEN
    CREATE POLICY "anom_feedback_insert" ON public.anomalias_feedback FOR INSERT
      WITH CHECK (fiscal_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.anomalias a
                    WHERE a.id = anomalias_feedback.anomalia_id
                      AND public.can_access_site(auth.uid(), a.site_id)));
  END IF;
END $$;
