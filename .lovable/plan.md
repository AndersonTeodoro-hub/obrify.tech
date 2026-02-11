

# Correcao de 3 Bugs Criticos no IncompatiCheck

## Bug 1: Voz Duplica Texto na Caixa de Preview

**Causa raiz**: No `AgentPanel.tsx` linha 59, o loop `onresult` itera desde `i = 0` em vez de `event.resultIndex`. Com `continuous=true`, cada disparo de `onresult` re-processa TODOS os resultados anteriores, duplicando o texto final acumulado no `interimText`.

**Ficheiro**: `src/pages/app/incompaticheck/AgentPanel.tsx`

**Correcao**: Alterar o loop para comecar em `event.resultIndex`:
```typescript
for (let i = event.resultIndex; i < e.results.length; i++) {
```

Isto garante que so processa resultados novos, sem re-acumular texto ja processado.

---

## Bug 2: Agente Nao Responde

**Causa raiz**: No `useIncompaticheck.ts` linhas 361-363, a resposta do agente esta dentro de um `setTimeout` com callback `async`. O `setTimeout` nao aguarda a Promise, e se houver erro nao ha catch. Alem disso o delay de 600ms pode causar race conditions.

**Ficheiro**: `src/pages/app/incompaticheck/useIncompaticheck.ts`

**Correcao**: Remover o `setTimeout` e chamar `sendMessage` directamente com `await` apos a mensagem do utilizador. Adicionar try/catch para garantir que erros nao passam silenciosamente:

```typescript
const sendUserMessage = useCallback(async (content: string) => {
  if (!obraAtiva || !user) return;
  await sendMessage(content, 'user', obraAtiva.id);
  
  // Gerar e guardar resposta do agente imediatamente
  const agentResponse = generateAgentResponseFromFindings(content, findings);
  await sendMessage(agentResponse, 'agent', obraAtiva.id);
}, [obraAtiva, user, findings, sendMessage]);
```

---

## Bug 3: Analise com 0 Findings

**Causa raiz**: A funcao `crossAnalyze` em `helpers.ts` so gera findings baseados em disciplinas quando `types.length >= 2` (linha ~130). Se todos os 299 projetos sao do mesmo tipo, retorna array vazio. Alem disso, erros de parse de PDF sao logados na consola mas nao geram findings informativos.

**Ficheiro**: `src/pages/app/incompaticheck/useIncompaticheck.ts` (funcao `runAnalysis`)

**Correcoes**:

1. Adicionar findings INFO para cada PDF que falhe a extraccao de texto (dentro do catch no loop de PDFs, linhas 278-281)

2. Adicionar findings INFO para cada ficheiro DWG/DWF/IFC (ja existe no `crossAnalyze` mas pode nao estar a funcionar se os tipos nao corresponderem)

3. Apos `crossAnalyze`, se `newFindings` continuar vazio, adicionar um finding de fallback baseado nas disciplinas presentes -- mesmo que so haja 1 tipo

4. Garantir que o fallback tambem funciona com tipo unico (ex: "X projetos de fundacoes carregados. Recomenda-se verificacao visual complementar.")

**Ficheiro**: `src/pages/app/incompaticheck/helpers.ts` (funcao `crossAnalyze`)

**Correcao adicional**: Remover a condicao `types.length >= 2` do bloco de fallback. Mesmo com apenas 1 disciplina, gerar um finding INFO: "Analise concluida com X projetos de {tipo}. Recomenda-se verificacao visual."

---

## Ficheiros a Alterar (apenas 3)

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/incompaticheck/AgentPanel.tsx` | Linha 59: `i = 0` passa a `i = event.resultIndex` |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | Linhas 355-364: remover setTimeout, await directo. Linhas 278-284: adicionar finding quando PDF falha |
| `src/pages/app/incompaticheck/helpers.ts` | Funcao crossAnalyze: remover condicao `types.length >= 2`, adicionar fallback para tipo unico |

Nenhum outro ficheiro e alterado. Nenhuma tabela, bucket ou dependencia e modificada.

