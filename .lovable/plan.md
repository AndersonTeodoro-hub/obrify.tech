

# Plano: Integrar ElevenLabs para Voz no Obrify Agent

## Resumo

Adicionar capacidades de voz (falar e ouvir) ao Obrify Agent usando ElevenLabs TTS e STT em tempo real, com modo especialista "Eng. Silva".

---

## 0. Pré-requisito: Conectar ElevenLabs

O projecto nao tem API key da ElevenLabs configurada. Vou usar o conector ElevenLabs do Lovable para a obter. Se nao estiver disponivel, sera pedido ao utilizador para adicionar o secret `ELEVENLABS_API_KEY` manualmente.

---

## 1. Edge Function: elevenlabs-tts

**Ficheiro:** `supabase/functions/elevenlabs-tts/index.ts`

- Recebe `{ text, voiceId? }`
- Voz padrao: Daniel (`onwK4e9ZLuTAKqWW03F9`) - portugues
- Modelo: `eleven_multilingual_v2`
- Voice settings: stability 0.7, similarity_boost 0.8
- Chama `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`
- Retorna audio binario (MP3)

**config.toml:** Adicionar `[functions.elevenlabs-tts]` com `verify_jwt = false`

---

## 2. Edge Function: elevenlabs-stt-token

**Ficheiro:** `supabase/functions/elevenlabs-stt-token/index.ts`

- Chama `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe`
- Retorna `{ token }` para o cliente usar com `useScribe`

**config.toml:** Adicionar `[functions.elevenlabs-stt-token]` com `verify_jwt = false`

---

## 3. Instalar Dependencia

Adicionar `@elevenlabs/react` ao `package.json`.

---

## 4. Actualizar ObrifyAgent com Voz

**Ficheiro:** `src/components/ai/ObrifyAgent.tsx`

### Novos estados:
- `voiceEnabled` (boolean, toggle on/off, persiste em localStorage)
- `voiceState`: `idle` | `recording` | `processing` | `speaking`
- `expertMode` (boolean, toggle "Eng. Silva")
- `audioRef` para controlar reprodução

### Botao de Microfone (substituir o disabled actual na linha 285):
- Toggle: clique inicia gravacao, segundo clique para
- Usa `useScribe` do `@elevenlabs/react` com `commitStrategy: "vad"`
- Ao obter transcricao committed, chama `sendMessage(texto)`
- Indicador visual: icone muda Mic/MicOff, borda animada durante gravacao

### Reproducao TTS:
- Apos receber resposta do agente, se `voiceEnabled`, chama edge function `elevenlabs-tts` via `fetch()` com `.blob()`
- Reproduz audio com `new Audio(URL.createObjectURL(blob))`
- Indicador visual de "a falar" (ondas ou pulso no avatar do agente)
- Botao para parar reproducao

### Controlos de Voz (barra no header):
- Toggle voz on/off (Volume2 / VolumeX icon)
- Toggle modo especialista "Eng. Silva" (GraduationCap icon)

### Modo Especialista "Eng. Silva":
- Quando activo, envia flag `expertMode: true` no body para `ai-obrify-agent`
- Badge visual "Eng. Silva" no header do chat
- Avatar/indicador diferente nas mensagens do agente

---

## 5. Actualizar ai-obrify-agent

**Ficheiro:** `supabase/functions/ai-obrify-agent/index.ts`

- Receber campo `expertMode` no body
- Se `expertMode === true`, adiciona ao system prompt:

```text
MODO ESPECIALISTA - Eng. Silva:
Es o Engenheiro Silva, especialista senior com 35 anos de experiencia em betao armado e fiscalizacao.
Conhecimento profundo de: Eurocodigos (EC2, EC7, EC8), EN 206, REBAP, REBA.
Responde de forma tecnica e precisa, citando normas quando relevante.
Foca em: patologias do betao, conformidade normativa, boas praticas de fiscalizacao.
Usa linguagem tecnica mas acessivel. Quando apropriado, alerta para riscos de seguranca.
```

---

## 6. Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `supabase/functions/elevenlabs-tts/index.ts` | Edge function TTS |
| `supabase/functions/elevenlabs-stt-token/index.ts` | Edge function token STT |

## 7. Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `supabase/config.toml` | Adicionar 2 funcoes |
| `src/components/ai/ObrifyAgent.tsx` | Voz, gravacao, modo especialista |
| `supabase/functions/ai-obrify-agent/index.ts` | Suporte expertMode |
| `package.json` | Adicionar @elevenlabs/react |

---

## Detalhes Tecnicos

### Fluxo de Gravacao (STT)

```text
1. User clica no microfone
2. Frontend pede token via edge function elevenlabs-stt-token
3. useScribe conecta com token e microfone
4. Transcricao parcial mostrada em tempo real no input
5. VAD detecta silencio -> commit da transcricao
6. Texto committed e enviado como mensagem (sendMessage)
7. Desconecta scribe
```

### Fluxo de Reproducao (TTS)

```text
1. Agente responde com texto
2. Se voiceEnabled, chama fetch elevenlabs-tts com o texto
3. Recebe blob MP3
4. Cria Audio e reproduz
5. Mostra indicador "a falar" ate audio terminar
6. User pode clicar para parar
```

### Playback com fetch (nao supabase.functions.invoke)

Usar `fetch()` directo para o TTS porque o SDK Supabase corrompe dados binarios ao tentar parse JSON. Usar `.blob()` e `URL.createObjectURL()`.

