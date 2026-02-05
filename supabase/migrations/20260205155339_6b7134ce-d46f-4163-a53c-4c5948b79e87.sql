-- Create helper function to check if user has any of the given roles in an org
CREATE OR REPLACE FUNCTION public.has_any_org_role(_user_id UUID, _org_id UUID, _roles membership_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id 
    AND org_id = _org_id 
    AND role = ANY(_roles)
  )
$$;

-- Update sites policies - drop existing ones first
DROP POLICY IF EXISTS "Admin/Manager can create sites" ON public.sites;
DROP POLICY IF EXISTS "Admin/Manager can update sites" ON public.sites;
DROP POLICY IF EXISTS "Admin can delete sites" ON public.sites;
DROP POLICY IF EXISTS "Org members can create sites" ON public.sites;
DROP POLICY IF EXISTS "Org members can update sites" ON public.sites;
DROP POLICY IF EXISTS "Org members can delete sites" ON public.sites;

CREATE POLICY "Admin/Manager can create sites" ON public.sites
  FOR INSERT WITH CHECK (
    has_any_org_role(auth.uid(), org_id, ARRAY['admin', 'manager']::membership_role[])
  );

CREATE POLICY "Admin/Manager can update sites" ON public.sites
  FOR UPDATE USING (
    has_any_org_role(auth.uid(), org_id, ARRAY['admin', 'manager']::membership_role[])
  );

CREATE POLICY "Admin can delete sites" ON public.sites
  FOR DELETE USING (
    has_org_role(auth.uid(), org_id, 'admin')
  );

-- Update inspections policies
DROP POLICY IF EXISTS "Inspector+ can create inspections" ON public.inspections;
DROP POLICY IF EXISTS "Members can update inspections" ON public.inspections;
DROP POLICY IF EXISTS "Org members can insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "Org members can update inspections" ON public.inspections;

CREATE POLICY "Inspector+ can create inspections" ON public.inspections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s 
      WHERE s.id = site_id 
      AND has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager', 'inspector']::membership_role[])
    )
  );

CREATE POLICY "Members can update inspections" ON public.inspections
  FOR UPDATE USING (
    public.can_access_site(auth.uid(), site_id)
  );

-- Update nonconformities policies
DROP POLICY IF EXISTS "Org members can manage NCs" ON public.nonconformities;
DROP POLICY IF EXISTS "Members can view nonconformities" ON public.nonconformities;
DROP POLICY IF EXISTS "Inspector+ can create nonconformities" ON public.nonconformities;
DROP POLICY IF EXISTS "Members can update nonconformities" ON public.nonconformities;

CREATE POLICY "Members can view nonconformities" ON public.nonconformities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

CREATE POLICY "Inspector+ can create nonconformities" ON public.nonconformities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      JOIN public.sites s ON s.id = i.site_id
      WHERE i.id = inspection_id 
      AND has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager', 'inspector']::membership_role[])
    )
  );

CREATE POLICY "Members can update nonconformities" ON public.nonconformities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i 
      WHERE i.id = inspection_id AND public.can_access_site(auth.uid(), i.site_id)
    )
  );

-- Update captures policies
DROP POLICY IF EXISTS "Contributor+ can create captures" ON public.captures;
DROP POLICY IF EXISTS "Users can insert own captures" ON public.captures;

CREATE POLICY "Contributor+ can create captures" ON public.captures
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.capture_points cp 
      JOIN public.areas a ON a.id = cp.area_id 
      JOIN public.floors f ON f.id = a.floor_id 
      JOIN public.sites s ON s.id = f.site_id 
      WHERE cp.id = capture_point_id 
      AND has_any_org_role(auth.uid(), s.org_id, ARRAY['admin', 'manager', 'inspector', 'contributor']::membership_role[])
    )
  );