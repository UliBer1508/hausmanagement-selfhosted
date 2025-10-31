-- Drop existierende Tabelle falls vorhanden
DROP TABLE IF EXISTS public.monthly_pricing CASCADE;

-- Erstelle monthly_pricing Tabelle neu
CREATE TABLE public.monthly_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  competitor_property_id UUID REFERENCES public.competitor_properties(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  base_price_7nights NUMERIC,
  markup_percentage NUMERIC DEFAULT 0,
  final_price_7nights NUMERIC,
  currency TEXT DEFAULT 'EUR' NOT NULL,
  source TEXT DEFAULT 'scraped' NOT NULL,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Constraints separat hinzufügen
ALTER TABLE public.monthly_pricing 
  ADD CONSTRAINT monthly_pricing_check_house_or_competitor 
  CHECK (
    (house_id IS NOT NULL AND competitor_property_id IS NULL) OR
    (house_id IS NULL AND competitor_property_id IS NOT NULL)
  );

ALTER TABLE public.monthly_pricing 
  ADD CONSTRAINT monthly_pricing_check_dates 
  CHECK (check_out_date > check_in_date);

-- Unique Constraints
CREATE UNIQUE INDEX idx_monthly_pricing_house_unique 
  ON public.monthly_pricing(house_id, check_in_date) 
  WHERE house_id IS NOT NULL;
  
CREATE UNIQUE INDEX idx_monthly_pricing_competitor_unique 
  ON public.monthly_pricing(competitor_property_id, check_in_date) 
  WHERE competitor_property_id IS NOT NULL;

-- Weitere Indexes
CREATE INDEX idx_monthly_pricing_house_date 
  ON public.monthly_pricing(house_id, check_in_date) 
  WHERE house_id IS NOT NULL;
  
CREATE INDEX idx_monthly_pricing_competitor_date 
  ON public.monthly_pricing(competitor_property_id, check_in_date) 
  WHERE competitor_property_id IS NOT NULL;

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION public.update_monthly_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monthly_pricing_updated_at
  BEFORE UPDATE ON public.monthly_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_pricing_updated_at();