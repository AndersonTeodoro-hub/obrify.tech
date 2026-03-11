

# Relatórios Fotográficos — Bloco 2: PDF Export + Logo

## Important finding
The `docx` library is **not installed** in the project (not in package.json). Only `jspdf` and `jspdf-autotable` are available. I will implement the PDF export fully, but for DOCX I need to install the `docx` package first.

## Files to create/change (3 files)

### 1. NEW: `src/utils/photo-report-pdf.ts`
PDF generator using jsPDF following existing conventions (25mm margins, 160mm content width, splitTextToSize everywhere).

- `generatePhotoReportPDF(report, obraName, obraCidade, empreiteiro, fiscalName, fiscalCompany, photoImages, logoBase64?)` 
- Header on every page: logo (if provided) + title + obra name + date + green separator line (#4A7C59)
- Page 1: info table (obra, localização, empreiteiro, fiscalização, data, meteo, trabalhadores, equipamentos) + "Trabalhos Realizados" section
- Photo pages: 2 photos per row (~80mm each), with "Foto N", description, location below each
- Final section: observations + signature block (2 columns: Técnico Fiscal / Director de Obra)
- Footer: company name left, "Página X de Y" right

### 2. NEW: `src/utils/photo-report-docx.ts`
DOCX generator using the `docx` npm package (needs to be installed).

- Same layout as PDF: header with logo, info table, photo grid 2-col, observations, signatures
- Photos as `ImageRun` in `TableCell` with 220px fixed width
- Header/footer on every section

### 3. EDIT: `src/pages/app/PhotoReports.tsx`

**New state:**
- `reportLogo` (string | null, init from `localStorage.getItem('photo_report_logo')`)
- `exporting` (boolean)

**Logo upload in form** (Section 1, before Obra field):
- Upload area for PNG/JPG, convert to base64, save to localStorage `photo_report_logo`
- Preview with remove button

**Export buttons in list view** (each report card):
- "PDF" and "DOCX" icon buttons alongside Edit/Delete

**Export buttons in form view** (Section 6, alongside save buttons):
- "Exportar PDF" and "Exportar DOCX" buttons
- If report not yet saved, auto-save as draft first

**Export logic:**
1. Download each photo from `photo-reports` bucket via `supabase.storage.from('photo-reports').download(file_path)`
2. Convert blobs to base64
3. Call `generatePhotoReportPDF` or `generatePhotoReportDOCX`
4. Trigger browser download
5. Skip failed photo downloads gracefully

### Dependency
- Need to install `docx` package for DOCX generation

