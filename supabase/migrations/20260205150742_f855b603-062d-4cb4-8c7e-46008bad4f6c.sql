-- Add AI analysis tracking columns to captures table
ALTER TABLE public.captures 
ADD COLUMN IF NOT EXISTS ai_analyzed boolean DEFAULT false;

ALTER TABLE public.captures 
ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamp with time zone;