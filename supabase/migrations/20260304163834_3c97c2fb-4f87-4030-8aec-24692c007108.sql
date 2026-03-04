
CREATE TABLE public.eng_silva_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  profile JSONB DEFAULT '{}'::jsonb,
  conversation_summaries JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.eng_silva_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memory" ON public.eng_silva_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory" ON public.eng_silva_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory" ON public.eng_silva_memory
  FOR UPDATE USING (auth.uid() = user_id);
