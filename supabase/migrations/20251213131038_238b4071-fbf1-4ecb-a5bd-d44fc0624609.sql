-- Add columns for adults and children count
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS number_of_adults INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS number_of_children INTEGER DEFAULT NULL;

-- Migrate existing data: all guests become adults, 0 children
UPDATE bookings 
SET number_of_adults = number_of_guests, 
    number_of_children = 0 
WHERE number_of_adults IS NULL;