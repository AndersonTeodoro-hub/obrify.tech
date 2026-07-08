-- ============================================================================
-- ONDA 2.5 - ANALISE ISOLADA (COERENCIA INTERNA)
--
-- Alarga o check de stage dos runs para incluir 'SELF' e cria a tabela de
-- findings de coerencia interna (por projeto), com evidencia (1 ou 2 elementos).
--
-- REGISTO / PROPOSTA. Executado manualmente pelo Anderson no Supabase SQL Editor.
-- Reconstruido a partir da especificacao (ONDA_2_5_ANALISE_ISOLADA.md, seccao 2);
-- deve corresponder ao DDL efetivamente executado. NAO correr `npx supabase db push`.
-- ============================================================================

-- Alargar o check de stage dos runs
alter table public.incompaticheck_analysis_runs
  drop constraint if exists incompaticheck_analysis_runs_stage_check;
alter table public.incompaticheck_analysis_runs
  add constraint incompaticheck_analysis_runs_stage_check
  check (stage in ('INVENTORY','EXTRACTION','CROSS','SELF'));

-- Tabela de findings de coerencia interna
create table if not exists public.incompaticheck_self_findings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  obra_id uuid references public.incompaticheck_obras(id) on delete cascade not null,
  project_id uuid references public.incompaticheck_projects(id) on delete cascade not null,
  run_id uuid references public.incompaticheck_analysis_runs(id) on delete set null,
  especialidade text not null,
  tipo_problema text not null check (tipo_problema in
    ('cotas_divergentes','especificacao_invalida','regulamentar','referencia_inconsistente',
     'dimensao_implausivel','duplicacao_contraditoria','outro')),
  severity text not null check (severity in ('alta','media','baixa')),
  title text not null,
  description text not null,
  impact text,
  location text,
  recommendation text,
  element_a_id uuid references public.incompaticheck_elements(id) on delete cascade not null,
  element_b_id uuid references public.incompaticheck_elements(id) on delete cascade,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'novo' check (status in ('novo','confirmado','rejeitado')),
  created_at timestamptz default now()
);

create index if not exists idx_self_findings_obra on public.incompaticheck_self_findings (obra_id);
create index if not exists idx_self_findings_project on public.incompaticheck_self_findings (project_id);
create index if not exists idx_self_findings_run on public.incompaticheck_self_findings (run_id);

alter table public.incompaticheck_self_findings enable row level security;

create policy "Users manage own self findings"
  on public.incompaticheck_self_findings for all
  using (auth.uid() = user_id);
