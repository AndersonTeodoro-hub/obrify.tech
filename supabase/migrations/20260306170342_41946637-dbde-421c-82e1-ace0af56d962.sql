ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS manufacturer_docs JSONB DEFAULT '[]'::jsonb;