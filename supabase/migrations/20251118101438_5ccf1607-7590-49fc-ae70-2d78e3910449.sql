-- Korrektur: Zweite Buchung von Michael Scheffer zu Christian Mueller übertragen
UPDATE bookings
SET 
  guest_name = 'Christian Mueller',
  guest_email = 'cmuell.124832@guest.booking.com',
  guest_phone = '+49 1511 5754721',
  booking_amount = 3361.00,
  updated_at = NOW()
WHERE id = '565e41db-bded-4a5f-ae5c-1a6cf624588b';