-- Create monthly_pricing table for 7-night price comparisons
CREATE TABLE IF NOT EXISTS public.monthly_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  competitor_property_id UUID REFERENCES public.competitor_properties(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  base_price_7nights NUMERIC NOT NULL,
  final_price_7nights NUMERIC,
  currency TEXT NOT NULL DEFAULT 'EUR',
  source TEXT NOT NULL DEFAULT 'manual',
  scraped_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: Either house_id OR competitor_property_id must be set, not both
  CONSTRAINT check_single_owner CHECK (
    (house_id IS NOT NULL AND competitor_property_id IS NULL) OR
    (house_id IS NULL AND competitor_property_id IS NOT NULL)
  ),
  
  -- Unique constraint for house prices (one price per check-in date per house)
  CONSTRAINT unique_house_checkin UNIQUE (house_id, check_in_date),
  
  -- Unique constraint for competitor prices (one price per check-in date per competitor)
  CONSTRAINT unique_competitor_checkin UNIQUE (competitor_property_id, check_in_date)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_house ON public.monthly_pricing(house_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_competitor ON public.monthly_pricing(competitor_property_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_date_range ON public.monthly_pricing(check_in_date, check_out_date);

-- Enable RLS (currently disabled during development as per requirements)
ALTER TABLE public.monthly_pricing ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations during development
CREATE POLICY "Allow all operations during development" ON public.monthly_pricing
  FOR ALL USING (true) WITH CHECK (true);