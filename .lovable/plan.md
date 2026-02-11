
# Fix: Agente Ouve Mas Nao Responde

## Causa raiz

Dois problemas identificados:

### Problema 1: `sendUserMessage` falha silenciosamente quando nao ha obra seleccionada

Em `useIncompaticheck.ts` linha 359:
```typescript
if (!obraAtiva || !user) return undefined;
```
Retorna `undefined` sem qualquer feedback. O `AgentPanel.tsx` recebe `undefined` na linha 111 e simplesmente volta ao estado idle — o utilizador nao ve nenhum erro nem ouve nenhuma resposta.

### Problema 2: Erros na chamada a edge function podem ser silenciosos

Se `supabase.functions.invoke` falha (ex: timeout, rede), o catch na linha 388 retorna uma string de erro que DEVERIA funcionar. Mas o `sendMessage` na linha 391 pode falhar se `obraAtiva` ficou null entretanto (stale closure).

### Problema 3: TTS pode nao iniciar se as vozes nao estiverem carregadas

O `speechSynthesis.getVoices()` pode retornar array vazio na primeira chamada (as vozes carregam async). A funcao `speakText` funciona mas a utterance pode nao ter voz atribuida, o que em alguns browsers nao produz som.

## Correcoes

### Ficheiro 1: `src/pages/app/incompaticheck/AgentPanel.tsx`

1. **Adicionar pre-carregamento de vozes**: No mount do componente, chamar `speechSynthesis.getVoices()` e ouvir o evento `voiceschanged` para garantir que as vozes estao disponiveis quando o TTS for chamado.

2. **Adicionar feedback visual quando `onSendMessage` retorna `undefined`**: Em vez de ir silenciosamente para idle, mostrar subtitulo "Seleccione uma obra primeiro" e falar a mensagem.

3. **Melhorar `sendAndSpeak`**: Se a resposta for `undefined`, dar feedback ao utilizador em vez de falhar silenciosamente.

### Ficheiro 2: `src/pages/app/incompaticheck/useIncompaticheck.ts`

1. **Nunca retornar `undefined` silenciosamente**: Quando `obraAtiva` ou `user` sao null, retornar uma mensagem de erro em vez de `undefined`:
```typescript
if (!obraAtiva || !user) return 'Seleccione uma obra primeiro para falar comigo.';
```

2. **Garantir que erros na edge function sempre retornam string**: O catch ja faz isto, mas adicionar log para debug.

## Ficheiros a alterar

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | `sendUserMessage` retorna mensagem de erro em vez de `undefined` |
| `src/pages/app/incompaticheck/AgentPanel.tsx` | Pre-carregar vozes TTS, melhorar feedback quando resposta falha |

## Detalhes tecnicos

### useIncompaticheck.ts — linha 359

Mudar de:
```typescript
if (!obraAtiva || !user) return undefined;
```
Para:
```typescript
if (!obraAtiva) return 'Seleccione uma obra primeiro para que eu possa ajudar.';
if (!user) return 'Precisa de iniciar sessao primeiro.';
```

### AgentPanel.tsx — pre-carregamento de vozes

Adicionar `useEffect` no mount:
```typescript
useEffect(() => {
  const loadVoices = () => {
    window.speechSynthesis.getVoices();
  };
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
}, []);
```

### AgentPanel.tsx — sendAndSpeak melhorado

Garantir que mesmo quando a resposta vem de um erro (ex: "Seleccione uma obra"), o agente FALA essa mensagem e mostra o subtitulo. O bloco `if (response)` ja cobre isto porque a string de erro nao e `undefined`.

Resultado: o utilizador vai SEMPRE ouvir uma resposta — ou a resposta da IA, ou uma mensagem a pedir para seleccionar a obra.
