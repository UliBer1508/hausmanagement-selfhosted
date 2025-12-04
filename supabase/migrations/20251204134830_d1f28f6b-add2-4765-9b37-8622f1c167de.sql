-- Add payment_status column to bookings table
ALTER TABLE bookings 
ADD COLUMN payment_status TEXT DEFAULT 'pending' 
CHECK (payment_status IN ('pending', 'paid', 'partial'));