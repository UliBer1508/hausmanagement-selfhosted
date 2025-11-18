-- Schritt 1: Verknüpfte guest_preference_responses löschen
DELETE FROM guest_preference_responses
WHERE booking_id = '47d69345-fde4-4471-8e8b-e583566721fe';

-- Schritt 2: Fehlerhafte Buchung löschen (31.08.2026 - 07.09.2026)
DELETE FROM bookings
WHERE id = '47d69345-fde4-4471-8e8b-e583566721fe';

-- Schritt 3: Neue Buchung für Michael Scheffer erstellen (23.02.2025 - 28.02.2025)
INSERT INTO bookings (
  house_id,
  guest_name,
  guest_email,
  guest_phone,
  check_in,
  check_out,
  number_of_guests,
  booking_amount,
  currency,
  platform,
  status,
  created_at,
  updated_at
) VALUES (
  'a2b4d1f7-f396-40a5-b83f-174ccafa55fd',  -- Chalet Venedigersiedlung
  'Michael Scheffer',
  'mschef.135407@guest.booking.com',
  '+49 174 5382053',
  '2025-02-23 15:00:00+00',
  '2025-02-28 10:00:00+00',
  2,
  2731.00,
  'EUR',
  'booking.com',
  'completed',
  NOW(),
  NOW()
);