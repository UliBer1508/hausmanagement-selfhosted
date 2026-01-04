-- Schritt 1: Aktualisiere alle Buchungen mit Duplikat-IDs auf den ältesten Gast
WITH target_guest AS (
  SELECT id FROM guests WHERE name = 'Mark Hoogland' ORDER BY created_at ASC LIMIT 1
),
duplicate_guests AS (
  SELECT id FROM guests WHERE name = 'Mark Hoogland' AND id != (SELECT id FROM target_guest)
)
UPDATE bookings
SET guest_id = (SELECT id FROM target_guest)
WHERE guest_id IN (SELECT id FROM duplicate_guests);

-- Schritt 2: Aktualisiere den Ziel-Gast mit der besten Telefonnummer
UPDATE guests
SET phone = '+31 683679930'
WHERE name = 'Mark Hoogland'
AND id = (SELECT id FROM guests WHERE name = 'Mark Hoogland' ORDER BY created_at ASC LIMIT 1);

-- Schritt 3: Lösche die Duplikate
DELETE FROM guests
WHERE name = 'Mark Hoogland'
AND id != (SELECT id FROM guests WHERE name = 'Mark Hoogland' ORDER BY created_at ASC LIMIT 1);