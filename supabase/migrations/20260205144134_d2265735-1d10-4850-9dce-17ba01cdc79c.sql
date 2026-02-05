-- Create documents bucket for storing generated reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for documents bucket
CREATE POLICY "Users can view documents from their org"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.memberships m ON m.org_id = d.org_id
    WHERE m.user_id = auth.uid()
    AND d.file_path = name
  )
);

CREATE POLICY "Users can upload documents to their org"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete documents from their org"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.memberships m ON m.org_id = d.org_id
    WHERE m.user_id = auth.uid()
    AND d.file_path = name
  )
);