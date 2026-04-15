
-- PriceLabs Listings: Mapping zwischen lokalen Häusern und PriceLabs
CREATE TABLE public.pricelabs_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  pricelabs_listing_id TEXT NOT NULL,
  pms_name TEXT,
  listing_name TEXT,
  base_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  health_score TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(house_id, pricelabs_listing_id)
);

-- PriceLabs Market Data: Cache für Neighborhood-Daten
CREATE TABLE public.pricelabs_market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  pricelabs_listing_id TEXT NOT NULL,
  data_date DATE NOT NULL DEFAULT CURRENT_DATE,
  neighborhood_data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pricelabs_listings_house_id ON public.pricelabs_listings(house_id);
CREATE INDEX idx_pricelabs_market_data_house_id ON public.pricelabs_market_data(house_id);
CREATE INDEX idx_pricelabs_market_data_date ON public.pricelabs_market_data(data_date);

-- Updated_at triggers
CREATE TRIGGER update_pricelabs_listings_updated_at
  BEFORE UPDATE ON public.pricelabs_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pricelabs_market_data_updated_at
  BEFORE UPDATE ON public.pricelabs_market_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
