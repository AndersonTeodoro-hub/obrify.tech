

# Agente Eng. Marcos — Voz Dinamica com ElevenLabs

## Problemas identificados

1. **Fluxo partido**: Tem de clicar para gravar, depois clicar para parar, depois esperar -- nao e natural
2. **"Selecione uma obra"**: O agente recusa funcionar sem obra seleccionada -- deveria funcionar sempre e dar contexto quando houver obra
3. **Voz feminina**: O browser Speech Synthesis escolhe a primeira voz portuguesa disponivel (geralmente feminina) -- o Eng. Marcos e um homem
4. **Nao e conversacional**: Depois de responder, volta ao idle -- deveria ser como falar com o GPT, fluido

## Solucao

### 1. ElevenLabs TTS para voz masculina real

O projecto ja tem `ELEVENLABS_API_KEY` configurado e a edge function `elevenlabs-tts` criada. Vamos usar a voz **Daniel** (onwK4e9ZLuTAKqWW03F9) -- voz masculina portuguesa de alta qualidade -- em vez do Speech Synthesis do browser.

Fluxo TTS:
- Resposta do agente chega como texto
- Chama `elevenlabs-tts` edge function com o texto
- Recebe audio MP3 binario
- Reproduz com `new Audio(URL.createObjectURL(blob))`

### 2. Fluxo conversacional automatico (como GPT Voice)

```text
1. Utilizador clica microfone -> STT inicia
2. Fala normalmente
3. Silencio detectado -> STT para automaticamente (onend)
4. Texto enviado AUTOMATICAMENTE a IA (sem clique extra)
5. "A pensar..." com spinner
6. Resposta chega -> ElevenLabs fala com voz masculina
7. Apos falar -> volta ao idle, pronto para novo clique
```

Zero cliques extras. Um clique para falar, o resto e automatico.

### 3. Agente funciona SEMPRE (com ou sem obra)

Remover a condicao que bloqueia quando nao ha obra. O agente responde sempre:
- **Com obra**: Tem contexto dos findings e nome da obra
- **Sem obra**: Responde como engenheiro civil generalista, sem dados especificos da obra

### 4. Seleccao de voz masculina portuguesa

Na funcao `speakText` (fallback caso ElevenLabs falhe), procurar especificamente vozes masculinas portuguesas em vez de aceitar qualquer voz `pt`.

## Ficheiros a modificar

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/incompaticheck/AgentPanel.tsx` | Substituir Speech Synthesis por ElevenLabs TTS, melhorar fluxo automatico |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | Remover bloqueio sem obra, agente responde sempre |

## Detalhes tecnicos

### AgentPanel.tsx — ElevenLabs TTS

Nova funcao `speakWithElevenLabs`:
```text
1. Recebe texto da resposta
2. Chama fetch() ao endpoint elevenlabs-tts com voiceId "onwK4e9ZLuTAKqWW03F9" (Daniel)
3. Recebe blob audio/mpeg
4. Cria Audio object e reproduz
5. onended -> volta ao idle
6. Se ElevenLabs falhar -> fallback para Speech Synthesis com voz masculina
```

### AgentPanel.tsx — Fluxo automatico

- `recognition.onend` envia automaticamente o texto acumulado (ja faz isto)
- Apos `speakText` terminar, estado volta a idle (ja faz isto)
- O que muda: remover qualquer espera por clique adicional entre gravar e enviar

### useIncompaticheck.ts — Sem bloqueio

Mudar de:
```typescript
if (!obraAtiva) return 'Selecione uma obra primeiro...';
```
Para:
```typescript
// Funciona sempre, com ou sem obra
const obraContext = obraAtiva ? obraAtiva.nome : undefined;
// Se nao ha obra, nao persiste no Supabase mas responde na mesma
```

Se nao ha obra, chama a edge function na mesma mas sem findings e sem obraName. O agente responde como generalista. Se nao ha user, tambem responde (sem persistir).

