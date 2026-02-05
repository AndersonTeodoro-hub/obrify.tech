-- Add description column to floors table
ALTER TABLE floors ADD COLUMN IF NOT EXISTS description text;

-- Add type column to areas table with default value
ALTER TABLE areas ADD COLUMN IF NOT EXISTS type text DEFAULT 'other';