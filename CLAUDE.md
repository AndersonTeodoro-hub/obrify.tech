# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obrify is a construction site inspection and monitoring SaaS platform. It provides AI-powered inspection agents, drone integration, photo captures, non-conformity tracking, and document generation for construction projects. The UI is Portuguese-centric with i18n support (PT, EN, ES, FR).

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest single run
npm run test:watch   # Vitest watch mode
```

Supabase Edge Functions are Deno-based (in `supabase/functions/`). Deploy with `supabase functions deploy <function-name>`.

## Architecture

**Frontend**: React 18 + TypeScript + Vite, styled with Tailwind CSS + shadcn/ui (Radix primitives).

**Backend**: Supabase (PostgreSQL with RLS, Auth, Storage, Edge Functions). No custom backend server.

**State/Data**: TanStack React Query for server state. Supabase JS client for all DB/auth/storage operations.

**Multi-tenant**: Organizations are the root tenant. All data is scoped by `org_id`. Memberships link users to orgs with roles (admin/manager/viewer). RLS enforces access control.

### Key Directories

- `src/pages/app/` — Protected route pages (Dashboard, Sites, Captures, Inspections, etc.)
- `src/components/ai/` — ObrifyAgent chat panel
- `src/components/eng-silva/` — Eng. Silva expert persona (voice + chat)
- `src/components/captures/` — Capture management
- `src/components/inspections/` — Inspection templates and checklists
- `src/components/nonconformities/` — Non-conformity tracking
- `src/hooks/` — Auth (`use-auth.tsx`), agent conversation, voice, keyboard shortcuts
- `src/integrations/supabase/` — Supabase client config + generated TypeScript types
- `src/i18n/locales/` — Translation JSON files (pt.json, en.json, es.json, fr.json)
- `supabase/functions/` — 17 Deno Edge Functions (AI agents, ElevenLabs voice, analysis)

### AI Features

Multiple AI agents, each backed by a Supabase Edge Function:
1. **ObrifyAgent** (`ai-obrify-agent`) — General inspection/site assistant in a global sheet panel
2. **Eng. Silva** (`eng-silva-*`) — Expert engineer persona with voice capability (ElevenLabs TTS/STT)
3. **IncompatiCheck** (`incompaticheck-*`) — Detects conflicts between construction project documents
4. **Material Approval** (`analyze-material-approval`) — Validates material certificates
5. **Image Analysis** (`ai-image-analysis`) — Photo defect detection

### Data Flow

Frontend React → Supabase Client → PostgreSQL (RLS) / Edge Functions (AI processing)

Agent conversations are stored in `agent_conversations` / `agent_messages` tables.

### Routing

All app routes are under `/app` and wrapped in `ProtectedRoute`. Auth is at `/auth`. The app shell uses `AppLayout` with a sidebar.

## Key Patterns

- **Path alias**: `@/*` maps to `src/*` (configured in tsconfig + vite)
- **Forms**: React Hook Form + Zod validation
- **Toasts**: Sonner for notifications
- **Theming**: Dark mode by default via next-themes. Custom color palette (primary blue, accent orange)
- **Fonts**: Plus Jakarta Sans (sans), JetBrains Mono (mono)
- **Document generation**: jsPDF for PDF reports, docx library for Word documents
- **360° photos**: Photo Sphere Viewer for panorama rendering

## Deployment

Hosted on Vercel (SPA config in `vercel.json` rewrites all routes to `index.html`). Supabase project handles database, auth, storage, and edge functions.

## REGRAS CRÍTICAS DE SEGURANÇA

**NUNCA escrever chaves, tokens, API keys, passwords ou credenciais em NENHUM ficheiro do projecto.**
Nem em `.env`, nem em código, nem em comentários, nem em documentação. Chaves são passadas apenas em runtime via terminal ou variáveis de ambiente do Supabase/Vercel. Violação desta regra é falha crítica.

**VERIFICAÇÃO OBRIGATÓRIA:** Antes de qualquer commit, corre `grep -r 'sbp_\|ghp_\|sk-ant\|SUPABASE_SERVICE_ROLE\|ANTHROPIC_API_KEY' --include='*.ts' --include='*.tsx' --include='*.env' --include='*.md' src/ supabase/` para garantir que NENHUMA chave está em ficheiros. Se alguma for encontrada, PÁRA IMEDIATAMENTE e move para variáveis de ambiente. A anon key do Supabase (`VITE_SUPABASE_PUBLISHABLE_KEY`) é a única excepção — é pública por design e pode estar em `.env` (nunca hardcoded em código).

## Deploy de Edge Functions

Todas as Edge Functions são deployed com `--no-verify-jwt`. O comando é:

```bash
npx supabase functions deploy NOME_DA_FUNCAO --project-ref ufolqxrxiiiygcosucft --no-verify-jwt
```

O token de acesso Supabase é passado via `npx supabase login` ou variável de ambiente, NUNCA hardcoded.

## Eng. Silva — Contexto do Agente

O Eng. Silva é o agente principal de análise técnica. Replica o julgamento de um director de fiscalização de obras. A base de conhecimento está na tabela `eng_silva_project_knowledge`, com filtragem por keywords no conteúdo.

**Tipos de documento:** Certificados, Fichas Técnicas, Declarações de Desempenho (DoP), Certificados e Ensaios.

**Edge function principal:** `analyze-material-approval` para análise de certificados de materiais como aço A500NR SD.

**Fornecedores na base:** SN Maia, Celsa Atlantic, Nervacero, Sevillana, Getafe, Balboa, SN Seixal, Megasa Naron.

**Regras anti-alucinação:** deve citar nomes exactos de ficheiros, se não encontrar informação deve dizer explicitamente, NUNCA inventar dados técnicos.

## Problemas Conhecidos

1. Eng. Silva só analisa 4 de 12 certificados — precisa analisar TODOS.
2. Web search LNEC pode não estar funcional — verificar logs.
3. Capturas mobile não fazem upload à plataforma.
4. Eng. Silva não lê PDFs originais, só resumos — falhou com sapatas piso -6.

## Idioma

Toda a comunicação com o utilizador e comentários no código devem ser em Português Europeu.
