

# Plano: Integrar ElevenLabs para Voz no Obrify Agent

## Resumo

Guardar a API key ElevenLabs fornecida, criar 2 edge functions (TTS e STT token), instalar `@elevenlabs/react`, e actualizar o ObrifyAgent com gravacao por voz, reproducao audio, e modo especialista "Eng. Silva".

---

## 0. Guardar Secret

Guardar `ELEVENLABS_API_KEY` com o valor fornecido pelo utilizador usando a ferramenta de secrets.

---

## 1. Edge Function: elevenlabs-tts

**Ficheiro:** `supabase/functions/elevenlabs-tts/index.ts`

- Recebe `{ text, voiceId? }`
- Voz padrao: Daniel (`onwK4e9ZLuTAKqWW03F9`)
- Modelo: `eleven_multilingual_v2`
- Voice settings: stability 0.7, similarity_boost 0.8
- Chama `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128`
- Retorna audio binario (Content-Type: audio/mpeg)

---

## 2. Edge Function: elevenlabs-stt-token

**Ficheiro:** `supabase/functions/elevenlabs-stt-token/index.ts`

- POST para `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe`
- Retorna `{ token }` para o cliente usar com `useScribe`

---

## 3. config.toml

Adicionar:

```text
[functions.elevenlabs-tts]
verify_jwt = false

[functions.elevenlabs-stt-token]
verify_jwt = false
```

---

## 4. Dependencia

Instalar `@elevenlabs/react` no package.json.

---

## 5. Actualizar ObrifyAgent.tsx

### Novos estados e imports:
- `voiceEnabled` (persiste em localStorage)
- `voiceState`: idle | recording | processing | speaking
- `expertMode` (persiste em localStorage)
- `audioRef` (HTMLAudioElement)
- `useScribe` do `@elevenlabs/react`
- Novos icones: MicOff, Volume2, VolumeX, GraduationCap, Square

### Header - Controlos adicionais:
- Toggle voz on/off (Volume2/VolumeX)
- Toggle "Eng. Silva" (GraduationCap) com badge quando activo

### Botao Microfone (substituir disabled na linha 285):
- Clique: pede token via elevenlabs-stt-token, conecta useScribe com VAD
- Segundo clique: desconecta
- Transcricao parcial mostrada no input em tempo real
- Ao commit (VAD detecta silencio): envia texto via sendMessage
- Indicador visual: borda animada vermelha durante gravacao

### Reproducao TTS:
- Apos resposta do agente, se voiceEnabled:
  - `fetch()` para elevenlabs-tts com `.blob()`
  - `new Audio(URL.createObjectURL(blob))` para reproduzir
  - Estado `speaking` com indicador visual (pulso no avatar)
  - Botao para parar audio

### Modo Eng. Silva:
- Envia `expertMode: true` no body para ai-obrify-agent
- Badge "Eng. Silva" no header
- Icone GraduationCap nas mensagens do agente quando activo

---

## 6. Actualizar ai-obrify-agent

- Receber campo `expertMode` do body
- Se true, adiciona ao system prompt:

```text
MODO ESPECIALISTA - Eng. Silva:
Es o Engenheiro Silva, especialista senior com 35 anos de experiencia.
Conhecimento: Eurocodigos (EC2, EC7, EC8), EN 206, REBAP, REBA.
Responde tecnico e preciso, citando normas. Foca em patologias do betao,
conformidade normativa, boas praticas. Alerta para riscos de seguranca.
```

---

## 7. Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `supabase/functions/elevenlabs-tts/index.ts` | TTS via ElevenLabs API |
| `supabase/functions/elevenlabs-stt-token/index.ts` | Token para STT realtime |

## 8. Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `supabase/config.toml` | +2 funcoes |
| `src/components/ai/ObrifyAgent.tsx` | Voz, gravacao, modo especialista |
| `supabase/functions/ai-obrify-agent/index.ts` | Suporte expertMode |

---

## Detalhes Tecnicos

### Fluxo STT

```text
1. User clica microfone
2. Pede token via elevenlabs-stt-token
3. useScribe conecta com token + microfone (VAD)
4. Transcricao parcial no input
5. Silencio -> commit -> sendMessage(texto)
6. Desconecta scribe
```

### Fluxo TTS

```text
1. Agente responde
2. Se voiceEnabled -> fetch elevenlabs-tts
3. Recebe blob MP3
4. Audio play com indicador visual
5. User pode parar
```

### Playback

Usar `fetch()` directo (nao `supabase.functions.invoke()`) porque o SDK corrompe dados binarios ao tentar parse JSON.

