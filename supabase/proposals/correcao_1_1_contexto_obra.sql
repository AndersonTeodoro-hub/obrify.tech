-- ============================================================================
-- CORRECAO 1.1 - CONTEXTO DA OBRA NO INVENTARIO E EXTRACAO
--
-- Adiciona a coluna analysis_context a incompaticheck_obras para o fiscal definir,
-- uma vez por obra, as convencoes de pisos/cotas/nomenclatura que o motor de
-- analise (Estagios 0 e 1) aplica a todos os documentos.
--
-- REGISTO / PROPOSTA. Executado manualmente pelo Anderson no Supabase SQL Editor.
-- NAO correr `npx supabase db push`.
-- ============================================================================

alter table public.incompaticheck_obras
  add column if not exists analysis_context text;
