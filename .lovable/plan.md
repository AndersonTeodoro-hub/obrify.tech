

# Eng. Silva — Voice-Only Call Interface

## Overview
A floating action button (FAB) on all app pages that opens a fullscreen "phone call" overlay. No text input, no chat bubbles. Pure voice: record → STT → Claude → TTS → play → loop.

## Files to Create

### 1. `src/components/eng-silva/EngSilvaFAB.tsx`
- Gold gradient circular button (64px), bottom-right fixed, z-50
- Phone icon (lucide `Phone`), "Eng. Silva" label below in gold
- Pulse animation every 3s (CSS keyframe scale 1.0→1.05)
- On click: opens the call overlay

### 2. `src/components/eng-silva/EngSilvaCallOverlay.tsx`
Full-screen dark overlay (phone call UI):
- Avatar with 🔬 emoji, gold border
- "Eng. Silva" title + "Consultor de Engenharia" subtitle
- Audio visualizer (canvas-based, uses AnalyserNode frequency data):
  - Blue/cyan when listening, gold pulsing dots when thinking, gold wave when speaking
- Status text: "A ouvir..." / "A pensar..." / "A responder..."
- Red hang-up button (PhoneOff icon)
- Mic permission prompt before starting

### 3. `src/hooks/use-eng-silva-voice.tsx`
Core voice loop hook:
- **State machine**: `idle` → `requesting-mic` → `listening` → `processing-stt` → `processing-chat` → `processing-tts` → `speaking` → back to `listening`
- **Audio capture**: MediaRecorder + AnalyserNode for silence detection (1.5s threshold)
- **STT**: `supabase.functions.invoke('eng-silva-stt', { body: { audio: base64 } })` → returns `{ text }`
- **Chat**: `supabase.functions.invoke('eng-silva-chat', { body: { message, conversation_history } })` → returns `{ reply }`
- **TTS**: Fetch `eng-silva-tts` directly (returns base64 JSON), play via `data:audio/mpeg;base64,...` Audio URL
- **Auto-loop**: After audio.onended → restart listening
- **Hang up**: Stop all, clear conversation history
- **Error handling**: Mic denied message, API failure retry, quota exceeded message
- Exposes: `voiceState`, `analyserNode`, `start()`, `hangUp()`, `error`

## Files to Modify

### 4. `src/components/layout/AppLayout.tsx`
- Import and render `<EngSilvaFAB />` alongside existing HelpButton and ObrifyAgent

### 5. `src/index.css`
- Add `@keyframes eng-silva-pulse` (scale 1→1.05→1) and `.eng-silva-pulse` utility class

## Edge Functions
Already created: `eng-silva-stt`, `eng-silva-chat`, `eng-silva-tts`. The chat function needs the system prompt added — it will be sent from the frontend in the first message of `conversation_history` (as a `system` parameter in the Anthropic API call body). The hook will include the full system prompt from the spec.

## System Prompt
The exact system prompt from the spec will be embedded in the hook and sent as the `system` field alongside `messages` to the Anthropic API via the edge function. The edge function `eng-silva-chat` will be updated to accept and forward an optional `system` field.

## Audio Visualizer
Canvas-based component that reads `AnalyserNode.getByteFrequencyData()` at 60fps via `requestAnimationFrame`. Draws bars/waves with color based on current state prop (`listening`=cyan, `thinking`=gold dots, `speaking`=gold wave).

## Mobile Considerations
- Call overlay uses `100dvh` for proper mobile viewport
- Large touch targets (64px buttons minimum)
- No scroll, simple centered layout
- Works in portrait orientation

