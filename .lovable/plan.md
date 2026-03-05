

# Plan: Add Debug Logging to IncompatiCheck Analysis Flow

## Changes to `src/pages/app/IncompatiCheck.tsx`

### 1. After analysis result received (around line 243-244)
Add `console.log("INCOMPATICHECK: Findings count:", data?.findings?.length);` after the existing log.

### 2. Start of `saveAnalysisToEngSilva` (line 308)
Add `console.log("INCOMPATICHECK: Saving to Eng. Silva memory...");` as first line inside the try block.

### 3. After `supabase.functions.invoke` call (line 323-325)
Capture the response and log it:
```typescript
const response = await supabase.functions.invoke('eng-silva-memory', {
  body: { action: 'add_summary', summary: summary.trim() },
});
console.log('INCOMPATICHECK: Memory save response:', response);
```

All other code remains unchanged. The `saveAnalysisToEngSilva` call after `setAnalysisResult` is already correctly wired (lines 250-252).

