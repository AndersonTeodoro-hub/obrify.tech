-- ============================================================================
-- ONDA 2 - CRUZAMENTO POR PARES DE ESPECIALIDADES (Estagio 2)
--
-- Alarga o check de stage dos runs para incluir 'CROSS' e cria a tabela de
-- findings do cruzamento com evidencia dupla (referencias a elementos reais).
--
-- REGISTO / PROPOSTA. Executado manualmente pelo Anderson no Supabase SQL Editor.
-- NAO correr `npx supabase db push`.
-- ============================================================================

-- 1.1 Alargar o check de stage dos runs
alter table public.incompaticheck_analysis_runs
  drop constraint if exists incompaticheck_analysis_runs_stage_check;
alter table public.incompaticheck_analysis_runs
  add constraint incompaticheck_analysis_runs_stage_check
  check (stage in ('INVENTORY','EXTRACTION','CROSS'));

-- 1.2 Tabela de findings do cruzamento
create table if not exists public.incompaticheck_cross_findings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  obra_id uuid references public.incompaticheck_obras(id) on delete cascade not null,
  run_id uuid references public.incompaticheck_analysis_runs(id) on delete set null,
  especialidade_a text not null,
  especialidade_b text not null,
  tipo_conflito text not null check (tipo_conflito in
    ('intersecao','incoerencia_cotas','ausencia_negativo','espaco_insuficiente',
     'sequencia_construtiva','regulamentar','incoerencia_geometrica','outro')),
  severity text not null check (severity in ('alta','media','baixa')),
  title text not null,
  description text not null,
  impact text,
  location text,
  recommendation text,
  constructability_note text,
  element_a_id uuid references public.incompaticheck_elements(id) on delete cascade not null,
  element_b_id uuid references public.incompaticheck_elements(id) on delete cascade,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'novo' check (status in ('novo','confirmado','rejeitado')),
  created_at timestamptz default now()
);

create index if not exists idx_cross_findings_obra on public.incompaticheck_cross_findings (obra_id);
create index if not exists idx_cross_findings_run on public.incompaticheck_cross_findings (run_id);

alter table public.incompaticheck_cross_findings enable row level security;

create policy "Users manage own cross findings"
  on public.incompaticheck_cross_findings for all
  using (auth.uid() = user_id);
