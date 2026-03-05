

# Plan: Visual Annotations for IncompatiCheck Analysis & PDF Report

## Overview
Add zone coordinate data to Claude's analysis output, create a client-side utility to render annotated plan images with colored circles, and embed these annotated images in both the UI findings list and the PDF report.

## Changes

### 1. Edge Function `supabase/functions/incompaticheck-analyze/index.ts`
- Update `getAnalysisPrompt()` to add a `zone` field to the JSON schema Claude returns:
  ```json
  "zone": {
    "description": "Zona central-esquerda da planta...",
    "x_percent": 35,
    "y_percent": 50,
    "radius_percent": 15,
    "source_project": "filename.pdf"
  }
  ```
- Add Portuguese instructions explaining approximate zone marking

### 2. Create `src/utils/annotate-plan-image.ts`
- `pdfPageToImage(pdfBase64: string): Promise<string>` — uses pdfjs-dist to render PDF page 1 to a canvas, returns JPEG data URL
- `annotateImage(imageDataUrl: string, annotations: ZoneAnnotation[]): Promise<string>` — draws semi-transparent colored circles (red/amber/blue by severity), dashed borders, and labeled ID tags on the image
- Export `ZoneAnnotation` interface

### 3. Update `src/pages/app/IncompatiCheck.tsx`
- Extend `AIFinding` interface with optional `zone` field
- In the findings list UI, for each finding with a `zone`, show a "Ver zona" button that lazily generates and displays the annotated plan image inline (expand/collapse)
- Update PDF export button handler (`handleExportPDF`):
  1. Download referenced project PDFs from storage (cached per project name)
  2. Render first page to image via `pdfPageToImage`
  3. Annotate with `annotateImage` per finding
  4. Pass `Map<findingId, annotatedImageDataUrl>` to the report generator
- Add a loading toast during PDF generation

### 4. Update `src/pages/app/incompaticheck/useIncompaticheck.ts`
- Update `generateReport` to accept an optional `annotatedImages?: Map<string, string>` parameter
- After the findings table row for each finding, if an annotated image exists:
  - Add the image (fit to content width, max height 100mm)
  - Add italic caption with `zone.description`
- This keeps the existing report structure but enriches it with visual annotations

## Technical Notes
- pdfjs-dist and jspdf are already installed
- PDF.js worker must use the Cloudflare CDN path per project convention
- Zone coordinates are approximate — circles are intentionally large (semi-transparent) to mark general areas
- Project images are cached to avoid re-downloading the same PDF for multiple findings
- The `zone` field is optional in findings — gracefully skip annotation when absent

## Files
1. **Edit** `supabase/functions/incompaticheck-analyze/index.ts` — update prompt
2. **Create** `src/utils/annotate-plan-image.ts` — PDF-to-image + annotation utility
3. **Edit** `src/pages/app/IncompatiCheck.tsx` — UI zone display + PDF export with annotations
4. **Edit** `src/pages/app/incompaticheck/useIncompaticheck.ts` — accept annotated images in report generator

