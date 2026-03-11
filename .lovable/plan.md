

# Relatório Fotográfico Diário de Obra — Bloco 1

## Files to change (4 files)

### 1. Database migration
- Create `photo_reports` table with all specified columns
- FK to `incompaticheck_obras(id)` and `auth.users(id)` (no direct FK to auth.users — use user_id uuid NOT NULL)
- RLS: ALL policy where `auth.uid() = user_id`
- Create storage bucket `photo-reports` (private)
- Storage RLS policies for authenticated users on their own paths

### 2. `src/components/layout/AppSidebar.tsx`
- Add `{ title: 'Relatórios Fotográficos', url: '/app/photo-reports', icon: Camera }` to `mainItems` array after reports (line 45), using existing `Camera` icon (already imported)

### 3. `src/App.tsx`
- Import new `PhotoReports` page
- Add route `<Route path="photo-reports" element={<PhotoReports />} />`

### 4. `src/pages/app/PhotoReports.tsx` (NEW — ~600 lines)

**Structure mirrors MaterialApprovals.tsx pattern:**

**State:**
- Obra selection (reuse `incompaticheck_obras` query)
- Reports list with CRUD
- Form mode (list / create / edit)
- Form fields: date, weather, workers, equipment, works_done, observations, photos array, status
- Photo upload with preview, description, location per photo

**Obra selector** — same pattern as MaterialApprovals: card to select obra, dialog with obra list

**List view** — cards showing date, photo count, status badge (Rascunho/Final), action buttons (Edit, Delete). No PDF/DOCX buttons yet (Bloco 2).

**Form view (fullscreen dialog or inline):**
- Section 1: Auto-filled obra name, cidade, empreiteiro input, fiscalização pre-filled from localStorage
- Section 2: DatePicker, weather checkboxes + temperature input, workers input, equipment input
- Section 3: Works done textarea
- Section 4: Photo upload area (DropZone pattern), grid 2-col with preview + description + location inputs per photo, remove button, sort_order via up/down buttons
- Section 5: Observations textarea
- Section 6: Save Draft / Save Final / Cancel buttons

**Save logic:**
- Upload photos to `photo-reports` bucket at `{user_id}/{obra_id}/{report_id}/{filename}`
- Insert/update `photo_reports` row with photos JSONB array
- On edit: load existing photos from storage signed URLs for preview

**Delete:** confirm dialog, delete storage files + DB row

