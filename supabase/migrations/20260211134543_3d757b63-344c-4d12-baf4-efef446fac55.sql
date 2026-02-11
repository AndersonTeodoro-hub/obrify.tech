CREATE TABLE IF NOT EXISTS incompaticheck_obras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  nome TEXT NOT NULL,
  cidade TEXT,
  fiscal TEXT,
  project_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incompaticheck_obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own obras" ON incompaticheck_obras FOR ALL USING (auth.uid() = user_id);

ALTER TABLE incompaticheck_projects ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES incompaticheck_obras(id);