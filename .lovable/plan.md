

# Plan: Connect IncompatiCheck Results to Eng. Silva Memory

## Overview
Two small, additive changes to let Eng. Silva discuss IncompatiCheck findings in voice conversations.

## Changes

### 1. `src/pages/app/IncompatiCheck.tsx`
- Add `saveAnalysisToEngSilva(result, obraName)` function that builds a concise text summary of findings (counts + details for alta/média) and calls `eng-silva-memory` edge function with `action: 'add_summary'`
- Call it in `handleRunAnalysis` right after `persistAnalysis`, gated on `data.findings.length > 0`
- No new dependencies; uses existing `supabase` import

### 2. `src/hooks/use-eng-silva-voice.tsx`
- In `buildSystemPrompt`, after the summaries section (line 72), check if any summary contains `'incompatibilidades detectadas'`
- If yes, append an `ANÁLISE DE INCOMPATIBILIDADES` block instructing Eng. Silva to discuss findings by ID, suggest resolution priorities, and speak as if he analyzed the projects himself

No edge function or database changes needed — the existing `eng-silva-memory` function already supports `add_summary`.

