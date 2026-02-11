
CREATE TABLE incompaticheck_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_ids UUID[],
  status TEXT DEFAULT 'pending',
  results JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  severity TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  tags TEXT[],
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  user_id UUID NOT NULL,
  pdf_url TEXT,
  shared_via TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_chat (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  role TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incompaticheck_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON incompaticheck_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own analyses" ON incompaticheck_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own findings" ON incompaticheck_findings FOR ALL USING (
  EXISTS (SELECT 1 FROM incompaticheck_analyses a WHERE a.id = incompaticheck_findings.analysis_id AND a.user_id = auth.uid())
);
CREATE POLICY "Users manage own reports" ON incompaticheck_reports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own chat" ON incompaticheck_chat FOR ALL USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('project-files', 'project-files', false, 524288000)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own project files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own project files" ON storage.objects FOR SELECT USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own project files" ON storage.objects FOR DELETE USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);
