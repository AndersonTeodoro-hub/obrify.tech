
-- Function to notify all org members when NC is created
CREATE OR REPLACE FUNCTION public.notify_org_members_on_nc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _site_id UUID;
  _org_id UUID;
  _site_name TEXT;
  _member RECORD;
  _severity_label TEXT;
  _message TEXT;
BEGIN
  SELECT site_id INTO _site_id FROM public.inspections WHERE id = NEW.inspection_id;
  IF _site_id IS NULL THEN _site_id := NEW.site_id; END IF;
  IF _site_id IS NULL THEN RETURN NEW; END IF;

  SELECT org_id, name INTO _org_id, _site_name FROM public.sites WHERE id = _site_id;
  IF _org_id IS NULL THEN RETURN NEW; END IF;

  _severity_label := CASE NEW.severity
    WHEN 'critical' THEN 'Crítico'
    WHEN 'high' THEN 'Importante'
    WHEN 'medium' THEN 'Menor'
    ELSE NEW.severity
  END;

  _message := 'Nova NC (' || _severity_label || ') em ' || _site_name || ': ' || NEW.title;

  FOR _member IN SELECT user_id FROM public.memberships WHERE org_id = _org_id
  LOOP
    INSERT INTO public.alerts (user_id, type, message, severity, related_site_id)
    VALUES (_member.user_id, 'nc_created', _message, NEW.severity, _site_id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Function to notify on inspection status change
CREATE OR REPLACE FUNCTION public.notify_org_members_on_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org_id UUID;
  _site_name TEXT;
  _member RECORD;
  _message TEXT;
  _status_label TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT org_id, name INTO _org_id, _site_name FROM public.sites WHERE id = NEW.site_id;
  IF _org_id IS NULL THEN RETURN NEW; END IF;

  _status_label := CASE NEW.status
    WHEN 'completed' THEN 'concluída'
    WHEN 'in_progress' THEN 'em progresso'
    ELSE NEW.status
  END;

  _message := 'Inspeção ' || _status_label || ' em ' || _site_name;

  FOR _member IN SELECT user_id FROM public.memberships WHERE org_id = _org_id
  LOOP
    INSERT INTO public.alerts (user_id, type, message, severity, related_site_id)
    VALUES (_member.user_id, 'inspection_update', _message, 'info', NEW.site_id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER notify_on_nc_created
  AFTER INSERT ON public.nonconformities
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_org_members_on_nc();

CREATE TRIGGER notify_on_inspection_update
  AFTER UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_org_members_on_inspection();
