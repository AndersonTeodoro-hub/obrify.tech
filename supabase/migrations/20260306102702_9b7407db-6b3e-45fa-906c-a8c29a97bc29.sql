
-- Create eng_silva_project_knowledge table
CREATE TABLE public.eng_silva_project_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'pdf',
  specialty TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  key_elements JSONB DEFAULT '[]'::jsonb,
  file_path TEXT,
  file_size BIGINT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.eng_silva_project_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own knowledge" ON public.eng_silva_project_knowledge
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own knowledge" ON public.eng_silva_project_knowledge
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own knowledge" ON public.eng_silva_project_knowledge
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own knowledge" ON public.eng_silva_project_knowledge
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_silva_knowledge_obra ON public.eng_silva_project_knowledge(obra_id);
CREATE INDEX idx_silva_knowledge_user ON public.eng_silva_project_knowledge(user_id);

-- Create project-knowledge storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-knowledge', 'project-knowledge', false);

-- Storage RLS policies
CREATE POLICY "Users can upload knowledge files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-knowledge' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own knowledge files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'project-knowledge' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own knowledge files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-knowledge' AND (storage.foldername(name))[1] = auth.uid()::text);
