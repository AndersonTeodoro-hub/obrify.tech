DROP POLICY IF EXISTS "Admins can insert memberships" ON public.memberships;

CREATE POLICY "Users can insert memberships"
ON public.memberships
FOR INSERT
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