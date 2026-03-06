

# Plan: Improve eng-silva-knowledge Edge Function Reliability

## File: `supabase/functions/eng-silva-knowledge/index.ts`

### 1. Add `callClaudeWithRetry` helper function (before `serve()`)
- Retry loop with max 3 attempts, exponential backoff (2s × attempt)
- Moves the Claude API call logic out of the main handler
- Includes the "JSON only" instruction in the system prompt
- `max_tokens` increased from 4000 to 6000

### 2. Update analysis prompt (line 53-71)
- Change "máximo 300 palavras" → "máximo 500 palavras"
- Add paragraph for contracts/cadernos de encargos/memórias descritivas requesting extraction of parties, values, deadlines, conditions, material specs, penalties, etc.

### 3. Replace JSON parsing block (lines 98-104) with robust 3-tier fallback
- Tier 1: Standard `JSON.parse` after cleaning markdown
- Tier 2: Regex extract `{...}` from response
- Tier 3: Use raw text as summary (capped at 2000 chars)
- After parsing: validate summary quality — if too short or equals the old error message, fire a simpler fallback prompt (plain text, no JSON) via `callClaudeWithRetry` with 2 attempts

### 4. Update DB record write (lines 106-114)
- Always update even if partial — set `document_type` to `full_analysis`, `text_summary`, or `minimal` based on result quality
- Default summary: "Documento carregado. Análise pendente."

### 5. Image file handling already works (lines 37-49)
- Add extra normalization for `file_type` values like `'jpg'`/`'png'` (not full MIME) to convert to `image/jpeg`/`image/png`

Single file edit. No DB migration needed — `document_type` column already exists on `eng_silva_project_knowledge`.

