-- Bewertungs-Felder zu competitor_properties hinzufügen
ALTER TABLE competitor_properties 
ADD COLUMN IF NOT EXISTS rating NUMERIC CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0 CHECK (review_count >= 0),
ADD COLUMN IF NOT EXISTS normalized_rating NUMERIC CHECK (normalized_rating IS NULL OR (normalized_rating >= 0 AND normalized_rating <= 10));

-- Index für schnelle Bewertungs-Abfragen
CREATE INDEX IF NOT EXISTS idx_competitor_properties_rating 
ON competitor_properties(normalized_rating DESC NULLS LAST) 
WHERE is_active = true;

-- Kommentare für bessere Dokumentation
COMMENT ON COLUMN competitor_properties.rating IS 'Original-Bewertung von der Plattform (Booking: 0-10, Airbnb: 0-5)';
COMMENT ON COLUMN competitor_properties.review_count IS 'Anzahl der Bewertungen';
COMMENT ON COLUMN competitor_properties.normalized_rating IS 'Normalisierte Bewertung auf Skala 0-10 für plattformübergreifende Vergleiche';