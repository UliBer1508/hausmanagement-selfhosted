-- Add guest_notes field to bookings table for storing guest preferences
ALTER TABLE public.bookings 
ADD COLUMN guest_notes TEXT;