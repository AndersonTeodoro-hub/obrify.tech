

# Plan: Update ProjectKnowledge Upload Modal

## Changes

### 1. `src/pages/app/ProjectKnowledge.tsx`

**Replace SPECIALTIES constant** with two grouped arrays:
- `PROJECT_SPECIALTIES`: Topografia, Arquitectura, Estrutural, Fundações, Rede Enterrada, AVAC, Águas e Esgotos, Electricidade, Telecomunicações, Gás, Segurança Contra Incêndios, Acústica, Térmica
- `DOCUMENT_TYPES`: Contrato, Caderno de Encargos, Condições Técnicas, Mapa de Quantidades (MQT), Memória Descritiva, Acta de Reunião, Relatório Fotográfico, Pormenores Construtivos, Mapa de Acabamentos, Plano de Segurança, Plano de Qualidade, Correspondência, Outros

**Update upload dialog:**
- Label "Especialidade" → "Tipo de Documento"
- Grouped dropdown with `SelectGroup` + `SelectLabel` for "Projectos e Especialidades" and "Documentos da Obra"
- File input: `accept=".pdf,.jpg,.jpeg,.png"`
- Drop zone text: "Arraste ficheiros para aqui" / "PDF · JPG · PNG — máx. 2GB"
- File list icons: 📄 for PDF, 🖼️ for images

**Update `handleUpload`:** detect file type from extension, set `document_type` accordingly

**Update `processDocument`:** pass `file_base64` + `file_type` (MIME type) to edge function

**Update empty state text:** "Carregue PDFs" → "Carregue documentos"

### 2. `supabase/functions/eng-silva-knowledge/index.ts`

**Update `process_document` action:**
- Accept `file_base64` and `file_type` (fallback to `pdf_base64` for backwards compat)
- If `file_type` starts with `image/` → send as `type: "image"` to Claude
- Otherwise → keep current `type: "document"` behavior for PDFs

