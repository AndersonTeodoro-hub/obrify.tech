
-- Create a SECURITY DEFINER function to atomically create org + membership
CREATE OR REPLACE FUNCTION public.create_organization_with_membership(
  _name text,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Insert organization
  INSERT INTO public.organizations (name, description)
  VALUES (_name, _description)
  RETURNING id INTO _org_id;

  -- Insert creator as admin member
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (_org_id, auth.uid(), 'admin');

  RETURN _org_id;
END;
$$;
