-- Entferne den doppelten Foreign Key Constraint
-- Behalte bookings_guest_id_fkey (Standard-Namenskonvention)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_guest;