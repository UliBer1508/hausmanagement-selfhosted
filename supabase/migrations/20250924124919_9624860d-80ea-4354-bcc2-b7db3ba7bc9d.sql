-- Add nationality field to bookings table
ALTER TABLE public.bookings 
ADD COLUMN nationality VARCHAR(100);