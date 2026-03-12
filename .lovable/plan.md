

# Separar MQT e Caderno de Encargos — Plano de Implementação

## Database Migration
Add two columns to `material_approvals`:
```sql
ALTER TABLE public.material_approvals ADD COLUMN ce_file_path text;
ALTER TABLE public.material_approvals ADD COLUMN ce_file_name text;
```

## `src/pages/app/MaterialApprovals.tsx` — Changes

### 1. Import
Add `BookOpen` to lucide-react imports (line 15).

### 2. Approval type (line 31)
Add `ce_file_path: string | null; ce_file_name: string | null;` after `contract_file_name`.

### 3. State (after line 54)
Add `const [ceFile, setCeFile] = useState<File | null>(null);`

### 4. handleSubmit (lines 126-138)
After MQT upload block, add CE upload block:
```typescript
let cePath: string | null = null;
if (ceFile) {
  cePath = `${basePath}_ce_${sanitizeFilename(ceFile.name)}`;
  const { error } = await supabase.storage.from('material-approvals').upload(cePath, ceFile);
  if (error) throw error;
}
```
In the insert record (line 156-171), add:
```typescript
ce_file_path: cePath,
ce_file_name: ceFile?.name || null,
```
In the reset after submit (lines 174-179), add `setCeFile(null);`

### 5. processApproval (after line 212)
Add CE download block (same pattern as contract):
```typescript
let ceBase64: string | null = null;
if (approval.ce_file_path) {
  try {
    const { data } = await supabase.storage.from('material-approvals').download(approval.ce_file_path);
    if (data) ceBase64 = await blobToBase64(data);
  } catch { /* skip */ }
}
```
Add `ce_base64: ceBase64` to the invoke body (line 253).
Add `has_ce: !!ceBase64` to the console.log (line 239).

### 6. handleDelete (line 320-326)
Add: `if ((approval as any).ce_file_path) pathsToRemove.push((approval as any).ce_file_path);`

### 7. Upload form (lines 816-823)
Replace single MQT/CE upload box with two separate boxes:
```tsx
<UploadBox
  icon={ScrollText}
  title="MQT / Mapa de Quantidades"
  subtitle="Mapa de quantidades e trabalhos (opcional)"
  accept=".pdf"
  files={mqtFile}
  onFilesChange={(f) => setMqtFile(f as File | null)}
/>

<UploadBox
  icon={BookOpen}
  title="Caderno de Encargos"
  subtitle="Condições técnicas, especificações de materiais, ensaios exigidos (opcional)"
  accept=".pdf"
  files={ceFile}
  onFilesChange={(f) => setCeFile(f as File | null)}
/>
```

---

## `supabase/functions/analyze-material-approval/index.ts` — Changes

### 1. Receive ce_base64 (after line 57)
```typescript
const ce_base64 = body.ce_base64 || null;
```
Add `has_ce: !!ce_base64` to log (line 66).

### 2. Add CE document to content (after MQT block, line 104)
```typescript
// 2b. Caderno de Encargos (if provided)
if (ce_base64) {
  content.push({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: ce_base64 },
  });
  content.push({
    type: "text",
    text: "[CADERNO DE ENCARGOS — condições técnicas, especificações de materiais, ensaios exigidos]",
  });
}
```

### 3. Update context note logic (lines 149-158)
Expand to cover all combinations of MQT, CE, and Contract. Key examples:
- MQT + CE + Contract → "Foram fornecidos o MQT, o Caderno de Encargos e o Contrato..."
- Only CE → "Foi fornecido o Caderno de Encargos..."

### 4. Update analysis prompt text (lines 164-171)
Add line: `2b. O Caderno de Encargos (se fornecido)`

### 5. Update system prompt (line 185)
Add reference to cross-checking PAM × MQT × Caderno de Encargos × Contrato × Certificados × Docs Fabricante.

