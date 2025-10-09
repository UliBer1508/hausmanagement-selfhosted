-- Add cancellation documentation fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS cancellation_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancellation_reason text,
ADD COLUMN IF NOT EXISTS cancelled_by text;