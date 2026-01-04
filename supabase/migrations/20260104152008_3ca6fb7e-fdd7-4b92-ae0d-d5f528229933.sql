-- 1. Alle Buchungen auf den ältesten Gast (d1be2d76...) umverknüpfen
UPDATE bookings
SET guest_id = 'd1be2d76-c410-41dd-bdd7-a0f251ad6d22'
WHERE guest_id IN (
  'e952d386-ffb4-45c3-babd-cc1eb5249f46',
  '18d4a3ab-c4b1-4316-b9a1-bf532ccf1acd',
  '56e31626-0328-4fa0-acae-9889c0a0809c',
  '14f8f0e8-9356-4f2d-8b46-1bad69d695a0',
  '79714d11-d272-4689-b684-b8a256cd8660',
  '312a5852-4f19-4452-a7c7-ff27c9772a0e'
);

-- 2. Korrigiere den Namen des verbleibenden Gastes auf die Umlaut-Variante
UPDATE guests
SET name = 'Nadine Schlüter'
WHERE id = 'd1be2d76-c410-41dd-bdd7-a0f251ad6d22';

-- 3. Lösche die Duplikate
DELETE FROM guests 
WHERE id IN (
  'e952d386-ffb4-45c3-babd-cc1eb5249f46',
  '18d4a3ab-c4b1-4316-b9a1-bf532ccf1acd',
  '56e31626-0328-4fa0-acae-9889c0a0809c',
  '14f8f0e8-9356-4f2d-8b46-1bad69d695a0',
  '79714d11-d272-4689-b684-b8a256cd8660',
  '312a5852-4f19-4452-a7c7-ff27c9772a0e'
);