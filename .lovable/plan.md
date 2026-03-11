

# Fix: Empreiteiro field not persisting or exporting

## Root cause
Three problems found:
1. **No DB column** — `photo_reports` table has no `contractor` column, so the value is never saved
2. **Not included in save** — `handleSave` builds `record` without the empreiteiro value
3. **Hardcoded empty string in export** — `handleExport` passes `''` as the empreiteiro argument to PDF/DOCX generators

## Changes

### 1. Database migration
Add `contractor TEXT` column to `photo_reports`.

### 2. `src/pages/app/PhotoReports.tsx`
- **Report type**: Add `contractor` field
- **Default value**: Initialize `empreiteiro` from `localStorage.getItem('photo_report_contractor') || 'Ferreira Build Power'`
- **`openNewForm`**: Use localStorage default instead of `''`
- **`openEditForm`**: Load `report.contractor` (fall back to localStorage default)
- **`handleSave`**: Add `contractor: empreiteiro` to the record; also persist to `localStorage('photo_report_contractor')`
- **`handleExport`**: Pass `report.contractor || ''` instead of `''` as the empreiteiro argument

### 3. `src/utils/photo-report-pdf.ts` — No changes needed
The function already accepts and uses the `empreiteiro` parameter correctly.

