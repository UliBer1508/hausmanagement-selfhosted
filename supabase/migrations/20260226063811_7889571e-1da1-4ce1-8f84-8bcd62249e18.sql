-- Lösche Test-Daten: Loveable Test-User und zugehörige Buchung

-- 1. App Review löschen (referenziert booking)
DELETE FROM app_reviews WHERE booking_id = '358dc9ca-9a9c-411b-8427-e266780537e7';

-- 2. Test-Buchung löschen
DELETE FROM bookings WHERE id = '358dc9ca-9a9c-411b-8427-e266780537e7';

-- 3. Test-Guest löschen
DELETE FROM guests WHERE id = 'cf76c1d9-9b81-4ccd-9b5f-4dd3d26599c1';