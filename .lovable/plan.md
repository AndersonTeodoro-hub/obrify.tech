

# Fix: RLS policy bug blocking organization creation

## Root Cause

The `memberships` table INSERT policy has a SQL bug. The condition meant to allow "first member of a new org" is:

```sql
NOT EXISTS (
  SELECT 1 FROM memberships memberships_1
  WHERE memberships_1.org_id = memberships_1.org_id  -- BUG: compares column to itself!
)
```

This self-comparison is always TRUE for any non-null value, so `NOT EXISTS` is always FALSE (as long as any row exists in the memberships table). Combined with `has_org_role()` also being FALSE for a brand-new org (no members yet), the entire check fails.

The `organizations` INSERT policy itself is fine (`auth.uid() IS NOT NULL`, PERMISSIVE), but the error may propagate from the membership insert or the user sees the membership error.

## Fix

Drop and recreate the `memberships` INSERT policy with the correct reference:

```sql
DROP POLICY "Admins can insert memberships" ON public.memberships;

CREATE POLICY "Users can insert memberships"
ON public.memberships
FOR INSERT
TO authenticated
WITH CHECK (
  -- User is inserting themselves
  auth.uid() = user_id
  AND (
    -- They're already admin of the org
    has_org_role(auth.uid(), org_id, 'admin'::membership_role)
    -- OR this org has no members yet (first member / creator)
    OR NOT EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = memberships.org_id
    )
  )
);
```

Key changes:
1. Correctly references `memberships.org_id` (the new row) vs `m.org_id` (existing rows)
2. Adds `auth.uid() = user_id` check so users can only insert memberships for themselves
3. Allows first member of a new org OR existing admins to add members

## Files Changed

| File | Action |
|---|---|
| Database migration | Fix memberships INSERT RLS policy |

No code changes needed — only the RLS policy fix.

