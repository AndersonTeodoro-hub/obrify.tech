

# Fix: Project Knowledge Ref in Eng. Silva Voice Hook

The issue is clear: `buildSystemPrompt` on line 323 receives `projectKnowledge` state, but `processAudio` is memoized with `useCallback(async () => {...}, [])` (empty deps on line 415), so it captures the initial empty array and never sees updates.

## Changes to `src/hooks/use-eng-silva-voice.tsx`

### 1. Add `projectKnowledgeRef` (after line 147)
```typescript
const projectKnowledgeRef = useRef<any[]>([]);
```

### 2. In `start()` (line 434), update both state and ref
```typescript
setProjectKnowledge(knowledgeData.knowledge);
projectKnowledgeRef.current = knowledgeData.knowledge;
```

### 3. In `processAudio` (line 323), use ref instead of state
```typescript
system: buildSystemPrompt(memoryRef.current, projectKnowledgeRef.current),
```

### 4. Add debug log at top of `buildSystemPrompt` (after line 53)
```typescript
console.log("ENG-SILVA: Building prompt with", projectKnowledge.length, "knowledge docs");
```

Four small edits, no other changes.

