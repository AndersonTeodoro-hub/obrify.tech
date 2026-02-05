-- Add new columns to nonconformities table
ALTER TABLE public.nonconformities
ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS standard_violated text,
ADD COLUMN IF NOT EXISTS created_by uuid;

-- Create index for site_id lookups
CREATE INDEX IF NOT EXISTS idx_nonconformities_site_id ON public.nonconformities(site_id);

-- Create table for NC evidence photos
CREATE TABLE IF NOT EXISTS public.nonconformity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id uuid REFERENCES public.nonconformities(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Create index for evidence lookups
CREATE INDEX IF NOT EXISTS idx_nc_evidence_nc_id ON public.nonconformity_evidence(nonconformity_id);

-- Enable RLS on the new table
ALTER TABLE public.nonconformity_evidence ENABLE ROW LEVEL SECURITY;

-- RLS policy for viewing evidence (users who can access the site via inspection)
CREATE POLICY "Users can view evidence for accessible NCs"
  ON public.nonconformity_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.nonconformities nc
      JOIN public.inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_evidence.nonconformity_id
      AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- RLS policy for inserting evidence
CREATE POLICY "Users can insert evidence for accessible NCs"
  ON public.nonconformity_evidence FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nonconformities nc
      JOIN public.inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_evidence.nonconformity_id
      AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- RLS policy for deleting evidence (user who created the NC or site admin)
CREATE POLICY "Users can delete evidence for accessible NCs"
  ON public.nonconformity_evidence FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.nonconformities nc
      JOIN public.inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_evidence.nonconformity_id
      AND public.can_access_site(auth.uid(), i.site_id)
    )
  );