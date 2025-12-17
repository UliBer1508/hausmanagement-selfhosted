-- Add external rating fields to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS external_rating NUMERIC(3,1);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS normalized_rating NUMERIC(3,1);

-- Add comments for documentation
COMMENT ON COLUMN public.bookings.external_rating IS 'Original rating from booking platform (e.g., 4.5 for Airbnb 5-star, 8.5 for Booking.com 10-point)';
COMMENT ON COLUMN public.bookings.normalized_rating IS 'Rating normalized to 0-10 scale for consistent comparison across platforms';