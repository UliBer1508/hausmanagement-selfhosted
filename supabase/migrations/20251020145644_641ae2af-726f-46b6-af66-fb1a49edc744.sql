-- Bewertungs-Felder für eigene Häuser hinzufügen
ALTER TABLE houses
ADD COLUMN IF NOT EXISTS own_rating NUMERIC CHECK (own_rating IS NULL OR (own_rating >= 0 AND own_rating <= 10)),
ADD COLUMN IF NOT EXISTS own_review_count INTEGER DEFAULT 0 CHECK (own_review_count >= 0),
ADD COLUMN IF NOT EXISTS own_rating_platform TEXT DEFAULT 'booking.com';

-- Kommentare für Dokumentation
COMMENT ON COLUMN houses.own_rating IS 'Eigene Bewertung (Booking.com: 0-10 Skala)';
COMMENT ON COLUMN houses.own_review_count IS 'Anzahl der eigenen Bewertungen';
COMMENT ON COLUMN houses.own_rating_platform IS 'Plattform der Bewertung (booking.com, airbnb, etc.)';