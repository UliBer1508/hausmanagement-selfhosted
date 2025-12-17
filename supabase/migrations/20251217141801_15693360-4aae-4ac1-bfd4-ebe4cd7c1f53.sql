-- Add rating_not_expected column to bookings table
ALTER TABLE bookings 
ADD COLUMN rating_not_expected boolean DEFAULT false;