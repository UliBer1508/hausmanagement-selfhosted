-- Create buffer_settings table for managing minimum linen buffer stock per house
CREATE TABLE buffer_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL UNIQUE REFERENCES houses(id) ON DELETE CASCADE,
  min_buffer_stock JSONB NOT NULL DEFAULT '{
    "bedding": 5,
    "large_towels": 5,
    "small_towels": 5,
    "sauna_towels": 5,
    "bath_mats": 3,
    "sink_towels": 3,
    "kitchen_towels": 2
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create trigger for automatic updated_at timestamp
CREATE TRIGGER update_buffer_settings_updated_at
  BEFORE UPDATE ON buffer_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();