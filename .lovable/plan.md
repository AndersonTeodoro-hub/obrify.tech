

# Plan: Fix Eng. Silva Knowledge Injection & Document Display

## File 1: `src/hooks/use-eng-silva-voice.tsx` (lines 88-112)

Replace the project knowledge injection block with the user's provided code:
- Reduce summary words from 150 → 100
- Reduce key_elements from 8 → 5, filter for valid `type` + `id`
- Remove emoji prefix from document lines
- Add 4000-char hard limit on `knowledgeText` with `[... truncado]`
- Simpler closing instruction

## File 2: `src/pages/app/ProjectKnowledge.tsx` (lines 466-490)

Update the `CollapsibleContent` section:
- Check if `doc.summary` looks like JSON (starts with `{` or `[`) — if so, show "Resumo em processamento..." instead
- Filter `key_elements` to only show items that are objects with valid `type` and `id` string fields
- Skip the elements section entirely if no valid elements remain after filtering

