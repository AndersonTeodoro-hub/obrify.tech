

# 3 Surgical Fixes in MaterialApprovals.tsx

## Fix 1: Fiscal name input in decision flow
- Add `decisionFiscalName` state (line ~64), initialized from `localStorage.getItem('pam_fiscal_name')`
- Rewrite `handleDecision` (lines 290-304) to use `decisionFiscalName`, guard on empty, save to localStorage
- In decision JSX (lines 714-725): add `Label` + `Input` for "Técnico Fiscal *" before the textarea, disable confirm button when name is empty

## Fix 2: Never show email in decided_by display
- Line 698: replace simple conditional with logic that checks `decided_by` for `@` and shows "—" instead

## Fix 3: Per-card fiscal notes state
- Line 68: change `fiscalNote` string to `fiscalNotes: Record<string, string>` object
- Line 662-663: use `fiscalNotes[a.id]` for value/onChange
- Line 671: disable check uses `fiscalNotes[a.id]`
- Lines 319-331 in `handleSaveFiscalNote`: use `fiscalNotes[approvalId]`, clear only that key after save

### Files changed
- `src/pages/app/MaterialApprovals.tsx` only

