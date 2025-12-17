-- Drop existing trigger first
DROP TRIGGER IF EXISTS sync_guest_on_booking_insert ON public.bookings;

-- Replace the function to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.sync_guest_from_booking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  found_guest_id UUID;
BEGIN
  -- Skip if no guest_name
  IF NEW.guest_name IS NULL OR NEW.guest_name = '' THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: Check if we already have a guest_id linked
  IF TG_OP = 'UPDATE' AND NEW.guest_id IS NOT NULL THEN
    -- Update the existing guest record with any new data from booking
    UPDATE public.guests SET
      name = NEW.guest_name,
      email = NULLIF(NEW.guest_email, ''),
      phone = COALESCE(NEW.guest_phone, phone),
      street = COALESCE(NEW.guest_street, street),
      city = COALESCE(NEW.guest_city, city),
      postal_code = COALESCE(NEW.guest_postal_code, postal_code),
      birth_date = COALESCE(NEW.guest_birth_date, birth_date),
      travel_document = COALESCE(NEW.guest_travel_document, travel_document),
      nationality = COALESCE(NEW.nationality, nationality),
      notes = COALESCE(NEW.guest_notes, notes),
      updated_at = now()
    WHERE id = NEW.guest_id;
    
    RETURN NEW;
  END IF;

  -- For INSERT or UPDATE without guest_id: Find or create guest
  SELECT id INTO found_guest_id
  FROM public.guests
  WHERE name = NEW.guest_name
    AND (
      (email = NEW.guest_email)
      OR (email IS NULL AND (NEW.guest_email IS NULL OR NEW.guest_email = ''))
      OR (NEW.guest_email IS NULL AND email IS NULL)
    )
  LIMIT 1;

  IF found_guest_id IS NOT NULL THEN
    -- Guest found → link and update
    NEW.guest_id := found_guest_id;
    
    UPDATE public.guests SET
      phone = COALESCE(NEW.guest_phone, phone),
      street = COALESCE(NEW.guest_street, street),
      city = COALESCE(NEW.guest_city, city),
      postal_code = COALESCE(NEW.guest_postal_code, postal_code),
      birth_date = COALESCE(NEW.guest_birth_date, birth_date),
      travel_document = COALESCE(NEW.guest_travel_document, travel_document),
      nationality = COALESCE(NEW.nationality, nationality),
      notes = COALESCE(NEW.guest_notes, notes),
      updated_at = now()
    WHERE id = found_guest_id;
  ELSE
    -- Create new guest
    INSERT INTO public.guests (
      name, email, phone, street, city, postal_code,
      birth_date, travel_document, nationality, notes
    ) VALUES (
      NEW.guest_name,
      NULLIF(NEW.guest_email, ''),
      NEW.guest_phone,
      NEW.guest_street,
      NEW.guest_city,
      NEW.guest_postal_code,
      NEW.guest_birth_date,
      NEW.guest_travel_document,
      NEW.nationality,
      NEW.guest_notes
    )
    RETURNING id INTO NEW.guest_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger for both INSERT and UPDATE
CREATE TRIGGER sync_guest_on_booking_change
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_guest_from_booking();