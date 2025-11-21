-- Create cleaning_automation_settings table for global auto-cleaning configuration
CREATE TABLE cleaning_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Global settings (only 1 row in this table)
  default_provider_id UUID REFERENCES service_providers(id),
  schedule_timing TEXT DEFAULT 'on_checkin' 
    CHECK (schedule_timing IN ('day_before', 'on_checkin', 'day_after')),
  default_time TIME DEFAULT '10:00',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment explaining the table
COMMENT ON TABLE cleaning_automation_settings IS 'Global configuration for automatic cleaning task creation. Should contain only one row.';

-- Trigger for updated_at
CREATE TRIGGER update_cleaning_automation_settings_updated_at
  BEFORE UPDATE ON cleaning_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert initial row with Amela as default provider
INSERT INTO cleaning_automation_settings (default_provider_id, schedule_timing, default_time)
VALUES (
  '9de6e071-7e89-4d66-9433-a5f01acaa493', -- Amela ID
  'on_checkin',
  '10:00'
);