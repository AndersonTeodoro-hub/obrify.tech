

# Plan: Redesign IncompatiCheck Page

## Overview
Complete redesign of the IncompatiCheck page: remove the AgentPanel sidebar, update to use Obrify design system components (Card, Button, Badge, Breadcrumb), create a clean two-panel layout, and update the UploadModal to PDF-only with expanded project types.

## Files Modified

### 1. `src/pages/app/incompaticheck/types.ts`
- Add new project types: `arquitectura`, `avac`, `aguas_esgotos`, `electricidade`
- Update `ProjectType` union
- Change `ACCEPTED_FORMATS` to `['pdf']` only
- Change `FILE_SIZE_LIMIT` to 50MB

### 2. `src/pages/app/incompaticheck/UploadModal.tsx`
- Update drop zone text to "Arraste o ficheiro PDF para aqui"
- Update limit text to "Limite: 50MB por ficheiro. Formato: PDF"
- Update file input `accept` to `.pdf` only
- Update validation error message
- Render all project types (including new ones) from `PROJECT_TYPES`

### 3. `src/pages/app/IncompatiCheck.tsx` — Full redesign
- **Remove**: `AgentPanel` import and usage, the right sidebar `<div>` containing it, the left projects sidebar
- **Add imports**: `Card`, `CardHeader`, `CardTitle`, `CardContent` from ui/card; `Button` from ui/button; `Badge` from ui/badge; `Breadcrumb` components; lucide icons (`FileSearch`, `Upload`, `FileText`, `AlertTriangle`, `Download`, `Plus`, `Loader2`)
- **Layout structure**:
  - Full-width page using existing AppLayout (no custom sidebars)
  - Breadcrumb: Dashboard > IncompatiCheck
  - Header with title + subtitle + "Selecionar Obra" button (top right)
  - **No obra**: centered empty state with `FileSearch` icon
  - **Obra, no projects**: obra name + empty state + "+ Carregar Projectos" button
  - **Obra with projects (main state)**:
    - Two-column grid (lg:grid-cols-5, gap-6): left 3 cols "Projectos Carregados", right 2 cols "Análise"
    - Left panel: Card listing projects grouped by type, each showing filename, type badge, date, size; "+ Carregar Projecto" button at bottom
    - Right panel: Card with analysis prompt (if <2 projects show message), "Analisar Incompatibilidades" accent button (if 2+), explanation text
  - **Analyzing**: spinner state in right panel
  - **Results**: right panel expands to show findings list with severity badges (Alta/Média/Baixa mapped from critical/warning/info), filter buttons, export PDF button; stats cards above
- **Styling**: Use Tailwind classes matching Obrify design system (bg-background, dark mode support, accent gradients for primary actions, rounded-xl cards)
- **Keep**: all existing Supabase integration, obra/upload/share/preview modals, useIncompaticheck hook

### 4. `src/pages/app/incompaticheck/AgentPanel.tsx`
- File can remain (not deleted) but will no longer be imported. Optional cleanup.

## Key Design Decisions
- Use shadcn Card/Button/Badge/Breadcrumb components instead of inline styles
- Full-width layout (no sidebars) — projects list is inline in main content
- Accent/gold color for the primary "Analisar" CTA button
- Mobile responsive: stack columns on small screens
- Dark mode via existing CSS variables (bg-background, text-foreground, etc.)

