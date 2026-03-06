

# Plan: Update ProjectKnowledge Upload Modal

## Changes

### 1. `src/pages/app/ProjectKnowledge.tsx`

**Update SPECIALTIES constant** to two grouped arrays:
```typescript
const PROJECT_SPECIALTIES = [
  'Topografia', 'Arquitectura', 'Estrutural', 'Fundações', 'Rede Enterrada',
  'AVAC', 'Águas e Esgotos', 'Electricidade', 'Telecomunicações', 'Gás',
  'Segurança Contra Incêndios', 'Acústica', 'Térmica',
];

const DOCUMENT_TYPES = [
  'Contrato', 'Caderno de Encargos', 'Condições Técnicas', 'Mapa de Quantidades (MQT)',
  'Memória Descritiva', 'Acta de Reunião', 'Relatório Fotográfico', 'Pormenores Construtivos',
  'Mapa de Acabamentos', 'Plano de Segurança', 'Plano de Qualidade', 'Correspondência', 'Outros',
];
```

**Update upload dialog** (lines 509-572):
- Change label from "Especialidade" to "Tipo de Documento"
- Add `SelectGroup` + `SelectLabel` for two groups with separator labels
- Change file input `accept` to `.pdf,.jpg,.jpeg,.png`
- Update drop zone text to "Arraste ficheiros para aqui" and subtitle "PDF · JPG · PNG — máx. 2GB"
- File list icons: show 📄 for PDF, 🖼️ for images

**Update `handleUpload`** (line 128-175):
- Detect file type from extension and set `document_type` accordingly (`pdf`, `jpg`, `png`)

**Update `processDocument`** (line 177-233):
- Rename `pdf_base64` param to `file_base64` in edge function call
- Pass `file_type` (e.g. `application/pdf`, `image/jpeg`, `image/png`) to edge function

**Update empty state text** (line 382-383):
- Change "Carregue PDFs" to "Carregue documentos"

### 2. `supabase/functions/eng-silva-knowledge/index.ts`

**Update `process_document` action** (lines 29-40):
- Accept `file_base64` and `file_type` params (fallback to `pdf_base64` for backwards compat)
- If `file_type` starts with `image/`, send as `type: "image"` with appropriate `media_type`
- Otherwise keep current `type: "document"` behavior for PDFs

## Files
1. **Edit** `src/pages/app/ProjectKnowledge.tsx` — grouped dropdown, multi-format accept, file type detection
2. **Edit** `supabase/functions/eng-silva-knowledge/index.ts` — image support in Claude call

