-- ============================================================================
-- ONDA 3 - RELATORIO DE EXCELENCIA
-- Adiciona posicao normalizada do elemento na pagina (para marcacao visual
-- subtil nas pranchas). x: 0=esquerda 1=direita; y: 0=topo 1=fundo.
--
-- REGISTO / PROPOSTA. Executado manualmente pelo Anderson no Supabase SQL Editor.
-- NAO correr `npx supabase db push`.
-- ============================================================================

alter table public.incompaticheck_elements
  add column if not exists position jsonb;
