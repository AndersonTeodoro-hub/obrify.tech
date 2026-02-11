

# AgentPanel Voz Pura — Sem Chat, Sem Texto

## Resumo

Reescrever o AgentPanel.tsx como interface exclusivamente de voz. Zero caixas de texto, zero input, zero baloes de chat. Criar edge function `incompaticheck-agent` com Lovable AI gateway (Gemini). Actualizar `sendUserMessage` no hook para chamar a edge function.

## Ficheiros a criar/modificar

| Ficheiro | Accao |
|---|---|
| `supabase/functions/incompaticheck-agent/index.ts` | CRIAR |
| `src/pages/app/incompaticheck/AgentPanel.tsx` | REESCREVER |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | EDITAR (sendUserMessage) |
| `src/pages/app/IncompatiCheck.tsx` | EDITAR (props do AgentPanel) |

## 1. Edge Function `incompaticheck-agent`

- Lovable AI gateway: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Secret: `LOVABLE_API_KEY` (ja configurado)
- Modelo: `google/gemini-3-flash-preview`
- System prompt completo do Eng. Marcos com TODAS as regras obrigatorias:
  - NUNCA dizer que e IA/modelo/ferramenta
  - Autoridade tecnica total sem disclaimers
  - "na minha experiencia", "pela minha analise"
  - Normas: NP EN 1992-1-1, EN 1997-1, NP EN 206, EN 1536, DR 23/95, Portaria 361/98, RTIEBT, RSA, REBAP, LNEC
  - Terminologia PT-PT: betao, armaduras, cofragem, betonagem, empreiteiro
  - "isto e uma nao-conformidade grave"
- Recebe: messages (ultimas 20), findings, obraName
- Findings injectados no contexto do system prompt
- CORS headers completos

## 2. AgentPanel.tsx — Interface voz pura

Layout vertical centrado:

```text
+-------------------------------+
|                               |
|    [Avatar grande 80px]       |
|    Eng. Marcos IA             |
|    Engenheiro Senior          |
|    [badges normas]            |
|                               |
|    ~~~~ ondas audio ~~~~      |
|    (animadas quando activo)   |
|                               |
|    "Clique para falar"        |
|    (estado actual)            |
|                               |
|    "texto transcrito..."      |
|    (subtitulo temporario)     |
|                               |
|    [  MICROFONE GRANDE  ]     |
|                               |
|    [Mute] [Repetir]           |
|                               |
|    [Cotas] [Colisoes]         |
|    [Relatorio] [Normas]       |
|    [Materiais] [Resumo]       |
+-------------------------------+
```

**Estados visuais**:
- **Idle**: microfone laranja, texto "Clique para falar com o Eng. Marcos"
- **Recording**: microfone vermelho pulsante, ondas animadas, texto "A ouvir..."
- **Processing**: spinner, texto "Eng. Marcos esta a pensar..."
- **Speaking**: icone audio animado, texto "Eng. Marcos esta a falar..."

**Voz IN (STT)**:
- Web Speech API, `lang="pt-PT"`, `continuous=true`, `interimResults=true`
- Loop `onresult` comeca em `event.resultIndex`
- Interim aparece como subtitulo temporario (fade out)
- Quando `isFinal`, acumula o texto final
- Quando gravacao para (`onend`), envia automaticamente o texto acumulado via `onSendMessage`
- Subtitulo do utilizador desaparece apos 3 segundos

**Voz OUT (TTS)**:
- `window.speechSynthesis` com `lang="pt-PT"`
- Automaticamente fala a resposta do agente
- Limpa markdown antes de falar (remove `**`, `#`, `\n`)
- Tenta encontrar voz portuguesa
- Subtitulo da resposta visivel enquanto fala, desaparece apos 3 segundos
- Botao mute (toggle persistente)
- Botao repetir ultima resposta

**Sem elementos de chat**:
- Zero `<input>`, zero `<textarea>`
- Zero lista de mensagens
- Zero scroll area de chat
- Mensagens persistem no Supabase em background (via hook) mas NAO sao visiveis

**Comandos rapidos**:
- Botoes pequenos que enviam texto pre-definido completo
- "Verificar cotas" envia "Verifica as cotas dos projetos e identifica divergencias"
- "Colisoes" envia "Quais sao as colisoes entre redes enterradas e elementos estruturais?"
- "Relatorio" envia "Prepara o relatorio tecnico com as incompatibilidades encontradas"
- "Normas PT" envia "Quais normas portuguesas e europeias se aplicam a esta obra?"
- "Materiais" envia "Analisa os materiais especificados nos projetos"
- "Resumo" envia "Faz um resumo da analise de incompatibilidades desta obra"
- Ao clicar, o texto e enviado directamente (sem mostrar no ecra)

## 3. useIncompaticheck.ts — sendUserMessage com edge function

Alterar `sendUserMessage` para:
1. Guardar mensagem do user no Supabase
2. Chamar `supabase.functions.invoke('incompaticheck-agent')` com:
   - `messages`: ultimas 20 mensagens do chatMessages
   - `findings`: array de findings actual
   - `obraName`: nome da obra activa
3. Guardar resposta do agente no Supabase
4. Retornar o texto da resposta (para o AgentPanel usar com TTS)
5. Novo state `agentThinking` para controlar indicador visual

A assinatura de `sendUserMessage` muda para `async (content: string) => Promise<string | undefined>` para que o AgentPanel saiba quando a resposta chegou e possa fala-la.

## 4. IncompatiCheck.tsx — Props actualizadas

O AgentPanel recebe novas props:
- `onSendMessage: (content: string) => Promise<string | undefined>` (async, retorna resposta)
- `agentThinking: boolean` (estado de processamento)
- `findings: Finding[]` (para contexto, passado ao quick commands)

Remove a prop `chatMessages` (ja nao ha chat visivel).

## Fluxo completo

1. Utilizador clica microfone -> STT inicia
2. Texto transcrito aparece como subtitulo temporario
3. Gravacao para -> texto final enviado automaticamente
4. Estado muda para "A pensar..."
5. Edge function chama Gemini com contexto completo
6. Resposta chega, estado muda para "A falar..."
7. Speech Synthesis fala a resposta
8. Subtitulo da resposta visivel enquanto fala
9. Tudo volta ao estado idle
10. Mensagens persistem no Supabase em background

Comandos rapidos seguem o mesmo fluxo a partir do passo 4.
