-- Create table for tracking NC status changes (timeline)
CREATE TABLE IF NOT EXISTS public.nonconformity_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id uuid REFERENCES public.nonconformities(id) ON DELETE CASCADE NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_nc_status_history_nc_id ON public.nonconformity_status_history(nonconformity_id);

-- Enable RLS
ALTER TABLE public.nonconformity_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view status history for accessible NCs
CREATE POLICY "Users can view status history for accessible NCs"
  ON public.nonconformity_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_status_history.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );

-- RLS Policy: Users can insert status history for accessible NCs
CREATE POLICY "Users can insert status history for accessible NCs"
  ON public.nonconformity_status_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_status_history.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );