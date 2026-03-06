
-- Create material_approvals table
CREATE TABLE public.material_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pdm_name TEXT NOT NULL,
  pdm_file_path TEXT NOT NULL,
  pdm_file_size BIGINT,
  mqt_name TEXT,
  mqt_file_path TEXT,
  mqt_file_size BIGINT,
  material_category TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  ai_analysis JSONB,
  ai_recommendation TEXT,
  reviewer_notes TEXT,
  final_decision TEXT,
  decided_by TEXT,
  decided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_material_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'analyzing', 'approved', 'approved_with_reservations', 'rejected') THEN
    RAISE EXCEPTION 'Invalid material approval status: %. Must be one of: pending, analyzing, approved, approved_with_reservations, rejected', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_material_approval_status_trigger
  BEFORE INSERT OR UPDATE ON public.material_approvals
  FOR EACH ROW EXECUTE FUNCTION public.validate_material_approval_status();

-- Enable RLS
ALTER TABLE public.material_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own approvals" ON public.material_approvals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own approvals" ON public.material_approvals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own approvals" ON public.material_approvals
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own approvals" ON public.material_approvals
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_material_approvals_obra ON public.material_approvals(obra_id);
CREATE INDEX idx_material_approvals_status ON public.material_approvals(status);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('material-approvals', 'material-approvals', false);

-- Storage RLS policies
CREATE POLICY "Auth users can upload material files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'material-approvals');

CREATE POLICY "Auth users can read own material files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'material-approvals');

CREATE POLICY "Auth users can delete own material files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'material-approvals');
