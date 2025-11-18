-- Korrektur: Buchung von Michael Scheffer zu Christian Mueller übertragen
UPDATE bookings
SET 
  guest_name = 'Christian Mueller',
  guest_email = 'cmuell.124832@guest.booking.com',
  updated_at = NOW()
WHERE id = '52913961-eecb-4189-b13e-b28f5c21bf94';