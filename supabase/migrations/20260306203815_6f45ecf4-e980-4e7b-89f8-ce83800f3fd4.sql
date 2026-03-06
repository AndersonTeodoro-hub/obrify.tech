ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS contract_file_path TEXT;
ALTER TABLE material_approvals ADD COLUMN IF NOT EXISTS contract_file_name TEXT;