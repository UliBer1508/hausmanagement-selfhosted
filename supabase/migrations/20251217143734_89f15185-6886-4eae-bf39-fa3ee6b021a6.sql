-- Funktion die bei INSERT/UPDATE auf bookings aufgerufen wird
CREATE OR REPLACE FUNCTION sync_guest_from_booking()
RETURNS TRIGGER AS $$
DECLARE
  found_guest_id UUID;
BEGIN
  -- Nur wenn guest_name vorhanden
  IF NEW.guest_name IS NULL OR NEW.guest_name = '' THEN
    RETURN NEW;
  END IF;

  -- Suche existierenden Gast (Name + Email Match)
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
    -- Gast gefunden → verknüpfen
    NEW.guest_id := found_guest_id;
    
    -- Gast-Daten aktualisieren falls vollständiger in neuer Buchung
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
    -- Neuen Gast erstellen
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
$$ LANGUAGE plpgsql;

-- Trigger auf bookings Tabelle
CREATE TRIGGER sync_booking_guest_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION sync_guest_from_booking();