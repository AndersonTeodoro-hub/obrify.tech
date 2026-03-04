

# Plan: Add Persistent Memory to Eng. Silva

## Step 1: Database Migration
Create table `eng_silva_memory` with columns: `id`, `user_id` (unique, FK to auth.users), `profile` (JSONB), `conversation_summaries` (JSONB array), `updated_at`. RLS policies for users to read/insert/update their own rows.

## Step 2: Edge Function `eng-silva-memory`
Create `supabase/functions/eng-silva-memory/index.ts` with three actions:
- `load`: returns profile + summaries for authenticated user
- `update_profile`: merges new profile fields into existing record (upsert)
- `add_summary`: appends summary to array, keeps last 10

Add `[functions.eng-silva-memory] verify_jwt = false` to config.toml.

## Step 3: Modify `use-eng-silva-voice.tsx`
- Add `memory` state and `loadMemory()` function called in `start()` before mic request
- Replace static `SYSTEM_PROMPT` with `buildSystemPrompt(memory)` function that appends user context (name, company, project) and recent conversation summaries
- Add profile extraction instruction to prompt — Claude outputs `[PERFIL: nome=..., empresa=...]` tags
- After chat response, parse `[PERFIL:...]` tags, save via edge function, strip before TTS
- In `hangUp()`, before cleanup, summarize conversation via Claude and save via edge function

## Files Created
- `supabase/functions/eng-silva-memory/index.ts`

## Files Modified
- `supabase/config.toml` (append memory function config)
- `src/hooks/use-eng-silva-voice.tsx` (memory integration)

