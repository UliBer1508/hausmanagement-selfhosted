-- 1. Vereinfache additional_fees Struktur in houses (entferne Platform-Trennung)
-- Migriere von booking_com/airbnb zu einfacher Struktur
UPDATE houses
SET additional_fees = jsonb_build_object(
  'service_fee_per_stay', COALESCE((additional_fees->'booking_com'->>'service_fee_per_stay')::numeric, 0),
  'tourist_tax_per_night', COALESCE((additional_fees->'booking_com'->>'tourist_tax_per_night')::numeric, 2.50),
  'cleaning_fee_per_stay', COALESCE((additional_fees->'booking_com'->>'cleaning_fee_per_stay')::numeric, 80),
  'electricity_fee_per_stay', COALESCE((additional_fees->'booking_com'->>'electricity_fee_per_stay')::numeric, 40),
  'linen_fee_per_stay', COALESCE((additional_fees->'booking_com'->>'linen_fee_per_stay')::numeric, 30),
  'vat_percentage', COALESCE((additional_fees->'booking_com'->>'vat_percentage')::numeric, 19)
)
WHERE additional_fees IS NOT NULL;

-- 2. Füge pricing_config Spalte hinzu
ALTER TABLE houses
ADD COLUMN IF NOT EXISTS pricing_config jsonb DEFAULT jsonb_build_object(
  'markup_percentage', 0,
  'standard_guests', 6
);

-- 3. Erstelle monthly_pricing Tabelle
CREATE TABLE IF NOT EXISTS monthly_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
  competitor_property_id UUID REFERENCES competitor_properties(id) ON DELETE CASCADE,
  
  -- Zeitraum
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  
  -- Preise
  base_price_7nights NUMERIC NOT NULL,
  markup_percentage NUMERIC,
  final_price_7nights NUMERIC,
  
  -- Metadaten
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'scraped', 'calculated')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT monthly_pricing_unique_own 
    UNIQUE (house_id, month, year),
  CONSTRAINT monthly_pricing_unique_competitor 
    UNIQUE (competitor_property_id, month, year),
  CONSTRAINT monthly_pricing_check_owner 
    CHECK (
      (house_id IS NOT NULL AND competitor_property_id IS NULL) OR
      (house_id IS NULL AND competitor_property_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_monthly_pricing_house_period 
  ON monthly_pricing(house_id, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_competitor_period 
  ON monthly_pricing(competitor_property_id, year, month);