-- Add new guest data columns to bookings table
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS guest_street TEXT,
  ADD COLUMN IF NOT EXISTS guest_city TEXT,
  ADD COLUMN IF NOT EXISTS guest_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS guest_birth_date DATE,
  ADD COLUMN IF NOT EXISTS guest_travel_document TEXT;

-- Add comments for documentation
COMMENT ON COLUMN bookings.guest_street IS 'Straßenadresse des Gastes';
COMMENT ON COLUMN bookings.guest_city IS 'Stadt/Ort des Gastes';
COMMENT ON COLUMN bookings.guest_postal_code IS 'Postleitzahl des Gastes';
COMMENT ON COLUMN bookings.guest_birth_date IS 'Geburtsdatum des Gastes';
COMMENT ON COLUMN bookings.guest_travel_document IS 'Reisedokument-Nummer des Gastes';