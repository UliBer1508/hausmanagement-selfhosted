-- Remove the trigger first, then the functions
DROP TRIGGER IF EXISTS booking_cleaning_suggestion ON bookings;
DROP FUNCTION IF EXISTS public.trigger_cleaning_suggestion();
DROP FUNCTION IF EXISTS public.create_cleaning_suggestions();