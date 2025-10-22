-- Add period-based pricing fields to daily_pricing table
ALTER TABLE daily_pricing 
  ADD COLUMN period_total_price numeric,
  ADD COLUMN period_check_in date,
  ADD COLUMN period_check_out date,
  ADD COLUMN period_nights integer;

-- Add check constraint: if any period field is set, all must be set
ALTER TABLE daily_pricing
  ADD CONSTRAINT check_period_complete 
  CHECK (
    (period_total_price IS NULL AND period_check_in IS NULL AND period_check_out IS NULL AND period_nights IS NULL)
    OR
    (period_total_price IS NOT NULL AND period_check_in IS NOT NULL AND period_check_out IS NOT NULL AND period_nights IS NOT NULL)
  );

-- Add check: period_nights must match date difference
ALTER TABLE daily_pricing
  ADD CONSTRAINT check_period_nights_match
  CHECK (
    period_nights IS NULL 
    OR 
    period_nights = (period_check_out - period_check_in)
  );

-- Add index for period-based queries
CREATE INDEX idx_daily_pricing_period ON daily_pricing(competitor_property_id, period_check_in, period_check_out) 
WHERE period_total_price IS NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN daily_pricing.period_total_price IS 'Total price for entire stay period (if scraped as package). Daily price is calculated from this.';