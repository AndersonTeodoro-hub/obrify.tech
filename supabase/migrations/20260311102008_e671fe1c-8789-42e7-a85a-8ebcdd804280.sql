
-- Create photo_reports table
CREATE TABLE public.photo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.incompaticheck_obras(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report_date date NOT NULL,
  weather text,
  workers_count text,
  equipment text,
  works_done text,
  observations text,
  photos jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.photo_reports ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can do everything on their own reports
CREATE POLICY "Users own photo reports" ON public.photo_reports
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('photo-reports', 'photo-reports', false);

-- Storage RLS: authenticated users can upload to their own path
CREATE POLICY "Users upload own photo report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photo-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own photo report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photo-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own photo report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photo-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
