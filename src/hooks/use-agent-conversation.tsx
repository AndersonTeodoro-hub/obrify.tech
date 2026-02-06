import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface Conversation {
  id: string;
  organization_id: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  message_count: number;
}

interface AgentMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tools_used: unknown;
  context: unknown;
  created_at: string;
}

export function useAgentConversation() {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch org membership
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setOrganizationId(data.org_id);
      });
  }, [user?.id]);

  // Find or create active conversation
  const ensureConversation = useCallback(async () => {
    if (!user?.id || !organizationId) return null;

    // Check for active conversation (no ended_at, started within 30 min)
    const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS).toISOString();
    const { data: active } = await supabase
      .from('agent_conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .is('ended_at', null)
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (active) {
      setConversationId(active.id);
      return active.id;
    }

    // Create new conversation
    const { data: newConv } = await supabase
      .from('agent_conversations')
      .insert({ organization_id: organizationId, user_id: user.id })
      .select('id')
      .single();

    if (newConv) {
      setConversationId(newConv.id);
      return newConv.id;
    }
    return null;
  }, [user?.id, organizationId]);

  // End current and start new
  const resetConversation = useCallback(async () => {
    if (conversationId) {
      await supabase
        .from('agent_conversations')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
    setConversationId(null);
    return ensureConversation();
  }, [conversationId, ensureConversation]);

  // Set title from first user message
  const setTitle = useCallback(async (convId: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '…' : '');
    await supabase
      .from('agent_conversations')
      .update({ title })
      .eq('id', convId)
      .is('title', null);
  }, []);

  // Load conversation history list
  const loadConversations = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('agent_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(50);
    setConversations((data as Conversation[]) || []);
    setLoadingHistory(false);
  }, [user?.id]);

  // Load messages for a specific conversation
  const loadMessages = useCallback(async (convId: string): Promise<AgentMessage[]> => {
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    return (data as AgentMessage[]) || [];
  }, []);

  return {
    conversationId,
    organizationId,
    conversations,
    loadingHistory,
    ensureConversation,
    resetConversation,
    setTitle,
    loadConversations,
    loadMessages,
    userId: user?.id || null,
  };
}
