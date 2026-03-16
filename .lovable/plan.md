

# Correcções ao Fluxo PDE

## Estado actual verificado

- **deleteObra**: Já tem cleanup de PDE storage (linhas 68-78) e `setPdeDocuments([])`/`setPdeAnalyses([])` (linhas 88-89). Nada a fazer.
- **Visibilidade da secção**: Depende de `analysisResult` local — desaparece ao recarregar. Precisa de fix.
- **handleAnalyze**: Sem try/catch — mostra "sucesso" mesmo com erro.
- **analyzeProposals**: Return silencioso em vez de throw.
- **Edge function**: Precisa de deploy.

## Alterações (3 ficheiros + 1 deploy)

### 1. `src/pages/app/IncompatiCheck.tsx` — Linha 744
Substituir condição de render:
```typescript
// De:
{analysisResult && (
  <PdeSection ic={ic} />
)}

// Para:
{(analysisResult || ic.analysis || ic.pdeDocuments.length > 0) && (
  <PdeSection ic={ic} />
)}
```

### 2. `src/pages/app/IncompatiCheck.tsx` — Linhas 793-798
Adicionar try/catch ao handleAnalyze:
```typescript
const handleAnalyze = async () => {
  if (!ic.obraAtiva) return;
  try {
    toast.info('A analisar propostas do empreiteiro...');
    await ic.analyzeProposals(ic.obraAtiva.id);
    toast.success('Análise de propostas concluída.');
  } catch (err: any) {
    toast.error(err.message || 'Erro na análise de propostas.');
  }
};
```

### 3. `src/pages/app/incompaticheck/useIncompaticheck.ts` — Linhas 497-500
Throw em vez de return silencioso:
```typescript
if (createErr || !analysisRow) {
  console.error('Create PDE analysis error:', createErr);
  setAnalyzingProposal(false);
  throw new Error('Erro ao iniciar análise.');
}
```

### 4. Deploy da Edge Function
Usar `supabase--deploy_edge_functions` para `incompaticheck-analyze-proposal`, seguido de teste com `supabase--curl_edge_functions` para confirmar que está operacional.

