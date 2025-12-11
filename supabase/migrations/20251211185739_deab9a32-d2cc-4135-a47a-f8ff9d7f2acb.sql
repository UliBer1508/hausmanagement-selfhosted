-- Add guest_contact_status column to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_contact_status TEXT DEFAULT 'pending'
CHECK (guest_contact_status IN ('pending', 'contacted', 'not_required'));

-- Add comment for documentation
COMMENT ON COLUMN bookings.guest_contact_status IS 
'Gäste-Kontakt-Status: pending=noch nicht kontaktiert, contacted=kontaktiert, not_required=nicht nötig';