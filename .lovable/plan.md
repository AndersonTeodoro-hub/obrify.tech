

# Update eng-silva voice hook + Fix build errors

## File 1: `src/hooks/use-eng-silva-voice.tsx`

### Changes:
1. **`buildSystemPrompt`** — Remove `projectKnowledge` parameter and the entire "Project knowledge injection" block (lines 88-123). Update signature to `(memory: { profile: any; summaries: any[] }): string`. Change console.log to `"ENG-SILVA: Building prompt (knowledge handled by backend)"`.

2. **`processAudio` chatBody** (line 333-337) — Add `obra_id` and `user_id`:
```typescript
const chatBody: any = {
  message: userText,
  conversation_history: conversationRef.current,
  system: buildSystemPrompt(memoryRef.current),
  obra_id: memoryRef.current?.profile?.current_obra_id || null,
  user_id: (await supabase.auth.getUser())?.data?.user?.id || null,
};
```

3. **`start()` function** (lines 439-454) — Remove the entire knowledge loading block (the try/catch that invokes `eng-silva-knowledge`).

4. **Remove unused state/refs** — Delete `projectKnowledge` state (line 144) and `projectKnowledgeRef` ref (line 160).

## File 2: `supabase/functions/ai-obrify-agent/index.ts`

Fix 3 type errors by adding `as any` casts on lines 126, 130, and 216 where Supabase types don't match runtime schema, and cast the supabase client on line 352:
- Line 126: `await (supabase as any).rpc("get_file_path", ...)`
- Line 130: `await (supabase as any).from("file_organization").insert(...)`
- Line 216: `await (supabase as any).from("project_conflicts").update(...)`
- Line 352: `await executeAction(supabase as any, action)`

## Files 3-8: Edge function `error.message` fixes (TS18046)

In each of these 6 files, change the catch block from `} catch (error) {` to `} catch (error: any) {`:
- `supabase/functions/analyze-material-approval/index.ts` (line 252)
- `supabase/functions/eng-silva-chat/index.ts` (line 319)
- `supabase/functions/eng-silva-knowledge/index.ts` (line ~241)
- `supabase/functions/eng-silva-memory/index.ts` (line ~104)
- `supabase/functions/eng-silva-stt/index.ts` (line ~41)
- `supabase/functions/eng-silva-tts/index.ts` (line ~52)
- `supabase/functions/incompaticheck-analyze/index.ts` (line ~147)

## Files changed (8 total)
Only the files listed above. No dependency changes.

