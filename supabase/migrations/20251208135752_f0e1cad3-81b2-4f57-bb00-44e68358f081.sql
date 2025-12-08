-- Extend linen_automation_settings with external sync fields
ALTER TABLE linen_automation_settings 
ADD COLUMN IF NOT EXISTS external_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS external_api_url TEXT DEFAULT 'https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-import',
ADD COLUMN IF NOT EXISTS external_kundennummer TEXT DEFAULT 'K470214';

-- Extend houses with external object number
ALTER TABLE houses 
ADD COLUMN IF NOT EXISTS external_objektnummer TEXT;

-- Set known object numbers
UPDATE houses SET external_objektnummer = 'O550634' WHERE name ILIKE '%Wald Chalet%';
UPDATE houses SET external_objektnummer = 'O415239' WHERE name ILIKE '%Venedigersiedlung%';

-- Extend linen_orders with external sync tracking
ALTER TABLE linen_orders 
ADD COLUMN IF NOT EXISTS external_bestellnummer TEXT,
ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ;

-- Create external article mapping table
CREATE TABLE IF NOT EXISTS external_article_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_item_key TEXT NOT NULL UNIQUE,
  external_artikelnummer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert known mappings
INSERT INTO external_article_mapping (internal_item_key, external_artikelnummer) VALUES
  ('bedding', 'WA001'),
  ('bath_mats', 'WA004')
ON CONFLICT (internal_item_key) DO NOTHING;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_external_article_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_external_article_mapping_updated_at ON external_article_mapping;
CREATE TRIGGER update_external_article_mapping_updated_at
  BEFORE UPDATE ON external_article_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_external_article_mapping_updated_at();