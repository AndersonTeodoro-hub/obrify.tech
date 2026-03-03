
-- ============================================
-- FIX: Mudar políticas de RESTRICTIVE para PERMISSIVE
-- ============================================

-- 1. DROP todas as políticas da tabela organizations
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can delete organizations" ON public.organizations;

-- 2. Recriar como PERMISSIVE (default)
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), id));

CREATE POLICY "Admins can update organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (has_org_role(auth.uid(), id, 'admin'::membership_role));

CREATE POLICY "Admins can delete organizations"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (has_org_role(auth.uid(), id, 'admin'::membership_role));

-- 3. DROP todas as políticas da tabela memberships
DROP POLICY IF EXISTS "Users can insert memberships" ON public.memberships;
DROP POLICY IF EXISTS "Admins can insert memberships" ON public.memberships;
DROP POLICY IF EXISTS "Members can view memberships" ON public.memberships;
DROP POLICY IF EXISTS "Admins can update memberships" ON public.memberships;
DROP POLICY IF EXISTS "Admins can delete memberships" ON public.memberships;
DROP POLICY IF EXISTS "Users can view own memberships" ON public.memberships;

-- 4. Recriar TODAS as políticas de memberships como PERMISSIVE
CREATE POLICY "Users can insert memberships"
  ON public.memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      has_org_role(auth.uid(), org_id, 'admin'::membership_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.org_id = memberships.org_id
      )
    )
  );

CREATE POLICY "Members can view memberships"
  ON public.memberships FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR has_org_role(auth.uid(), org_id, 'admin'::membership_role)
  );

CREATE POLICY "Admins can update memberships"
  ON public.memberships FOR UPDATE
  TO authenticated
  USING (has_org_role(auth.uid(), org_id, 'admin'::membership_role));

CREATE POLICY "Admins can delete memberships"
  ON public.memberships FOR DELETE
  TO authenticated
  USING (has_org_role(auth.uid(), org_id, 'admin'::membership_role));
