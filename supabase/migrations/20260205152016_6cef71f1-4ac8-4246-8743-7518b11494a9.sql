-- Create alerts table for AI detection notifications
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'ai_detection',
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  related_capture_id uuid REFERENCES public.captures(id) ON DELETE CASCADE,
  related_site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Users can view their own alerts
CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own alerts (mark as read)
CREATE POLICY "Users can update own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- System can create alerts (via service role in Edge Function)
CREATE POLICY "System can insert alerts" ON public.alerts
  FOR INSERT WITH CHECK (true);

-- Enable realtime for alerts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;