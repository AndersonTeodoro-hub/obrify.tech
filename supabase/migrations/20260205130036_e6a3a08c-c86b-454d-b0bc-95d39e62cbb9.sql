-- Add inspection_item_id to evidence_links for item-specific photos
ALTER TABLE evidence_links
ADD COLUMN IF NOT EXISTS inspection_item_id uuid REFERENCES inspection_items(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_evidence_links_inspection_item_id ON evidence_links(inspection_item_id);

-- Add comment for documentation
COMMENT ON COLUMN evidence_links.inspection_item_id IS 'Optional reference to specific inspection item for item-level evidence';