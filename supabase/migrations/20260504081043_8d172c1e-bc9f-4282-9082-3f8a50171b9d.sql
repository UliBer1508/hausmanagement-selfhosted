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
BEGIN
  SELECT COALESCE(price, dynamic_price) INTO v_old_price
  FROM public.daily_pricing
  WHERE house_id = p_house_id AND date = p_date
  LIMIT 1;

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
  ON CONFLICT (house_id, date) WHERE house_id IS NOT NULL DO UPDATE SET
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