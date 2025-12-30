
-- Verbesserte Gast-Erkennung mit Multi-Kriterien-Matching
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
      email = COALESCE(NULLIF(NEW.guest_email, ''), email),
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

  -- PRIORITÄT 1: Exakter Match (Name + Email)
  IF NEW.guest_email IS NOT NULL AND NEW.guest_email != '' THEN
    SELECT id INTO found_guest_id
    FROM public.guests
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.guest_name))
      AND LOWER(TRIM(email)) = LOWER(TRIM(NEW.guest_email))
    LIMIT 1;
  END IF;

  -- PRIORITÄT 2: Name + Telefonnummer
  IF found_guest_id IS NULL AND NEW.guest_phone IS NOT NULL AND NEW.guest_phone != '' THEN
    SELECT id INTO found_guest_id
    FROM public.guests
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.guest_name))
      AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') = 
          REPLACE(REPLACE(REPLACE(NEW.guest_phone, ' ', ''), '-', ''), '+', '')
    LIMIT 1;
  END IF;

  -- PRIORITÄT 3: Name + Nationalität + Stadt
  IF found_guest_id IS NULL 
     AND NEW.nationality IS NOT NULL 
     AND NEW.guest_city IS NOT NULL AND NEW.guest_city != '' THEN
    SELECT id INTO found_guest_id
    FROM public.guests
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.guest_name))
      AND UPPER(nationality) = UPPER(NEW.nationality)
      AND LOWER(TRIM(city)) = LOWER(TRIM(NEW.guest_city))
    LIMIT 1;
  END IF;

  -- PRIORITÄT 4: Name + Geburtsdatum
  IF found_guest_id IS NULL AND NEW.guest_birth_date IS NOT NULL THEN
    SELECT id INTO found_guest_id
    FROM public.guests
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.guest_name))
      AND birth_date = NEW.guest_birth_date
    LIMIT 1;
  END IF;

  -- PRIORITÄT 5: Name + seltene Nationalität (nicht DE, AT, CH - DACH-Region)
  IF found_guest_id IS NULL 
     AND NEW.nationality IS NOT NULL 
     AND UPPER(NEW.nationality) NOT IN ('DE', 'AT', 'CH') THEN
    SELECT id INTO found_guest_id
    FROM public.guests
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.guest_name))
      AND UPPER(nationality) = UPPER(NEW.nationality)
    ORDER BY 
      CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1;
  END IF;

  -- Gast gefunden: Verknüpfen und Daten ergänzen
  IF found_guest_id IS NOT NULL THEN
    NEW.guest_id := found_guest_id;
    
    UPDATE public.guests SET
      email = COALESCE(NULLIF(NEW.guest_email, ''), email),
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
$function$;

-- Bereinigung: Alle Bernd Wagner Buchungen auf den Haupteintrag umleiten
UPDATE bookings 
SET guest_id = '387c21b8-cc62-43c2-ade6-a277450c9f20'
WHERE LOWER(TRIM(guest_name)) = LOWER('Bernd Wagner')
  AND (guest_id IS NULL OR guest_id != '387c21b8-cc62-43c2-ade6-a277450c9f20');

-- Verwaiste Gast-Einträge löschen (nur Bernd Wagner Duplikate)
DELETE FROM guests 
WHERE LOWER(TRIM(name)) = LOWER('Bernd Wagner')
  AND id != '387c21b8-cc62-43c2-ade6-a277450c9f20'
  AND id NOT IN (SELECT DISTINCT guest_id FROM bookings WHERE guest_id IS NOT NULL);
