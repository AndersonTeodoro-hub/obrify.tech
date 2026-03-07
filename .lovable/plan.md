

# Separar Observações do Fiscal da Decisão Final

## Problema actual
O botão "Adicionar Notas" abre um modal que, ao guardar, força uma decisão (`handleDecision` é chamado com `approved` por defeito na linha 733). Notas e decisão estão misturadas.

## Alterações

### 1. Base de dados — nova coluna `fiscal_notes`
Adicionar coluna `fiscal_notes JSONB DEFAULT '[]'` à tabela `material_approvals`. Formato: array de objectos `{ note: string, created_at: string }`.

### 2. Frontend — `MaterialApprovals.tsx`

**Novo estado:**
- `fiscalNote` (string) — texto da nota actual
- `savingNote` (boolean) — loading ao guardar

**Nova função `handleSaveFiscalNote(approvalId)`:**
- Lê `fiscal_notes` actual do approval
- Faz append do novo objecto `{ note, created_at }` ao array
- Faz `UPDATE` na tabela `material_approvals` apenas do campo `fiscal_notes`
- NÃO altera status, final_decision, nem nenhum outro campo

**Remover** o botão "Adicionar Notas" que abre o modal de decisão (linha 627). Remover o modal de notas do revisor (linhas 727-736).

**Novo layout dentro do card expandido (após a análise IA):**

```text
┌─────────────────────────────────────────┐
│  RESULTADO DA ANÁLISE IA                │
│  (material proposto, compliance, etc.)  │
├─────────────────────────────────────────┤
│  OBSERVAÇÕES DO FISCAL                  │
│  [textarea] [Guardar Observação]        │
│  • 07/03/2026 09:30 — "Aguardar..."     │
│  • 07/03/2026 10:15 — "Confirmar..."    │
├─────────────────────────────────────────┤
│  DECISÃO FINAL                          │
│  [Aprovado] [Aprovado c/Reservas]       │
│  [Rejeitado]                            │
│  Justificação: [textarea]               │
│  [Confirmar Decisão]                    │
│  (ou exibir decisão já tomada)          │
├─────────────────────────────────────────┤
│  [Exportar PDF] [Eliminar]              │
└─────────────────────────────────────────┘
```

**Secção "Observações do Fiscal"** (inline, sem modal):
- Textarea + botão "Guardar Observação"
- Lista de observações existentes (`fiscal_notes` do approval) com data/hora formatada
- Disponível sempre, independentemente de haver decisão final

**Secção "Decisão Final"** (inline, sem modal):
- Se não há decisão: 3 botões de decisão + textarea de justificação + botão "Confirmar Decisão"
- Se já há decisão: mostrar resumo (como actualmente) com decisão, autor, data e justificação
- `handleDecision` usa o `decisionNotes` como `reviewer_notes` (justificação da decisão)

**Actualizar tipo `Approval`:** adicionar `fiscal_notes: Array<{ note: string; created_at: string }> | null`

### 3. Ficheiros alterados
- **Migration SQL** — adicionar coluna `fiscal_notes`
- **`src/pages/app/MaterialApprovals.tsx`** — refactoring do layout expandido e lógica

