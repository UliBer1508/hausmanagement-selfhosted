-- 1. "manual" auf "direct" ändern
UPDATE bookings
SET platform = 'direct'
WHERE platform = 'manual';

-- 2. Alle NULL-Plattformen auf 'unknown' setzen für Konsistenz
UPDATE bookings
SET platform = 'unknown'
WHERE platform IS NULL;