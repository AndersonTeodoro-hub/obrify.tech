
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload site images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-images');

CREATE POLICY "Anyone can view site images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'site-images');

CREATE POLICY "Authenticated users can delete site images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-images');
