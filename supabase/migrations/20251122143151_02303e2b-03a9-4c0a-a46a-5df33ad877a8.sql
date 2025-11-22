-- Create linen automation settings table
CREATE TABLE linen_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  lookahead_bookings INTEGER NOT NULL DEFAULT 3,
  delivery_advance_days INTEGER NOT NULL DEFAULT 14,
  min_advance_days INTEGER NOT NULL DEFAULT 7,
  default_provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER update_linen_automation_settings_updated_at
  BEFORE UPDATE ON linen_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert initial record with default values
INSERT INTO linen_automation_settings (
  is_enabled, 
  lookahead_bookings, 
  delivery_advance_days, 
  min_advance_days
) VALUES (
  true,  -- Default enabled
  3,     -- Check next 3 bookings
  14,    -- Delivery 14 days before check-in
  7      -- Don't create if check-in < 7 days
);

-- Add comments for documentation
COMMENT ON TABLE linen_automation_settings IS 'Configuration for automatic linen order creation';
COMMENT ON COLUMN linen_automation_settings.lookahead_bookings IS 'Number of upcoming bookings per house to check';
COMMENT ON COLUMN linen_automation_settings.delivery_advance_days IS 'Days before check-in for delivery date';
COMMENT ON COLUMN linen_automation_settings.min_advance_days IS 'Minimum advance days - do not create if check-in is too close';