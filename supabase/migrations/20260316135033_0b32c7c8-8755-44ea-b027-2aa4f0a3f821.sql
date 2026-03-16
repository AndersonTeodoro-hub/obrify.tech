
-- Tabela para documentos PDE (3 tipos)
CREATE TABLE IF NOT EXISTS public.incompaticheck_pde_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  obra_id uuid REFERENCES public.incompaticheck_obras(id) ON DELETE CASCADE NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('pde', 'desenho_preparacao', 'resposta_pde')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.incompaticheck_pde_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own pde documents"
  ON public.incompaticheck_pde_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pde documents"
  ON public.incompaticheck_pde_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pde documents"
  ON public.incompaticheck_pde_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pde documents"
  ON public.incompaticheck_pde_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Tabela para pareceres da IA sobre propostas
CREATE TABLE IF NOT EXISTS public.incompaticheck_pde_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  obra_id uuid REFERENCES public.incompaticheck_obras(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
  verdict text CHECK (verdict IN ('approved', 'approved_with_reservations', 'rejected')),
  ai_analysis jsonb,
  pde_document_ids uuid[],
  desenho_document_ids uuid[],
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.incompaticheck_pde_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own pde analyses"
  ON public.incompaticheck_pde_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pde analyses"
  ON public.incompaticheck_pde_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pde analyses"
  ON public.incompaticheck_pde_analyses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pde analyses"
  ON public.incompaticheck_pde_analyses FOR DELETE
  USING (auth.uid() = user_id);
