
-- agent_conversations table
CREATE TABLE public.agent_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  title TEXT,
  message_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org conversations"
  ON public.agent_conversations FOR SELECT
  USING (is_org_member(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Members can create conversations"
  ON public.agent_conversations FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), organization_id) AND auth.uid() = user_id);

CREATE POLICY "Members can update own conversations"
  ON public.agent_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- agent_messages table
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own conversations"
  ON public.agent_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_messages.conversation_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert messages in own conversations"
  ON public.agent_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_messages.conversation_id AND c.user_id = auth.uid()
  ));

-- agent_actions_log table
CREATE TABLE public.agent_actions_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.agent_messages(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view action logs in own conversations"
  ON public.agent_actions_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_actions_log.conversation_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert action logs in own conversations"
  ON public.agent_actions_log FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_actions_log.conversation_id AND c.user_id = auth.uid()
  ));

-- file_organization table
CREATE TABLE public.file_organization (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'user',
  related_entity_id UUID,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.file_organization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org files"
  ON public.file_organization FOR SELECT
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admin/Manager can insert files"
  ON public.file_organization FOR INSERT
  WITH CHECK (has_any_org_role(auth.uid(), organization_id, ARRAY['admin'::membership_role, 'manager'::membership_role]));

CREATE POLICY "Admin/Manager can update files"
  ON public.file_organization FOR UPDATE
  USING (has_any_org_role(auth.uid(), organization_id, ARRAY['admin'::membership_role, 'manager'::membership_role]));

-- Trigger to increment message_count
CREATE OR REPLACE FUNCTION public.increment_agent_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agent_conversations
  SET message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_increment_agent_message_count
  AFTER INSERT ON public.agent_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_agent_message_count();

-- SQL helper function for file paths
CREATE OR REPLACE FUNCTION public.get_file_path(
  _org_id UUID,
  _site_id UUID,
  _file_type TEXT,
  _date TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT AS $$
DECLARE
  _path TEXT;
BEGIN
  _path := 'organizations/' || _org_id::text || '/sites/' || _site_id::text || '/';
  CASE _file_type
    WHEN 'capture' THEN
      _path := _path || 'captures/' || to_char(_date, 'YYYY-MM') || '/';
    WHEN 'inspection' THEN
      _path := _path || 'inspections/' || to_char(_date, 'YYYY-MM') || '/';
    WHEN 'nc_evidence' THEN
      _path := _path || 'nonconformities/';
    WHEN 'report' THEN
      _path := _path || 'reports/';
    WHEN 'project' THEN
      _path := _path || 'projects/';
    ELSE
      _path := _path || 'other/';
  END CASE;
  RETURN _path;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Indexes
CREATE INDEX idx_agent_conversations_user ON public.agent_conversations(user_id, started_at DESC);
CREATE INDEX idx_agent_messages_conversation ON public.agent_messages(conversation_id, created_at);
CREATE INDEX idx_agent_actions_log_conversation ON public.agent_actions_log(conversation_id);
CREATE INDEX idx_file_organization_org_site ON public.file_organization(organization_id, site_id);
CREATE INDEX idx_file_organization_type ON public.file_organization(file_type);
