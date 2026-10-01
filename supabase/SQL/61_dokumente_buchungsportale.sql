-- ============================================================
-- 61_dokumente_buchungsportale.sql
-- Dokumente: Buchungsportal als eigene Zuordnungsart
-- ============================================================
--
-- Stand 01.10.2026. Baut auf 51_ und 52_ auf. Idempotent.
-- Ausfuehren im Supabase SQL-Editor — VOR dem Einspielen des Frontends:
-- useDocuments() laedt documents.portal_id; fehlt die Spalte, bricht
-- die Dokumentliste ab.
--
-- ANLASS (01.10.2026): Eine Belvilla-Buchungsuebersicht (1FYTQE8D) liess
-- sich keinem Belvilla-Objekt zuordnen — es gab keine Zuordnungsart dafuer.
-- Vendor (document_vendors) waere fachlich falsch: dort stehen
-- Rechnungsabsender wie Gemeinde und Energieversorger.
--
-- WARUM EINE TABELLE und nicht nur der Text 'belvilla':
-- document_locations.entity_id und document_links.entity_id sind uuid.
-- Ein Portal braucht also eine Kennung, damit es einen eigenen Ablageort
-- und eine 2./3. Zuordnung haben kann — genau wie ein Vendor.
--
-- `key` ist derselbe Wert wie bookings.platform (belvilla, airbnb,
-- booking.com, vrbo). Darueber findet die Ablage das Haus: Wald Chalet
-- hat nur Belvilla-Buchungen, also gehoert ein Belvilla-Dokument dorthin.
-- Die Liste ist bewusst kurz und fest: Direktbuchungen haben keinen
-- Absender, der auf einem Dokument steht.

-- ------------------------------------------------------------
-- (1) booking_portals
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_portals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                text NOT NULL,
  name               text NOT NULL,
  dokument_begriffe  text[] NOT NULL DEFAULT '{}',
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_portals_key_key
  ON public.booking_portals (key);

COMMENT ON TABLE public.booking_portals IS
  'Buchungsportale als Zuordnungsobjekt fuer Dokumente. key = Wert in bookings.platform. dokument_begriffe = woran das Portal auf SEINEN Dokumenten erkennbar ist (Firmenname, Domain).';

INSERT INTO public.booking_portals (key, name, dokument_begriffe, sort_order) VALUES
  ('belvilla',    'Belvilla',    ARRAY['belvilla'],                 10),
  ('airbnb',      'Airbnb',      ARRAY['airbnb'],                   20),
  ('booking.com', 'Booking.com', ARRAY['booking.com'],              30),
  ('vrbo',        'VRBO',        ARRAY['vrbo'],                     40)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.booking_portals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage booking_portals" ON public.booking_portals;
CREATE POLICY "Admins manage booking_portals" ON public.booking_portals
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- GRANTs (Pflicht ab 30.10.2026, PROJEKT-REGELN). Kein anon: interne Stammdaten.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_portals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_portals TO service_role;

DROP TRIGGER IF EXISTS booking_portals_touch ON public.booking_portals;
CREATE TRIGGER booking_portals_touch BEFORE UPDATE ON public.booking_portals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- (2) documents.portal_id — Portal als 1. Zuordnung
-- ------------------------------------------------------------

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS portal_id uuid REFERENCES public.booking_portals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_portal_idx ON public.documents (portal_id);

COMMENT ON COLUMN public.documents.portal_id IS
  'Bezug auf ein Buchungsportal (booking_portals) — z. B. Belvilla-Buchungsuebersicht oder -Abrechnung.';

-- ------------------------------------------------------------
-- (3) Ablageort und Zusatzzuordnung duerfen 'portal' verwenden
-- ------------------------------------------------------------

ALTER TABLE public.document_locations
  DROP CONSTRAINT IF EXISTS document_locations_entity_type_check;
ALTER TABLE public.document_locations
  ADD CONSTRAINT document_locations_entity_type_check
  CHECK (entity_type IN ('haus','provider','vendor','portal','buchung','reinigung','waesche'));

-- document_links steht in keiner SQL-Datei im Repo (Anlage unbekannt).
-- Falls dort ein CHECK auf entity_type existiert, wuerde er 'portal'
-- abweisen — der Fehler kaeme nur als console.error (zusatzSchreiben),
-- die 2./3. Zuordnung fehlte still. Deshalb: vorhandene CHECKs auf
-- entity_type entfernen und mit vollstaendiger Liste neu anlegen.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.document_links'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.document_links DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.document_links
  ADD CONSTRAINT document_links_entity_type_check
  CHECK (entity_type IN ('haus','provider','vendor','portal','buchung','reinigung','waesche'));

-- ------------------------------------------------------------
-- (4) Kontrolle
-- ------------------------------------------------------------

-- a) Die vier Portale
SELECT key, name, dokument_begriffe FROM public.booking_portals ORDER BY sort_order;

-- b) Welches Haus hat Buchungen auf welchem Portal? Daraus leitet die
--    Ablage das Haus ab. Erwartet: Wald Chalet nur bei belvilla.
SELECT b.platform, h.name AS haus, count(*) AS buchungen
FROM public.bookings b
JOIN public.houses h ON h.id = b.house_id
WHERE b.platform IN (SELECT key FROM public.booking_portals)
GROUP BY b.platform, h.name
ORDER BY b.platform, h.name;
