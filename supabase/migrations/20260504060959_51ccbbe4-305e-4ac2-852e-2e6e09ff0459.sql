
-- Drop old function (uses properties)
DROP FUNCTION IF EXISTS public.update_dynamic_price(uuid, date, numeric, jsonb, numeric, numeric, text);

-- Drop duplicate tables
DROP TABLE IF EXISTS public.nightly_rates CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;

-- Extend daily_pricing
ALTER TABLE public.daily_pricing
  ADD COLUMN IF NOT EXISTS dynamic_price    numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_price      numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_blocked       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_booked        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS booked_at        timestamptz,
  ADD COLUMN IF NOT EXISTS factor_season    numeric(5,3),
  ADD COLUMN IF NOT EXISTS factor_dow       numeric(5,3),
  ADD COLUMN IF NOT EXISTS factor_leadtime  numeric(5,3),
  ADD COLUMN IF NOT EXISTS factor_occupancy numeric(5,3),
  ADD COLUMN IF NOT EXISTS factor_event     numeric(5,3),
  ADD COLUMN IF NOT EXISTS factor_gap       numeric(5,3),
  ADD COLUMN IF NOT EXISTS market_occupancy numeric(5,3),
  ADD COLUMN IF NOT EXISTS market_avg_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS market_source    text;

-- Migrate pricing_logs: property_id -> house_id
ALTER TABLE public.pricing_logs DROP COLUMN IF EXISTS property_id;
ALTER TABLE public.pricing_logs
  ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES public.houses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS pricing_logs_house_date_idx ON public.pricing_logs(house_id, date);

-- Disable RLS (dev phase)
ALTER TABLE public.local_events      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_logs      DISABLE ROW LEVEL SECURITY;

-- New function: house_id based, writes to daily_pricing
CREATE OR REPLACE FUNCTION public.update_dynamic_price(
  p_house_id uuid,
  p_date date,
  p_dynamic_price numeric,
  p_factors jsonb,
  p_market_occupancy numeric DEFAULT NULL,
  p_market_avg_price numeric DEFAULT NULL,
  p_source text DEFAULT 'auto_daily'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_price numeric;
  v_base_price numeric;
BEGIN
  SELECT COALESCE(price, dynamic_price) INTO v_old_price
  FROM public.daily_pricing
  WHERE house_id = p_house_id AND date = p_date
  LIMIT 1;

  SELECT base_price INTO v_base_price FROM public.houses WHERE id = p_house_id;

  INSERT INTO public.daily_pricing (
    house_id, date, price, dynamic_price, currency, source,
    factor_season, factor_dow, factor_leadtime,
    factor_occupancy, factor_event, factor_gap,
    market_occupancy, market_avg_price, market_source, updated_at
  ) VALUES (
    p_house_id, p_date, p_dynamic_price, p_dynamic_price, 'EUR', p_source,
    (p_factors->>'seasonality')::numeric,
    (p_factors->>'dayOfWeek')::numeric,
    (p_factors->>'leadTime')::numeric,
    (p_factors->>'occupancy')::numeric,
    (p_factors->>'event')::numeric,
    (p_factors->>'gapDiscount')::numeric,
    p_market_occupancy, p_market_avg_price, p_source, now()
  )
  ON CONFLICT (house_id, date) DO UPDATE SET
    price            = EXCLUDED.price,
    dynamic_price    = EXCLUDED.dynamic_price,
    source           = EXCLUDED.source,
    factor_season    = EXCLUDED.factor_season,
    factor_dow       = EXCLUDED.factor_dow,
    factor_leadtime  = EXCLUDED.factor_leadtime,
    factor_occupancy = EXCLUDED.factor_occupancy,
    factor_event     = EXCLUDED.factor_event,
    factor_gap       = EXCLUDED.factor_gap,
    market_occupancy = EXCLUDED.market_occupancy,
    market_avg_price = EXCLUDED.market_avg_price,
    market_source    = EXCLUDED.market_source,
    updated_at       = now();

  IF v_old_price IS DISTINCT FROM p_dynamic_price THEN
    INSERT INTO public.pricing_logs (house_id, date, old_price, new_price, trigger)
    VALUES (p_house_id, p_date, v_old_price, p_dynamic_price, p_source);
  END IF;
END;
$$;
