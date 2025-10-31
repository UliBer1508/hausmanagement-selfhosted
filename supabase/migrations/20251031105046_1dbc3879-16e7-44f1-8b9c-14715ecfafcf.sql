-- Lösche monthly_pricing Tabelle falls sie existiert (mit CASCADE für alle Abhängigkeiten)
DROP TABLE IF EXISTS public.monthly_pricing CASCADE;

-- Erstelle monthly_pricing Tabelle neu für monatliche Preisdaten (15. des Monats)
CREATE TABLE public.monthly_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  competitor_property_id UUID REFERENCES public.competitor_properties(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  base_price_7nights NUMERIC,
  markup_percentage NUMERIC DEFAULT 0,
  final_price_7nights NUMERIC,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT NOT NULL DEFAULT 'scraped',
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Constraints
ALTER TABLE public.monthly_pricing
  ADD CONSTRAINT monthly_pricing_check_owner CHECK (
    (house_id IS NOT NULL AND competitor_property_id IS NULL) OR
    (house_id IS NULL AND competitor_property_id IS NOT NULL)
  );

ALTER TABLE public.monthly_pricing
  ADD CONSTRAINT monthly_pricing_check_dates CHECK (check_out_date > check_in_date);

-- Unique Indizes
CREATE UNIQUE INDEX idx_monthly_pricing_house_checkin 
  ON public.monthly_pricing(house_id, check_in_date) 
  WHERE house_id IS NOT NULL;

CREATE UNIQUE INDEX idx_monthly_pricing_competitor_checkin 
  ON public.monthly_pricing(competitor_property_id, check_in_date) 
  WHERE competitor_property_id IS NOT NULL;

-- Performance Indizes
CREATE INDEX idx_monthly_pricing_house_date 
  ON public.monthly_pricing(house_id, check_in_date);
  
CREATE INDEX idx_monthly_pricing_competitor_date 
  ON public.monthly_pricing(competitor_property_id, check_in_date);

CREATE INDEX idx_monthly_pricing_check_in_date
  ON public.monthly_pricing(check_in_date);

-- Trigger Funktion für updated_at
CREATE OR REPLACE FUNCTION public.update_monthly_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER monthly_pricing_updated_at
  BEFORE UPDATE ON public.monthly_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_pricing_updated_at();

-- Kommentar
COMMENT ON TABLE public.monthly_pricing IS 'Monatliche Preise für eigene Häuser und Wettbewerber (immer am 15. des Monats für 7 Nächte)';