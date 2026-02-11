
-- Drop existing tables (order matters due to foreign keys)
DROP TABLE IF EXISTS incompaticheck_reports CASCADE;
DROP TABLE IF EXISTS incompaticheck_findings CASCADE;
DROP TABLE IF EXISTS incompaticheck_chat CASCADE;
DROP TABLE IF EXISTS incompaticheck_analyses CASCADE;
DROP TABLE IF EXISTS incompaticheck_projects CASCADE;
DROP TABLE IF EXISTS incompaticheck_obras CASCADE;

-- Create tables
CREATE TABLE incompaticheck_obras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  nome TEXT NOT NULL,
  cidade TEXT DEFAULT '',
  fiscal TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  obra_id UUID REFERENCES incompaticheck_obras(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fundacoes','estrutural','rede_enterrada','terraplanagem')),
  format TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  from_zip BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  obra_id UUID REFERENCES incompaticheck_obras(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  total_projects INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  info_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE incompaticheck_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES incompaticheck_analyses(id) ON DELETE CASCADE NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_chat (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  obra_id UUID REFERENCES incompaticheck_obras(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','agent')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  analysis_id UUID REFERENCES incompaticheck_analyses(id) ON DELETE CASCADE NOT NULL,
  obra_id UUID REFERENCES incompaticheck_obras(id) ON DELETE CASCADE NOT NULL,
  pdf_path TEXT,
  shared_via TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE incompaticheck_obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own obras" ON incompaticheck_obras FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own projects" ON incompaticheck_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own analyses" ON incompaticheck_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own findings" ON incompaticheck_findings FOR ALL USING (
  analysis_id IN (SELECT id FROM incompaticheck_analyses WHERE user_id = auth.uid())
);
CREATE POLICY "Users own chat" ON incompaticheck_chat FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own reports" ON incompaticheck_reports FOR ALL USING (auth.uid() = user_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('incompaticheck-files', 'incompaticheck-files', false, 2147483648)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 2147483648;

-- Storage policies
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'incompaticheck-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own files" ON storage.objects FOR SELECT
USING (bucket_id = 'incompaticheck-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE
USING (bucket_id = 'incompaticheck-files' AND auth.uid()::text = (storage.foldername(name))[1]);
