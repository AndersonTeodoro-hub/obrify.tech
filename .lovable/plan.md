

# 6 Correcções — MaterialApprovals.tsx + material-approval-pdf.ts

**Note**: Contrary to user's assumption, the PDF export modal states (`pdfModalOpen`, etc.) do NOT currently exist. Line 715 calls `generateMaterialApprovalPDF` directly. All states need to be created.

---

## Files changed (2 only)
- `src/pages/app/MaterialApprovals.tsx`
- `src/utils/material-approval-pdf.ts`

---

## 1. PDF: Header overlaps table on page 2

**File**: `material-approval-pdf.ts` lines 207-228

Add `margin.top: MT + 30` to the `autoTable` config so continuation pages reserve space for the header. Fix `didDrawPage` to only draw header on pages after the first table page.

## 2. Logo upload in PDF export modal + states

**File**: `MaterialApprovals.tsx`

Add new states (lines ~60-66 area):
- `pdfModalOpen` (boolean), `pdfModalApproval` (Approval | null)
- `pdfFiscalName` (string, init from `localStorage.getItem('pam_fiscal_name') || ''`)
- `pdfFiscalCompany` (string, init from `localStorage.getItem('pam_fiscal_company') || 'DDN'`)
- `pdfLogo` (string | null, init from `localStorage.getItem('pam_fiscal_logo')`)

Add `Input` to imports from `@/components/ui/input`.

Replace direct PDF call (line 715) with `setPdfModalApproval(a); setPdfModalOpen(true)`.

Add new Dialog before closing `</div>` with:
- Logo upload area (accept PNG/JPG), convert to base64, save to localStorage `pam_fiscal_logo`, show preview with remove button
- "Técnico Fiscal" Input (required)
- "Empresa" Input (optional, pre-fill "DDN")
- Cancel / Export buttons (export disabled if no fiscal name)
- On confirm: save to localStorage, call `generateMaterialApprovalPDF` with extra params

## 3. Logo in PDF header

**File**: `material-approval-pdf.ts`

Add optional params to function signature: `fiscalName?: string`, `fiscalCompany?: string`, `logoBase64?: string`.

In `addHeader`: if `logoBase64`, try/catch `doc.addImage(logoBase64, 'PNG', ML, MT, 20, 12)` and shift title to `ML + 24`. Add fiscal name/company lines in header subtext.

## 4. Mandatory "Técnico Fiscal" in Decision Final

**File**: `MaterialApprovals.tsx`

Add state `decisionFiscalName` (init from localStorage `pam_fiscal_name`).

In decision form (lines 690-702): add `Input` for "Técnico Fiscal" before textarea. Disable "Confirmar Decisão" if `!decisionFiscalName.trim()`.

Update `handleDecision` (line 281-293): use `decisionFiscalName` for `decided_by` and add `fiscal_name` field. Save to localStorage.

## 5. Never show email in decision display

Line 674: replace `a.decided_by` with logic that checks `(a as any).fiscal_name || (a.decided_by?.includes('@') ? '—' : a.decided_by)`.

In PDF (line 340): same logic — if `decided_by` contains `@`, show fiscal_name or `'—'`.

## 6. Fiscal notes isolated per card

Change `fiscalNote` from `string` to `Record<string, string>` (keyed by approval id).

Update:
- Line 638 value: `fiscalNote[a.id] || ''`
- Line 639 onChange: `setFiscalNote(prev => ({ ...prev, [a.id]: e.target.value }))`
- Line 647 disabled: `!(fiscalNote[a.id]?.trim()) || savingNote`
- `handleSaveFiscalNote` (line 296): use `fiscalNote[approvalId]`, clear only that key

