-- ============================================================================
-- ONDA PAM PÁGINAS — orçamento por PÁGINAS de PDF (limite Anthropic 100pp/request
-- em modelos 200k como o Sonnet 4.5). Corrige o 400 "A maximum of 100 PDF pages".
-- Colunas ADITIVAS e NULLABLE: não tocam em dados existentes (backfill = NULL).
-- Registos legados (NULL) continuam a funcionar — o fallback da function isola
-- cada doc sem contagem na sua própria passagem (nunca deixa doc por ler).
-- Reversível: DROP COLUMN de cada coluna abaixo.
-- APLICAR: correr manualmente no SQL Editor do Supabase (Anderson). NUNCA a Claude,
--          NUNCA via db push.
-- ============================================================================

-- Páginas dos PDFs de cada PAM, medidas no upload (frontend, pdfjs). NULL = legado/imagem.
ALTER TABLE public.material_approvals
  ADD COLUMN IF NOT EXISTS pam_page_count      integer,
  ADD COLUMN IF NOT EXISTS email_page_count    integer,
  ADD COLUMN IF NOT EXISTS mqt_page_count      integer,
  ADD COLUMN IF NOT EXISTS ce_page_count       integer,
  ADD COLUMN IF NOT EXISTS contract_page_count integer;

-- Páginas dos documentos da Base de Conhecimento (contratuais da Via 2 entram por aqui).
-- Medido no upload em ProjectKnowledge. NULL = legado ou não-PDF.
ALTER TABLE public.eng_silva_project_knowledge
  ADD COLUMN IF NOT EXISTS num_pages integer;

-- Nota: as páginas dos certificados/docs de fabricante ficam como `pages` por item
-- dentro de certificates[] / manufacturer_docs[] (JSONB já existentes) — SEM ALTER.
