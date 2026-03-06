

# Fix: Update Claude Model in analyze-material-approval

## Changes to `supabase/functions/analyze-material-approval/index.ts`

Two targeted edits:

1. **Line 179** — Remove `"anthropic-beta": "pdfs-2024-09-25",`
2. **Line 183** — Change `"claude-sonnet-4-20250514"` to `"claude-sonnet-4-5-20250929"`

This matches the working configuration used across `eng-silva-chat`, `eng-silva-knowledge`, and `incompaticheck-analyze`.

No other changes.

