

# Plan: "Conhecimento do Projecto" Page + Eng. Silva Integration

## Overview
Create a standalone page where users upload project documents (PDFs) that get AI-analyzed by Claude and stored for Eng. Silva to reference in voice conversations. Completely separate from IncompatiCheck.

## Changes

### 1. Database Migration
- Create `eng_silva_project_knowledge` table with columns: id, obra_id, user_id, document_name, document_type, specialty, summary, key_elements (JSONB), file_path, file_size, processed, created_at, updated_at
- RLS policies for user-owned CRUD (SELECT/INSERT/UPDATE/DELETE using `auth.uid() = user_id`)
- Create `project-knowledge` storage bucket (private) with RLS for authenticated user uploads

### 2. Edge Function `supabase/functions/eng-silva-knowledge/index.ts`
- `action: "process_document"` — receives PDF base64, sends to Claude claude-sonnet-4-5 with Portuguese civil engineering prompt, extracts structured summary + key_elements (pillars, foundations, pipes, axes, materials, norms), updates the DB record
- `action: "load"` — returns all processed knowledge documents for a given obra_id
- Uses existing ANTHROPIC_API_KEY secret
- Add to config.toml with `verify_jwt = false`

### 3. New Page `src/pages/app/ProjectKnowledge.tsx`
- Route: `/app/project-knowledge`
- Reuses the same "obra" selection pattern from IncompatiCheck (same `incompaticheck_obras` table — shared obras)
- UI flow:
  - Select obra → show upload area + document list
  - Upload modal: select specialty from 14 options (Topografia, Arquitectura, Estrutural, etc.), accept PDF, max 2GB
  - Upload → store in `project-knowledge` bucket → insert DB record → auto-process via edge function
  - Document list grouped by specialty, showing: name, size, date, status badge (Processado/A processar)
  - Expandable summary per document showing AI-generated summary + element count
  - Delete and Reprocessar buttons per document
  - "Processar Todos" button for batch processing unprocessed docs
  - Stats bar: total docs, processed count, pending count

### 4. Route + Sidebar
- Add route `/app/project-knowledge` in `App.tsx` pointing to `ProjectKnowledge`
- Add sidebar item under "Ferramentas" group in `AppSidebar.tsx` with `BookOpen` icon and label "Conhecimento do Projecto"

### 5. Eng. Silva Voice Integration (`use-eng-silva-voice.tsx`)
- After `loadMemory()` in `start()`, check `memory.profile.current_obra_id` and load project knowledge via `eng-silva-knowledge` edge function
- In `buildSystemPrompt`, append a `CONHECIMENTO COMPLETO DO PROJECTO` section with summaries grouped by specialty (max 15 docs, 150 words per summary)
- Include key elements (max 8 per doc) for precise answers about pillars, foundations, pipes, etc.

### 6. Obra ID Sync to Silva Memory
- When user selects an obra in ProjectKnowledge page, save `current_obra_id` and `current_obra_name` to Silva's memory profile via `eng-silva-memory` edge function
- This lets Silva know which obra's knowledge to load

## Files
1. **Migration** — new table + storage bucket + RLS
2. **Create** `supabase/functions/eng-silva-knowledge/index.ts`
3. **Edit** `supabase/config.toml` — add function config
4. **Create** `src/pages/app/ProjectKnowledge.tsx`
5. **Edit** `src/App.tsx` — add route
6. **Edit** `src/components/layout/AppSidebar.tsx` — add sidebar link
7. **Edit** `src/hooks/use-eng-silva-voice.tsx` — load knowledge + update system prompt

## Notes
- IncompatiCheck remains completely unchanged
- Obras are shared from `incompaticheck_obras` table (no new obra system)
- Claude processes PDFs natively via document content type
- Knowledge is capped at 15 docs / 150 words each in the voice prompt to stay within token limits

