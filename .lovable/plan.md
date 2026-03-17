

# 3 Correções no IncompatiCheck

## 1. Logo da empresa de fiscalização no cabeçalho PDF

**`IncompatiCheck.tsx`**: Adicionar estado `fiscalLogo` com localStorage (`incompaticheck_fiscal_logo`), campo de upload ao lado do cliente, e passar para `generateReportWithAnnotations(result, images, clientLogo, fiscalLogo)`.

**`useIncompaticheck.ts`**: Adicionar parâmetro `fiscalLogoBase64?: string | null` a `generateReport` e `generateReportWithAnnotations`. No cabeçalho de ambos:
- Se `fiscalLogoBase64`, renderizar logo em (15, 5, 25, 15) e mover texto "IncompatiCheck" para x=45
- Se não, manter x=20 como está

## 2. Botão "Baixar Parecer PDF" na secção PDE

**`useIncompaticheck.ts`**: Adicionar `generatePdeReport(pdeAnalysis, pdeDocsList, clientLogo?, fiscalLogo?)` — gera PDF com cabeçalho escuro, veredicto, resumo, documentos analisados, incompatibilidades abordadas, novos problemas, notas técnicas e recomendação. Expor no return.

**`IncompatiCheck.tsx`**: No painel de veredicto PDE (após linha 1081), adicionar botão `<Download /> Baixar Parecer PDF` que chama `ic.generatePdeReport(latestAnalysis, ic.pdeDocuments, clientLogo, fiscalLogo)`.

## 3. Remover "automaticamente" do rodapé

**`useIncompaticheck.ts`**:
- Linha 651: `'Gerado automaticamente por IncompatiCheck'` → `'Gerado por IncompatiCheck'`
- Linha 855: Idem

## Ficheiros

| Ficheiro | Alteração |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Estado fiscalLogo + upload + passar aos geradores + botão PDE PDF |
| `src/pages/app/incompaticheck/useIncompaticheck.ts` | Param fiscalLogo nos 2 geradores + logo no header + `generatePdeReport` + limpar "automaticamente" |

