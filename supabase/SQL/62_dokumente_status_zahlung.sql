-- ============================================================
-- 62_dokumente_status_zahlung.sql
-- Dokumente: Erledigt-Status (Zahlung / Buchung erfasst)
-- ============================================================
--
-- Stand 01.10.2026. Baut auf 51, 52 und 61 auf. Idempotent.
-- Ausfuehren im Supabase SQL-Editor — VOR dem Frontend: useDocuments()
-- laedt die neuen Spalten; fehlen sie, bricht die Dokumentliste ab.
--
-- ANLASS (Uli, 01.10.2026): In der Dokumentliste ist nicht zu sehen,
-- ob eine Rechnung bezahlt ist oder ob die Buchung zu einer Buchungs-
-- unterlage im System steht. Boris-Rechnungen liessen sich nirgends auf
-- „bezahlt" setzen; Rechnungen ohne Rechnungsdatensatz (Gemeinde,
-- Booking.com) hatten gar keinen Zahlungsstatus.
--
-- MODELL:
--   document_types.pruefung   'zahlung' | 'buchung' | 'keine'
--   documents.zahlart         'einzug' (wird abgebucht) | 'ueberweisung'
--   documents.betrag / faellig_am / bezahlt_am
--   documents.referenz        Buchungs- oder Rechnungsnummer
--   zahlart_standard          an Vendor, Portal, Dienstleister — wird beim
--                             Ablegen vorbelegt
--
-- EINE WAHRHEIT FUER PROVIDER-RECHNUNGEN: Ist ein Dokument mit
-- laundry_invoices (Teuni) oder cleaning_invoices (Boris) verknuepft,
-- gilt DEREN status/bezahlt_am. Die Felder am Dokument werden dann nicht
-- benutzt — sonst koennte das Provider-Portal „bezahlt" zeigen und die
-- Dokumentliste „offen".

-- ------------------------------------------------------------
-- (1) Pruefart je Dokumenttyp
-- ------------------------------------------------------------

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS pruefung text NOT NULL DEFAULT 'keine';

ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_pruefung_check;
ALTER TABLE public.document_types
  ADD CONSTRAINT document_types_pruefung_check
  CHECK (pruefung IN ('keine', 'zahlung', 'buchung'));

COMMENT ON COLUMN public.document_types.pruefung IS
  'Was zu einem Dokument dieses Typs „erledigt" bedeutet: zahlung = bezahlt, buchung = Buchung steht im System, keine = nichts zu tun. In der Oberflaeche unter Dokumente -> Einstellungen -> Dokumenttypen aenderbar.';

-- Vorbelegung nach Namen, nur solange noch nichts gesetzt ist.
-- Ergebnis steht unten in der Kontrolle (a) und ist in den Einstellungen
-- korrigierbar.
UPDATE public.document_types SET pruefung = 'zahlung'
WHERE pruefung = 'keine'
  AND (name ILIKE '%rechnung%' OR name ILIKE '%abgabe%' OR name ILIKE '%gebühr%');

UPDATE public.document_types SET pruefung = 'buchung'
WHERE pruefung = 'keine'
  AND (name ILIKE 'buchung%' OR name ILIKE '%buchungsbest%');

-- ------------------------------------------------------------
-- (2) Zahlungs- und Referenzfelder am Dokument
-- ------------------------------------------------------------

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS referenz   text,
  ADD COLUMN IF NOT EXISTS zahlart    text,
  ADD COLUMN IF NOT EXISTS betrag     numeric(12,2),
  ADD COLUMN IF NOT EXISTS faellig_am date,
  ADD COLUMN IF NOT EXISTS bezahlt_am date;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_zahlart_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_zahlart_check
  CHECK (zahlart IS NULL OR zahlart IN ('einzug', 'ueberweisung'));

CREATE INDEX IF NOT EXISTS documents_referenz_idx ON public.documents (lower(referenz));

COMMENT ON COLUMN public.documents.referenz IS
  'Buchungs- oder Rechnungsnummer aus dem Dokument. Bei Buchungsunterlagen der Abgleich gegen bookings.external_booking_id.';
COMMENT ON COLUMN public.documents.zahlart IS
  'einzug = wird abgebucht (zaehlt nicht als offen), ueberweisung = Uli zahlt selbst. Nur fuer Dokumente OHNE verknuepfte Provider-Rechnung.';
COMMENT ON COLUMN public.documents.bezahlt_am IS
  'Bezahlt-Datum fuer Dokumente OHNE verknuepfte Provider-Rechnung. Bei Teuni/Boris gilt laundry_invoices/cleaning_invoices.bezahlt_am.';

-- ------------------------------------------------------------
-- (3) Standard-Zahlart je Absender
-- ------------------------------------------------------------

ALTER TABLE public.document_vendors   ADD COLUMN IF NOT EXISTS zahlart_standard text;
ALTER TABLE public.booking_portals    ADD COLUMN IF NOT EXISTS zahlart_standard text;
ALTER TABLE public.service_providers  ADD COLUMN IF NOT EXISTS zahlart_standard text;

ALTER TABLE public.document_vendors  DROP CONSTRAINT IF EXISTS document_vendors_zahlart_standard_check;
ALTER TABLE public.document_vendors  ADD  CONSTRAINT document_vendors_zahlart_standard_check
  CHECK (zahlart_standard IS NULL OR zahlart_standard IN ('einzug', 'ueberweisung'));
ALTER TABLE public.booking_portals   DROP CONSTRAINT IF EXISTS booking_portals_zahlart_standard_check;
ALTER TABLE public.booking_portals   ADD  CONSTRAINT booking_portals_zahlart_standard_check
  CHECK (zahlart_standard IS NULL OR zahlart_standard IN ('einzug', 'ueberweisung'));
ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS service_providers_zahlart_standard_check;
ALTER TABLE public.service_providers ADD  CONSTRAINT service_providers_zahlart_standard_check
  CHECK (zahlart_standard IS NULL OR zahlart_standard IN ('einzug', 'ueberweisung'));

-- ------------------------------------------------------------
-- (4) Bestand nachziehen
-- ------------------------------------------------------------

-- a) Buchungsnummer aus Belvilla-Dateinamen: booking-summary-1UWK1MG8.pdf
UPDATE public.documents
SET referenz = substring(file_name from '(?i)booking-summary-([A-Z0-9]+)')
WHERE referenz IS NULL
  AND file_name ~* 'booking-summary-[A-Z0-9]+';

-- b) Teuni-Rechnungen, die vor dem Rechnungsimport abgelegt wurden, mit
--    ihrem Rechnungsdatensatz verbinden: Dateiname beginnt mit der
--    Rechnungsnummer (RG-0059-20260331.pdf -> RG-0059). Nur eindeutige
--    Treffer; Teuni ist der einzige Waeschedienstleister mit laundry_invoices.
UPDATE public.documents d
SET laundry_invoice_id = li.id,
    referenz = coalesce(d.referenz, li.rechnungsnummer)
FROM public.laundry_invoices li
WHERE d.laundry_invoice_id IS NULL
  AND d.provider_id = 'd8110105-8ac9-45e3-ad32-aaf42393744c'
  AND d.file_name ~* ('^' || li.rechnungsnummer || '([^0-9]|$)')
  AND (SELECT count(*) FROM public.laundry_invoices x
       WHERE d.file_name ~* ('^' || x.rechnungsnummer || '([^0-9]|$)')) = 1;

-- ------------------------------------------------------------
-- (5) Vendoren „AirBnB" / „Booking.com" -> Buchungsportale
--     (Uli, 01.10.2026: Vendoren bleiben bestehen, werden nur deaktiviert;
--     ihre Dokumente bekommen das Portal zusaetzlich als Zuordnung.)
-- ------------------------------------------------------------

WITH paar AS (
  SELECT v.id AS vendor_id, p.id AS portal_id
  FROM public.document_vendors v
  JOIN public.booking_portals p
    ON p.key = CASE lower(v.name)
                 WHEN 'airbnb'      THEN 'airbnb'
                 WHEN 'booking.com' THEN 'booking.com'
                 WHEN 'booking'     THEN 'booking.com'
                 WHEN 'vrbo'        THEN 'vrbo'
               END
),
kandidaten AS (
  SELECT d.id AS document_id, paar.portal_id,
         coalesce((SELECT max(l.position) FROM public.document_links l WHERE l.document_id = d.id), 1) + 1 AS pos
  FROM public.documents d
  JOIN paar ON paar.vendor_id = d.vendor_id
  WHERE NOT EXISTS (SELECT 1 FROM public.document_links l
                    WHERE l.document_id = d.id AND l.entity_type = 'portal' AND l.entity_id = paar.portal_id)
)
INSERT INTO public.document_links (document_id, entity_type, entity_id, position)
SELECT document_id, 'portal', portal_id, pos FROM kandidaten WHERE pos <= 3;

-- Ablageorte des Vendors auch fuer das Portal merken (gleicher Ordner).
INSERT INTO public.document_locations (entity_type, entity_id, document_type_id, onedrive_item_id, onedrive_path)
SELECT 'portal', p.id, l.document_type_id, l.onedrive_item_id, l.onedrive_path
FROM public.document_locations l
JOIN public.document_vendors v ON v.id = l.entity_id AND l.entity_type = 'vendor'
JOIN public.booking_portals p ON p.key = CASE lower(v.name)
                 WHEN 'airbnb' THEN 'airbnb' WHEN 'booking.com' THEN 'booking.com'
                 WHEN 'booking' THEN 'booking.com' WHEN 'vrbo' THEN 'vrbo' END
ON CONFLICT (entity_type, entity_id, document_type_id) DO NOTHING;

UPDATE public.document_vendors SET is_active = false
WHERE lower(name) IN ('airbnb', 'booking.com', 'booking', 'vrbo') AND is_active;

-- ------------------------------------------------------------
-- (6) Kontrolle
-- ------------------------------------------------------------

-- a) Pruefart je Typ — bitte ansehen, in den Einstellungen korrigierbar
SELECT name, pruefung, is_active FROM public.document_types ORDER BY sort_order, name;

-- b) Nachgezogene Referenzen und Verknuepfungen
SELECT file_name, referenz, laundry_invoice_id IS NOT NULL AS mit_teuni_rechnung
FROM public.documents WHERE referenz IS NOT NULL ORDER BY created_at DESC;

-- c) Ehemalige Portal-Vendoren
SELECT v.name, v.is_active,
       (SELECT count(*) FROM public.documents d WHERE d.vendor_id = v.id) AS dokumente
FROM public.document_vendors v
WHERE lower(v.name) IN ('airbnb', 'booking.com', 'booking', 'vrbo');
