-- Adiciona policy que permite a um convidado com invitation pendente
-- auto-inserir a sua própria membership. Resolve o bug que impedia
-- o fluxo /invite/:token de funcionar (Alerta 1 da auditoria 2026-05-29).
--
-- Anti-escalação: o role da nova membership tem de coincidir com o
-- role da invitation (caso contrário, um convidado mal-intencionado
-- podia inserir-se com role superior ao convidado).
--
-- A policy "Users can insert memberships" original mantém-se intacta
-- (admin e bootstrap continuam a funcionar). RLS é OR entre policies,
-- portanto adicionar não remove caminhos existentes.

CREATE POLICY "Invitee can self-insert membership"
ON public.memberships
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE i.org_id = memberships.org_id
      AND lower(i.email) = lower(auth.jwt() ->> 'email')
      AND i.status = 'pending'
      AND i.expires_at > now()
      AND i.role = memberships.role::text
  )
);
