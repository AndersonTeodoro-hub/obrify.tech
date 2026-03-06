

# Plan: "Aprovação de Materiais" (FAM-PDM) Page

## Overview
New tool page for material approval analysis using AI. Follows the same patterns as ProjectKnowledge (obra selection, file upload, edge function processing).

## Changes

### 1. Database Migration
- Create `material_approvals` table with columns for PDM/MQT files, AI analysis (JSONB), status, reviewer notes, final decision
- Use validation trigger instead of CHECK constraint for status (to avoid immutability issues)
- RLS: user-owned CRUD (`auth.uid() = user_id`)
- Create `material-approvals` storage bucket (private) with authenticated user RLS

### 2. Edge Function `supabase/functions/analyze-material-approval/index.ts`
- Receives `approval_id`, `pdm_base64`, optional `mqt_base64`, `material_category`, `obra_id`, `user_id`
- Loads project knowledge from `eng_silva_project_knowledge` for context
- Sends PDM + MQT PDFs to Claude claude-sonnet-4-5 with structured analysis prompt
- Extracts: recommendation, compliance checks, issues, conditions, norms
- Updates `material_approvals` record with results
- Saves summary to Eng. Silva memory via `eng-silva-memory` function
- Add to `config.toml` with `verify_jwt = false`

### 3. New Page `src/pages/app/MaterialApprovals.tsx`
- Route: `/app/material-approvals`
- Reuses `incompaticheck_obras` for obra selection (same pattern as ProjectKnowledge)
- Stats bar: total, approved, approved w/ reservations, rejected, pending
- Upload modal: category dropdown (14 options), PDM file upload, optional MQT file upload
- Approval cards list: category badge, filename, date, status badge (color-coded)
- Expandable analysis view: material proposed/specified, compliance checks table, issues, conditions, justification, norms, confidence bar
- Action buttons: Confirm Approval / Confirm w/ Reservations / Reject / Add Notes
- Processing flow: upload → insert record → download & base64 → call edge function → update status

### 4. Route + Sidebar
- Add route in `App.tsx`
- Add sidebar item under "Ferramentas" in `AppSidebar.tsx` with `ClipboardCheck` icon (but use `FileCheck` to avoid conflict with existing ClipboardCheck usage) and label "Aprovação de Materiais"

## Files
1. **Migration SQL** — table + storage bucket + RLS + validation trigger
2. **Create** `supabase/functions/analyze-material-approval/index.ts`
3. **Edit** `supabase/config.toml`
4. **Create** `src/pages/app/MaterialApprovals.tsx`
5. **Edit** `src/App.tsx` — add route
6. **Edit** `src/components/layout/AppSidebar.tsx` — add sidebar link

## Notes
- No existing code modified except adding route + sidebar entry
- Uses ANTHROPIC_API_KEY (already configured)
- Status validation via trigger, not CHECK constraint
- Eng. Silva memory integration: saves approval summaries for voice conversations

