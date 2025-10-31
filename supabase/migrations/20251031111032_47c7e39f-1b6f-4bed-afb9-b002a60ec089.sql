-- Add UNIQUE constraints to monthly_pricing table for upsert functionality

-- Add unique constraint for house prices (one price per check-in date per house)
ALTER TABLE public.monthly_pricing 
  ADD CONSTRAINT unique_house_checkin UNIQUE (house_id, check_in_date);

-- Add unique constraint for competitor prices (one price per check-in date per competitor)
ALTER TABLE public.monthly_pricing 
  ADD CONSTRAINT unique_competitor_checkin UNIQUE (competitor_property_id, check_in_date);

-- Create indexes for faster queries if they don't exist
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_house ON public.monthly_pricing(house_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_competitor ON public.monthly_pricing(competitor_property_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_monthly_pricing_date_range ON public.monthly_pricing(check_in_date, check_out_date);