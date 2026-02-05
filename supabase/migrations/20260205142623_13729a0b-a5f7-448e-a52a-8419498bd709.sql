-- Datenkorrektur: Anonyme Session mit Buchung verknüpfen
UPDATE guest_app_sessions
SET 
  booking_id = '6566bff6-d6bd-4beb-9f68-eb21e2242459',
  guest_name = 'Oliver Grandt',
  guest_email = 'Vicielisa97@icloud.com',
  updated_at = now()
WHERE session_id = 'guest-1769938619117-guchy7x';