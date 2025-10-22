-- Füge is_expanded Feld zu daily_pricing hinzu für Post-Processing Tracking
ALTER TABLE daily_pricing 
ADD COLUMN IF NOT EXISTS is_expanded BOOLEAN DEFAULT FALSE;

-- Erstelle Index für effiziente Abfragen nach nicht-expandierten Gesamtpreisen
CREATE INDEX IF NOT EXISTS idx_daily_pricing_unexpanded 
ON daily_pricing (is_expanded) 
WHERE is_expanded = FALSE AND period_nights IS NOT NULL AND period_nights > 0;