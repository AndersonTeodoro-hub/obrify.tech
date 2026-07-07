-- ============================================================================
-- ONDA 1 - MOTOR DE ANALISE INCOMPATICHECK
-- Estagios 0 (Inventario) e 1 (Extracao Estruturada)
--
-- REGISTO / PROPOSTA. Este SQL JA FOI executado manualmente pelo Anderson no
-- Supabase SQL Editor. As 3 tabelas ja existem em producao com este schema.
-- Este ficheiro serve apenas de registo versionado. NAO correr `npx supabase db push`.
-- ============================================================================

-- 1.1 Tabela de runs do pipeline (rastreio e erros ruidosos)
create table if not exists public.incompaticheck_analysis_runs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  obra_id uuid references public.incompaticheck_obras(id) on delete cascade not null,
  project_id uuid references public.incompaticheck_projects(id) on delete cascade,
  stage text not null check (stage in ('INVENTORY','EXTRACTION')),
  status text not null default 'RUNNING' check (status in ('RUNNING','DONE','ERROR')),
  error_message text,
  stats jsonb,
  started_at timestamptz default now(),
  finished_at timestamptz
);

alter table public.incompaticheck_analysis_runs enable row level security;

create policy "Users manage own analysis runs"
  on public.incompaticheck_analysis_runs for all
  using (auth.uid() = user_id);

-- 1.2 Tabela de inventario de documentos (Estagio 0)
create table if not exists public.incompaticheck_doc_inventory (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  obra_id uuid references public.incompaticheck_obras(id) on delete cascade not null,
  project_id uuid references public.incompaticheck_projects(id) on delete cascade not null,
  especialidade text not null,
  doc_type text not null check (doc_type in ('planta','corte','alcado','pormenor','esquema','memoria_descritiva','mapa_quantidades','caderno_encargos','outro')),
  pisos text[] default '{}',
  zonas text[] default '{}',
  sistema_eixos text,
  escala text,
  num_paginas int,
  summary text,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  processing_status text not null default 'PENDING' check (processing_status in ('PENDING','RUNNING','DONE','ERROR')),
  error_message text,
  created_at timestamptz default now(),
  analyzed_at timestamptz,
  unique (project_id)
);

alter table public.incompaticheck_doc_inventory enable row level security;

create policy "Users manage own doc inventory"
  on public.incompaticheck_doc_inventory for all
  using (auth.uid() = user_id);

-- Nota: unique(project_id) porque cada documento carregado tem exatamente um
-- registo de inventario. Re-inventariar faz upsert.

-- 1.3 Tabela de elementos extraidos (Estagio 1) - o registo estruturado da obra
create table if not exists public.incompaticheck_elements (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  obra_id uuid references public.incompaticheck_obras(id) on delete cascade not null,
  project_id uuid references public.incompaticheck_projects(id) on delete cascade not null,
  inventory_id uuid references public.incompaticheck_doc_inventory(id) on delete cascade,
  especialidade text not null,
  element_type text not null check (element_type in (
    'pilar','viga','laje','sapata','muro','parede','nucleo','escada','rampa',
    'conduta','tubagem','cabo','esteira','quadro_eletrico','equipamento',
    'negativo','courette','teto_falso','porta_cortafogo','compartimentacao',
    'grelha','difusor','sprinkler','luminaria','outro'
  )),
  element_ref text,
  piso text,
  cota_base numeric,
  cota_topo numeric,
  cota_raw text,
  eixo_ref text,
  dimensions jsonb,
  material text,
  route jsonb,
  source_page int not null,
  source_zone text,
  raw_evidence text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz default now()
);

create index if not exists idx_elements_obra_esp on public.incompaticheck_elements (obra_id, especialidade);
create index if not exists idx_elements_obra_piso on public.incompaticheck_elements (obra_id, piso);
create index if not exists idx_elements_project on public.incompaticheck_elements (project_id);

alter table public.incompaticheck_elements enable row level security;

create policy "Users manage own elements"
  on public.incompaticheck_elements for all
  using (auth.uid() = user_id);
