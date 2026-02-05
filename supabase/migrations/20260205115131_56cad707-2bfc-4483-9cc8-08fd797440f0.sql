-- Add status column to sites table
ALTER TABLE public.sites 
ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Add check constraint using a trigger for validation (more flexible than CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_site_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'paused', 'completed') THEN
    RAISE EXCEPTION 'Invalid site status: %. Must be one of: active, paused, completed', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_site_status_trigger
BEFORE INSERT OR UPDATE ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.validate_site_status();