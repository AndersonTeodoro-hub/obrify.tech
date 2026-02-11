

# Modo Voz Maos-Livres — ElevenLabs Conversational AI

## Resumo

Substituir o sistema actual (Web Speech API STT + Gemini edge function + ElevenLabs TTS separado) por uma unica conexao WebRTC do ElevenLabs usando o SDK `@elevenlabs/react`. Resultado: 1 clique para iniciar, conversa tipo chamada, barge-in nativo.

## Passo 1: Guardar o Agent ID como secret

Guardar `ELEVENLABS_AGENT_ID` = `agent_2301kh79q27dfv2apftgettavq4f` nas secrets do projecto.

## Passo 2: Criar edge function `elevenlabs-conversation-token`

Nova edge function que gera token WebRTC de uso unico:
- Chama `GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=AGENT_ID`
- Header: `xi-api-key: ELEVENLABS_API_KEY`
- Retorna `{ token }` ao frontend
- API key nunca exposta no cliente

Registar em `supabase/config.toml` com `verify_jwt = false`.

## Passo 3: Reescrever AgentPanel.tsx

Substituir todo o sistema de Web Speech API + TTS separado pelo hook `useConversation` do `@elevenlabs/react`.

### Fluxo

1. Utilizador clica "Iniciar Conversa"
2. Pede permissao do microfone
3. Busca token via edge function
4. `conversation.startSession({ conversationToken, connectionType: 'webrtc' })`
5. A partir daqui: maos-livres total — falar, pausar, o Marcos responde automaticamente
6. Barge-in nativo — interromper o Marcos falando
7. "Terminar" chama `conversation.endSession()`

### UI

- Botao grande "Iniciar Conversa" / "Terminar"
- Indicador: "Desligado" | "A ligar..." | "A ouvir" | "A falar"
- Toggle mute + slider volume
- Historico de bolhas (ultimas 50 mensagens via `onMessage`)
- Quick commands via `conversation.sendUserMessage(text)`
- Avatar com glow animado conforme estado

### Permissao negada

Instrucoes curtas + botao "Tentar novamente".

### Desconexao

Botao "Reconectar" que repete token + startSession sem recarregar pagina.

## Passo 4: Simplificar IncompatiCheck.tsx

AgentPanel passa a receber apenas `findings` e `obraName` (sem `onSendMessage` nem `agentThinking`). O fluxo de voz e 100% gerido internamente pelo AgentPanel via WebRTC.

## Passo 5: Quick commands

Os botoes de comandos rapidos usam `conversation.sendUserMessage(text)` para enviar texto ao agente. O agente responde por voz automaticamente.

## Ficheiros

| Ficheiro | Accao |
|---|---|
| `supabase/functions/elevenlabs-conversation-token/index.ts` | CRIAR |
| `supabase/config.toml` | EDITAR — adicionar nova function |
| `src/pages/app/incompaticheck/AgentPanel.tsx` | REESCREVER — useConversation SDK |
| `src/pages/app/IncompatiCheck.tsx` | EDITAR — simplificar props |

## Checklist ElevenLabs Dashboard (accao do utilizador)

No dashboard do agente "Marcos" no ElevenLabs:
- Language: PT-PT
- Interruption / Barge-in: ON
- System prompt: persona Eng. Marcos (engenheiro senior, +10 anos, normas PT/EU)
- Voz: masculina portuguesa

