

# Plan: Revert to Direct File Uploads for Material Approvals

## Overview
Remove the automatic project knowledge loading (causing timeouts) and revert to direct MQT/Contract file uploads. Add 5 upload sections to the modal and simplify the edge function.

## 1. Database Migration
Add missing columns for contract file tracking:
```sql
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS contract_file_path TEXT;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS contract_file_name TEXT;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS manufacturer_docs JSONB DEFAULT '[]'::jsonb;
```
(`certificates` and `manufacturer_docs` already exist but `IF NOT EXISTS` keeps it safe.)

## 2. `src/pages/app/MaterialApprovals.tsx`

**New state:** Add `mqtFile` and `contractFile` (both `File | null`).

**Update Approval type:** Add `contract_file_path`, `contract_file_name`.

**Upload modal** — 5 sections:
1. PAM / Ficha Técnica * (required, single PDF)
2. MQT / Caderno de Encargos (optional, single PDF)
3. Contrato da Obra (optional, single PDF)
4. Certificados e Laudos (optional, multiple)
5. Documentos do Fabricante (optional, multiple)

Remove the "auto from project knowledge" note.

**`handleSubmit`:** Upload MQT and Contract to storage, save paths in DB record.

**`processApproval`:** Download MQT and Contract, convert to base64, send `mqt_base64` and `contract_base64` to edge function.

**`handleDelete`:** Also delete contract file from storage.

## 3. `supabase/functions/analyze-material-approval/index.ts`

- Remove the `eng_silva_project_knowledge` query entirely (lines 80-114)
- Accept `mqt_base64` and `contract_base64` from request body (with defaults `null`)
- Build Claude content: PAM → MQT (if provided) → Contract (if provided) → Certificates → Manufacturer Docs → Analysis prompt
- Update the prompt text to mention MQT and Contract documents instead of "project knowledge context"

## Files affected
- **Migration** — add `contract_file_path`, `contract_file_name` columns
- **`src/pages/app/MaterialApprovals.tsx`** — add MQT/Contract uploads, update submission + processing
- **`supabase/functions/analyze-material-approval/index.ts`** — remove knowledge loading, accept direct documents

