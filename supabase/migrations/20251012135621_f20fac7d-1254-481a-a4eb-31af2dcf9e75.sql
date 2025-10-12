-- Create booking_linen_config table for per-house configuration
CREATE TABLE IF NOT EXISTS booking_linen_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
  lookahead_bookings INTEGER NOT NULL DEFAULT 3,
  warning_days_before INTEGER NOT NULL DEFAULT 7,
  auto_suggest BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(house_id)
);

-- Add trigger for updated_at
CREATE TRIGGER update_booking_linen_config_updated_at
  BEFORE UPDATE ON booking_linen_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Extend linen_orders table with new columns
ALTER TABLE linen_orders 
  ADD COLUMN IF NOT EXISTS order_source TEXT CHECK (order_source IN ('booking_required', 'manual', 'buffer_refill')) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS suggested_at TIMESTAMPTZ;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_linen_orders_booking_id ON linen_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_linen_orders_order_source ON linen_orders(order_source);

-- Insert default config for existing houses
INSERT INTO booking_linen_config (house_id, lookahead_bookings, warning_days_before, auto_suggest)
SELECT id, 3, 7, true
FROM houses
ON CONFLICT (house_id) DO NOTHING;