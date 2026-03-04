

# Plan: Create 3 New Edge Functions for Eng. Silva

## Functions to Create

### 1. `eng-silva-stt` (Speech-to-Text)
- Receives base64 audio, decodes it, sends to ElevenLabs STT API
- Uses `ELEVENLABS_API_KEY`, model `scribe_v1`
- Returns `{ text: string }`

### 2. `eng-silva-chat` (Chat via Anthropic)
- Receives `{ message, conversation_history }`
- Calls Anthropic Claude claude-sonnet-4-5-20250929 with `ANTHROPIC_API_KEY`
- Returns `{ reply: string }`

### 3. `eng-silva-tts` (Text-to-Speech)
- Receives `{ text }`, calls ElevenLabs TTS with `ELEVENLABS_VOICE_ID`
- Uses `eleven_flash_v2_5` model, returns audio as base64 JSON

## Config
- Add all 3 functions to `supabase/config.toml` with `verify_jwt = false`

## Files Created
- `supabase/functions/eng-silva-stt/index.ts`
- `supabase/functions/eng-silva-chat/index.ts`
- `supabase/functions/eng-silva-tts/index.ts`

No existing functions or files will be modified (config.toml append only).

