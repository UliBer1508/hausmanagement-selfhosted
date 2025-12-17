-- 1. Neue Gäste-Tabelle erstellen
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  street TEXT,
  city TEXT,
  postal_code TEXT,
  birth_date DATE,
  travel_document TEXT,
  nationality TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eindeutigkeits-Index auf Email (ignoriert NULL/leer)
CREATE UNIQUE INDEX guests_email_unique 
  ON public.guests(email) 
  WHERE email IS NOT NULL AND email != '';

-- updated_at Trigger
CREATE TRIGGER update_guests_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Gäste aus Buchungen extrahieren und deduplizieren
INSERT INTO public.guests (
  name, email, phone, street, city, postal_code, 
  birth_date, travel_document, nationality, notes
)
SELECT DISTINCT ON (guest_name, COALESCE(guest_email, ''))
  guest_name,
  NULLIF(guest_email, ''),
  guest_phone,
  guest_street,
  guest_city,
  guest_postal_code,
  guest_birth_date,
  guest_travel_document,
  nationality,
  guest_notes
FROM public.bookings
WHERE guest_name IS NOT NULL AND guest_name != ''
ORDER BY guest_name, COALESCE(guest_email, ''), updated_at DESC NULLS LAST;

-- 3. Fremdschlüssel-Spalte in bookings hinzufügen
ALTER TABLE public.bookings 
  ADD COLUMN guest_id UUID REFERENCES public.guests(id);

CREATE INDEX idx_bookings_guest_id ON public.bookings(guest_id);

-- 4. Verknüpfung zwischen bookings und guests herstellen
UPDATE public.bookings b
SET guest_id = g.id
FROM public.guests g
WHERE b.guest_name = g.name 
  AND (
    (b.guest_email = g.email) 
    OR (b.guest_email IS NULL AND g.email IS NULL)
    OR (b.guest_email = '' AND g.email IS NULL)
  );