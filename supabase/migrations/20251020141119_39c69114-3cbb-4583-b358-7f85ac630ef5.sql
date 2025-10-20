-- Phase 1: Wettbewerbsanalyse-System - Datenbank-Schema (KORRIGIERT)
-- Erstellt von: Lovable AI
-- Fix: Normale UNIQUE constraints statt partial indices für ON CONFLICT

-- ========================================
-- 1. COMPETITOR_PROPERTIES
-- ========================================
CREATE TABLE IF NOT EXISTS competitor_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
  competitor_name TEXT NOT NULL,
  property_name TEXT NOT NULL,
  property_url TEXT,
  platform TEXT CHECK (platform IN ('booking.com', 'airbnb', 'vrbo', 'fewo-direkt', 'other')),
  address TEXT,
  distance_km NUMERIC,
  max_guests INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  amenities JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_properties_house ON competitor_properties(house_id);
CREATE INDEX IF NOT EXISTS idx_competitor_properties_active ON competitor_properties(is_active);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_competitor_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_competitor_properties_updated_at ON competitor_properties;
CREATE TRIGGER trigger_competitor_properties_updated_at
BEFORE UPDATE ON competitor_properties
FOR EACH ROW
EXECUTE FUNCTION update_competitor_properties_updated_at();

-- ========================================
-- 2. DAILY_PRICING (mit korrigierten UNIQUE constraints)
-- ========================================
CREATE TABLE IF NOT EXISTS daily_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
  competitor_property_id UUID REFERENCES competitor_properties(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  currency TEXT DEFAULT 'EUR',
  min_stay INTEGER,
  is_available BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'scraped', 'api', 'historical')),
  scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_property_type CHECK (
    (house_id IS NOT NULL AND competitor_property_id IS NULL) OR
    (house_id IS NULL AND competitor_property_id IS NOT NULL)
  ),
  -- Normale UNIQUE constraint (funktioniert mit ON CONFLICT)
  CONSTRAINT unique_house_date UNIQUE NULLS NOT DISTINCT (house_id, date),
  CONSTRAINT unique_competitor_date UNIQUE NULLS NOT DISTINCT (competitor_property_id, date)
);

-- Performance-Indizes
CREATE INDEX IF NOT EXISTS idx_daily_pricing_date ON daily_pricing(date);
CREATE INDEX IF NOT EXISTS idx_daily_pricing_house ON daily_pricing(house_id) WHERE house_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_pricing_competitor ON daily_pricing(competitor_property_id) WHERE competitor_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_pricing_source ON daily_pricing(source);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_daily_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_daily_pricing_updated_at ON daily_pricing;
CREATE TRIGGER trigger_daily_pricing_updated_at
BEFORE UPDATE ON daily_pricing
FOR EACH ROW
EXECUTE FUNCTION update_daily_pricing_updated_at();

-- ========================================
-- 3. PRICE_SCRAPING_CONFIG
-- ========================================
CREATE TABLE IF NOT EXISTS price_scraping_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_property_id UUID REFERENCES competitor_properties(id) ON DELETE CASCADE NOT NULL,
  scraping_method TEXT DEFAULT 'perplexity' CHECK (scraping_method IN ('perplexity', 'api', 'manual')),
  scraping_frequency TEXT DEFAULT 'daily' CHECK (scraping_frequency IN ('daily', 'weekly', 'monthly')),
  last_scraped_at TIMESTAMPTZ,
  next_scrape_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  scraping_params JSONB DEFAULT '{}'::jsonb,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_scraping_config_competitor ON price_scraping_config(competitor_property_id);
CREATE INDEX IF NOT EXISTS idx_price_scraping_config_next_scrape ON price_scraping_config(next_scrape_at) WHERE is_active = true;

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_price_scraping_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_price_scraping_config_updated_at ON price_scraping_config;
CREATE TRIGGER trigger_price_scraping_config_updated_at
BEFORE UPDATE ON price_scraping_config
FOR EACH ROW
EXECUTE FUNCTION update_price_scraping_config_updated_at();

-- ========================================
-- 4. PRICE_COMPARISON_ALERTS
-- ========================================
CREATE TABLE IF NOT EXISTS price_comparison_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('underpriced', 'overpriced', 'competitive_change', 'missing_data')),
  threshold_percentage NUMERIC DEFAULT 10.0 CHECK (threshold_percentage >= 0 AND threshold_percentage <= 100),
  date_range_start DATE,
  date_range_end DATE,
  message TEXT,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_comparison_alerts_house ON price_comparison_alerts(house_id);
CREATE INDEX IF NOT EXISTS idx_price_comparison_alerts_active ON price_comparison_alerts(is_active);

-- ========================================
-- Phase 2: Historische Daten Migration
-- ========================================

-- Migriere Buchungspreise für Venedigersiedlung
INSERT INTO daily_pricing (house_id, date, price, currency, min_stay, is_available, source, created_at)
SELECT 
  b.house_id,
  d.date::DATE,
  ROUND((b.booking_amount / NULLIF(EXTRACT(DAY FROM (b.check_out - b.check_in)), 0))::NUMERIC, 2) as daily_price,
  COALESCE(b.currency, 'EUR'),
  EXTRACT(DAY FROM (b.check_out - b.check_in))::INTEGER as min_stay,
  true as is_available,
  'historical' as source,
  b.created_at
FROM bookings b
CROSS JOIN LATERAL generate_series(
  b.check_in::DATE,
  (b.check_out - INTERVAL '1 day')::DATE,
  INTERVAL '1 day'
) as d(date)
WHERE b.house_id = 'f5b4588b-96cf-46f7-b84a-5f6750f7088e'
  AND b.status IN ('confirmed', 'checked_in', 'completed')
  AND b.booking_amount IS NOT NULL
  AND b.booking_amount > 0
ON CONFLICT (house_id, date) DO NOTHING;