

# Plan: Improve Material Approvals (PAM) Page

## Overview
Simplify the upload modal (remove MQT upload, auto-load from project knowledge), add certificate and manufacturer doc uploads, add PDF export, and rename PDM → PAM throughout.

## Changes

### 1. Database Migration
```sql
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS manufacturer_docs JSONB DEFAULT '[]'::jsonb;
```

### 2. `src/pages/app/MaterialApprovals.tsx` — Full rewrite of modal + submission logic

**New state variables:**
- `certFiles: File[]` and `mfgFiles: File[]` (arrays for multiple files)
- Remove `mqtFile` state

**New upload modal** with 3 sections:
1. PAM / Ficha Técnica (required, single PDF) — compact card ~80px, dashed border
2. Certificados e Laudos (optional, multiple PDF/JPG/PNG) — file list with remove buttons
3. Documentos do Fabricante (optional, multiple PDF/JPG/PNG) — file list with remove buttons
4. Info note: "O MQT e o Contrato são consultados automaticamente a partir do Conhecimento do Projecto."

**Updated `handleSubmit`:**
- Upload PAM to storage (sanitized filename)
- Upload each certificate file → build `certificates` JSON array `[{name, path, size}]`
- Upload each manufacturer doc → build `manufacturer_docs` JSON array
- Insert record with `certificates` and `manufacturer_docs` columns

**Updated `processApproval`:**
- Download PAM → base64
- Download each certificate → build `certificates_base64` array `[{name, base64, type}]`
- Download each manufacturer doc → build `manufacturer_docs_base64` array
- Call edge function with `pdm_base64`, `certificates_base64`, `manufacturer_docs_base64` (no `mqt_base64`)

**Updated `handleDelete`:**
- Also delete certificate and manufacturer doc files from storage

**Add "Exportar PDF" button** in expanded card next to action buttons, calling `generateMaterialApprovalPDF`.

**Rename all PDM → PAM** in labels and variables.

### 3. `supabase/functions/analyze-material-approval/index.ts` — Updated analysis

- Accept `certificates_base64` and `manufacturer_docs_base64` arrays
- Remove `mqt_base64` parameter
- Load full project knowledge (MQT, Contract, specs) from `eng_silva_project_knowledge` with richer context (full summaries + key elements, truncated at 6000 chars)
- Build Claude content: PAM doc → certificates (max 5) → manufacturer docs (max 5) → project context as text
- Keep existing Claude prompt structure, JSON response format, and Silva memory save

### 4. New file: `src/utils/material-approval-pdf.ts`

`generateMaterialApprovalPDF(approval, analysis, obraName)` using jsPDF:
- Header with title "Análise PAM", obra name, date
- Status badge (colored rectangle: green/amber/red)
- Material category and PAM file name
- Material Proposed section (name, manufacturer, model, specs)
- Project Specification section
- Compliance Checks table (aspect | status icon | detail)
- Issues list (red background)
- Conditions list (amber background)
- Justification text
- Norms Referenced list
- Reviewer Notes + Final Decision (if any)
- Confidence score bar
- Footer with Obrify branding

### Files affected
1. **Migration** — add `certificates` and `manufacturer_docs` columns
2. **`src/pages/app/MaterialApprovals.tsx`** — modal redesign, submission logic, PDF export button
3. **`supabase/functions/analyze-material-approval/index.ts`** — new params, auto-load knowledge
4. **`src/utils/material-approval-pdf.ts`** — new PDF generator

