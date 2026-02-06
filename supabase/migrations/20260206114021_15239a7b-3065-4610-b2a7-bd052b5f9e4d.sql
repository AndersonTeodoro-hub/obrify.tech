
-- Add pin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin TEXT;

-- Recreate handle_new_user with auto-admin logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  -- Auto-admin for specific email
  IF NEW.email = 'cris7981x@gmail.com' THEN
    SELECT id INTO _org_id FROM public.organizations
    WHERE name = 'Obrify' LIMIT 1;

    IF _org_id IS NULL THEN
      INSERT INTO public.organizations (name)
      VALUES ('Obrify')
      RETURNING id INTO _org_id;
    END IF;

    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (NEW.id, _org_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
