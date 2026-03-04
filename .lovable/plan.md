

# Plan: Add Camera + AI Vision to Eng. Silva Voice Call

## Overview
Add a camera button to the call overlay so inspectors can photograph site issues and have Eng. Silva analyze them using Claude's multimodal vision capabilities.

## Changes

### 1. Edge Function: `supabase/functions/eng-silva-chat/index.ts`
- Accept optional `image` field (base64) in request body
- When image is present, construct multimodal message with `type: "image"` + `type: "text"` content blocks
- When no image, keep current simple text message format

### 2. Hook: `src/hooks/use-eng-silva-voice.tsx`
- Add `pendingImageRef` for storing captured image base64
- Add `setPendingImage` callback exposed from hook
- In `processAudio`, build chat body conditionally with `image` field when pending
- Clear `pendingImageRef` after sending
- Handle empty STT + pending image case (auto-generate "Analisa esta imagem" text)
- Export `setPendingImage` in return object

### 3. Overlay: `src/components/eng-silva/EngSilvaCallOverlay.tsx`
- Import `Camera` from lucide-react, add `useState` import
- Destructure `setPendingImage` from hook
- Add `compressImage` utility (canvas resize to 800px, JPEG 0.7 quality)
- Add hidden file input with `capture="environment"`
- Add camera button (w-14 h-14, semi-transparent) left of hang-up in a flex row
- Add `hasPendingImage` state with pulsing gold dot indicator on camera button
- Add `photoPreview` state showing 80x80 thumbnail above visualizer with fade, auto-clears after 5s
- `handlePhotoCapture`: compress → setPendingImage → show preview → auto-clear

## Files Modified
1. `supabase/functions/eng-silva-chat/index.ts` — multimodal message support
2. `src/hooks/use-eng-silva-voice.tsx` — pendingImageRef + setPendingImage
3. `src/components/eng-silva/EngSilvaCallOverlay.tsx` — camera UI + compression

