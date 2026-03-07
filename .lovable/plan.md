

# Substituir email por nome do fiscal no PDF e na interface

## Alterações

### 1. Base de dados — nova coluna `fiscal_name`
Adicionar `fiscal_name TEXT` à tabela `material_approvals` para guardar o nome do técnico fiscal (em vez do email).

### 2. `src/pages/app/MaterialApprovals.tsx`

**Novo estado + modal de exportação:**
- `pdfModalOpen`, `pdfModalApproval` — controlar modal antes de exportar
- `fiscalName` (string) — pre-fill de localStorage `'pam_fiscal_name'` ou eng_silva_memory profile.name
- `fiscalCompany` (string) — pre-fill de localStorage `'pam_fiscal_company'` ou `'DDN'`

**Fluxo do "Exportar PDF":**
1. Clique abre modal com inputs (Técnico Fiscal obrigatório, Empresa opcional)
2. Ao confirmar, guarda em localStorage, chama `generateMaterialApprovalPDF` com novos parâmetros `fiscalName` e `fiscalCompany`

**`handleDecision` — gravar nome em vez de email:**
- `decided_by: fiscalName || localStorage.getItem('pam_fiscal_name') || user?.email` → usa nome do fiscal
- Também gravar `fiscal_name` na coluna nova

**Interface — onde mostra "Por: email":**
- Linha 674: substituir `a.decided_by` (que agora será o nome) — garantir que nunca mostra email

### 3. `src/utils/material-approval-pdf.ts`

**Interface `ApprovalData`:** adicionar `fiscal_name?: string | null` e `fiscal_company?: string | null`

**Função `generateMaterialApprovalPDF`:** aceitar parâmetros adicionais `fiscalName` e `fiscalCompany`

**Cabeçalho:** adicionar linhas "Técnico Fiscal: Anderson Teodoro" e "Empresa: DDN"

**Decisão Final:** substituir `Por: ${approval.decided_by}` por `Técnico Fiscal: ${fiscalName} — ${fiscalCompany}`

**Remover** qualquer referência a email em todo o PDF.

### 4. Ficheiros alterados
- Migration SQL — `ALTER TABLE material_approvals ADD COLUMN fiscal_name TEXT`
- `src/pages/app/MaterialApprovals.tsx` — modal de exportação + lógica
- `src/utils/material-approval-pdf.ts` — novos parâmetros no cabeçalho e decisão

