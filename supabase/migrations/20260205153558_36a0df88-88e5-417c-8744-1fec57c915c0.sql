-- Expand membership_role enum with new roles
ALTER TYPE public.membership_role ADD VALUE 'inspector';
ALTER TYPE public.membership_role ADD VALUE 'contributor';

-- Create invitations table
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  site_ids uuid[] DEFAULT '{}',
  invited_by uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Unique index for token
CREATE UNIQUE INDEX invitations_token_idx ON public.invitations(token);

-- Unique index for email + org to prevent duplicate pending invites
CREATE UNIQUE INDEX invitations_email_org_pending_idx 
  ON public.invitations(email, org_id) 
  WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations for their org
CREATE POLICY "Admins can manage invitations" ON public.invitations
  FOR ALL USING (has_org_role(auth.uid(), org_id, 'admin'::membership_role));

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token" ON public.invitations
  FOR SELECT USING (true);