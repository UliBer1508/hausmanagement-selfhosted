-- Add is_enabled field to cleaning_automation_settings
ALTER TABLE cleaning_automation_settings
ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT true;

-- Update existing row to have automation enabled
UPDATE cleaning_automation_settings
SET is_enabled = true
WHERE id IS NOT NULL;