-- Adicionar categoria aos templates
ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'structure';

-- Adicionar campos aos itens
ALTER TABLE inspection_template_items 
ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'checkbox',
ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;