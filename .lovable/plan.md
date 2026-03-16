

# Plano: Persistência de Resultados + Cleanup de Referências a "IA"

## Contexto

A UI do IncompatiCheck só mostra resultados da análise quando `analysisResult` (estado local) existe. Ao recarregar a página, os dados desaparecem apesar de estarem persistidos na DB via `ic.analysis` e `ic.findings`.

## Alterações

### 1. `src/pages/app/IncompatiCheck.tsx` — Fallback com dados persistidos

**Criar variáveis de fallback** (após linha 377):
- `hasPersistedAnalysis`: true quando não há `analysisResult` mas existe `ic.analysis` + `ic.findings`
- `displayFindings`: mapear `ic.findings` (severity `critical`→`alta`, `warning`→`media`, `info`→`baixa`) para formato `AIFinding[]`
- `displayAltaCount`, `displayMediaCount`, `displayBaixaCount`: contadores baseados na fonte activa
- `hasResults`: `!!analysisResult || hasPersistedAnalysis`

**Substituir condições de render**:
- Linha 568: `!analysisResult` → `!analysisResult && !hasPersistedAnalysis` (painel "Pronto para analisar" só aparece se não há resultados)
- Linha 597: `analysisResult` → `hasResults`
- Linha 640: `analysisResult.findings.length` → `displayFindings.length` (e contadores)
- Linha 658: metadata text — quando persistido, usar `ic.analysis?.completed_at`
- Linha 666: `analysisResult &&` → `(analysisResult || hasPersistedAnalysis) &&` (skipped files — só com local)
- Linha 680: `analysisResult` → `hasResults`
- Linha 769: `analysisResult` → `hasResults`

**Substituir `analysisResult?.findings`/`analysisResult.findings`**:
- Linha 365: `filteredFindings` usar `displayFindings`
- Linha 640-643: contadores usar `displayAltaCount/displayMediaCount/displayBaixaCount`

**PDF export fallback** (linha 141-206):
- Construir `resultToExport` a partir de dados persistidos se `analysisResult` é null

**Texto informativo** para dados persistidos:
- Dentro do bloco de resultados, nota com data da última análise

### 2. `src/pages/app/IncompatiCheck.tsx` — Botão "Excluir Análise"

Adicionar botão no bloco de acções (junto a "Nova Análise" e "PDF") que:
- Pede confirmação antes de eliminar
- Chama `ic.deleteAnalysis(ic.analysis.id)` 
- Limpa `analysisResult`, `severityFilter`

### 3. `src/pages/app/incompaticheck/useIncompaticheck.ts` — `deleteAnalysis`

Adicionar função:
```typescript
const deleteAnalysis = useCallback(async (analysisId: string) => {
  await supabase.from('incompaticheck_analyses').delete().eq('id', analysisId);
  setAnalysis(null);
  setFindings([]);
}, []);
```
Expor no return.

### 4. Remover menções a "IA"

| Ficheiro | Linha | De | Para |
|---|---|---|---|
| `IncompatiCheck.tsx` | 525 | "A IA usará resumos inteligentes..." | "Serão usados resumos inteligentes em vez dos PDFs completos, resultando em análises mais rápidas e precisas." |
| `IncompatiCheck.tsx` | 588 | "A IA irá comparar os projectos..." | "Os projectos carregados serão comparados para identificar potenciais conflitos entre especialidades." |
| `IncompatiCheck.tsx` | 957 | "Parecer da IA" | "Parecer Técnico" |
| `AgentPanel.tsx` | 221 | "Engº Marcos IA" | "Engº Marcos" |

## Ficheiros modificados

| Ficheiro | Alteração |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Fallback persistido, botão excluir, remover "IA" |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | Adicionar `deleteAnalysis`, expor no return |
| `src/pages/app/incompaticheck/AgentPanel.tsx` | Remover "IA" do nome |

## Garantias

- Se não há dados persistidos nem locais, o painel "Pronto para analisar" aparece normalmente
- Ao correr nova análise, `analysisResult` local sobrepõe os dados persistidos
- O botão "Excluir Análise" elimina da DB (CASCADE elimina findings) e limpa UI
- Nenhum texto visível menciona "IA"

