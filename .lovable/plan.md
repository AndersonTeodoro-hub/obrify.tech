

# Plan: Wire Up Real AI Analysis in IncompatiCheck

## Overview
Replace the local PDF text extraction + regex analysis with a new edge function that sends actual PDFs to Claude for multimodal analysis, then display the rich results in the UI.

## Changes

### 1. Create Edge Function `supabase/functions/incompaticheck-analyze/index.ts`
- Downloads PDFs from `incompaticheck-files` storage bucket using service role key
- Converts to base64, sends to Claude as `document` type content blocks
- Two strategies: all-at-once (< 80MB base64) or pairwise (> 80MB)
- Prompt instructs Claude to return JSON array of findings with `severity` (alta/media/baixa), `title`, `description`, `specialties`, `location`, `recommendation`
- Deduplicates findings by title
- Returns structured response with findings + metadata

### 2. Update `supabase/config.toml`
- Add `[functions.incompaticheck-analyze]` with `verify_jwt = false`

### 3. Modify `src/pages/app/IncompatiCheck.tsx`
- Add local state: `analysisResult`, `analyzing` (local, separate from hook), `analysisError`, `severityFilter`
- Add `handleAnalyze` function that maps `ic.projects` to `{ name, type, file_path, storage_bucket }` and invokes `incompaticheck-analyze`
- Replace the existing analysis panel with new UI states:
  - **Analyzing**: spinner + "1-3 minutos" message + pulsing bar
  - **Error**: AlertTriangle + error message + retry button
  - **Results** (full width below projects): stats row (Alta/Média/Baixa counts), filter buttons, findings list with severity badge, specialties badges, location, recommendation, action buttons (Nova Análise, Exportar Relatório)
- Also persist findings to DB via existing hook after getting results (insert into `incompaticheck_findings` and update `incompaticheck_analyses`)
- Keep existing modals and project management unchanged

### Key Field Mapping
From the hook, projects have: `id`, `name`, `type`, `file_path`, `file_size`, `format` — map directly to edge function payload.

## Files
1. **Create** `supabase/functions/incompaticheck-analyze/index.ts`
2. **Edit** `supabase/config.toml` — add function config
3. **Edit** `src/pages/app/IncompatiCheck.tsx` — new analysis flow + results UI

