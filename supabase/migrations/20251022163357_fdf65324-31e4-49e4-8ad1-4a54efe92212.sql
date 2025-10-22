-- Erweitere den source Check Constraint um alle verwendeten Werte
ALTER TABLE daily_pricing 
DROP CONSTRAINT IF EXISTS daily_pricing_source_check;

ALTER TABLE daily_pricing
ADD CONSTRAINT daily_pricing_source_check 
CHECK (source IN ('manual', 'scraped', 'expanded', 'historical'));