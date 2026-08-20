-- ============================================================
-- 52_dokumente_ablageorte.sql
-- Dokumente: Ablageorte, Absender, freie Zuordnung
-- ============================================================
--
-- Stand 20.08.2026. Baut auf 51_dokumentenverwaltung.sql auf.
--
-- ANLASS — vier Befunde aus dem echten Betrieb:
--
-- (1) Rechnungen kommen von Absendern, die KEINE service_providers sind:
--     Gemeinde Neukirchen (Kurtaxe), Salzburg AG, Handwerker, Anwalt.
--     Diese in service_providers anzulegen wuerde die Tabelle verbiegen —
--     dort stehen Amela, Boris und Teuni mit Portalzugang, Abrechnungsart
--     und Auftraegen.  -> eigene Tabelle document_vendors.
--
-- (2) Sammelrechnungen gehoeren an den DIENSTLEISTER, nicht an einen
--     einzelnen Auftrag. Boris' Rechnung 002048/2026 fuehrt fuenf
--     Reinigungen in zwei Haeusern ueber zwei Monate.
--     -> provider_id an documents.
--
-- (3) Der Dokumenttyp darf die Zuordnung nicht erzwingen. Dieselbe
--     Reinigungsrechnung haengt einmal an einem service_task
--     (Fensterputzen) und einmal an Boris (Sammelrechnung).
--     -> document_types.link_target entfaellt.
--
-- (4) Der Ablageort wird NICHT abgeleitet, sondern festgelegt. Es gibt
--     keine Platzhalter-Regel mehr. Uli waehlt den Ordner; die Wahl wird
--     je Kombination aus Objekt und Dokumenttyp gemerkt und beim naechsten
--     Mal wiederverwendet.  -> Tabelle document_locations,
--     document_types.folder_rule entfaellt.
--
-- GRUNDSATZ, ausdruecklich bestaetigt: Dokumentinhalte werden NICHT
-- ausgelesen und NICHT in Positionen zerlegt. Eine Rechnung ist eine
-- Datei mit Metadaten und EINEM Bezug.
--
-- Ausfuehren im Supabase SQL-Editor. Idempotent.

-- ------------------------------------------------------------
-- (1) document_vendors — Rechnungsabsender
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_vendors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  note       text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_vendors_name_key
  ON public.document_vendors (lower(name));

COMMENT ON TABLE public.document_vendors IS
  'Rechnungsabsender ohne eigenes Objekt im System: Gemeinde, Energieversorger, Handwerker, Anwalt. Bewusst getrennt von service_providers — dort stehen nur Dienstleister mit Auftraegen und Portalzugang.';

-- ------------------------------------------------------------
-- (2) documents: Dienstleister und Absender als Bezug
-- ------------------------------------------------------------

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id   uuid REFERENCES public.document_vendors(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_provider_idx ON public.documents (provider_id);
CREATE INDEX IF NOT EXISTS documents_vendor_idx   ON public.documents (vendor_id);

COMMENT ON COLUMN public.documents.provider_id IS
  'Bezug auf einen Dienstleister — fuer Sammelrechnungen, die mehrere Auftraege in mehreren Haeusern abdecken.';
COMMENT ON COLUMN public.documents.vendor_id IS
  'Bezug auf einen Rechnungsabsender aus document_vendors.';

-- ------------------------------------------------------------
-- (3) document_types: Unterordner statt Regel, kein Zwangsziel
-- ------------------------------------------------------------

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS folder_name text;

-- Vorbelegung: der Typname. BEWUSST keine Ableitung aus der alten
-- folder_rule — die haette bei „{haus}/Gaeste/{jahr}" oder „Dokument
-- Management" unbrauchbare oder irrefuehrende Ordnernamen ergeben.
-- Der Ordnername ist ohnehin in der Oberflaeche zu pflegen.
UPDATE public.document_types
SET folder_name = name
WHERE folder_name IS NULL;

ALTER TABLE public.document_types
  ALTER COLUMN folder_name SET NOT NULL;

-- Ordnernamen duerfen keine Pfadtrenner enthalten
ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_folder_name_check;
ALTER TABLE public.document_types
  ADD CONSTRAINT document_types_folder_name_check
  CHECK (folder_name !~ '[/\\:*?"<>|]' AND btrim(folder_name) <> '');

-- link_target und folder_rule entfallen: der Typ bestimmt weder die
-- Zuordnung noch den Ablageort. Spalten werden nullable gemacht statt
-- geloescht — so laeuft aeltere Frontend-Fassung waehrend des Rollouts
-- weiter und bricht nicht mit NOT NULL.
ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_link_target_check;
ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_rule_check;
ALTER TABLE public.document_types
  ALTER COLUMN link_target DROP NOT NULL,
  ALTER COLUMN folder_rule DROP NOT NULL;

COMMENT ON COLUMN public.document_types.folder_name IS
  'Name des Unterordners in OneDrive, z. B. „Rechnungen". Getrennt vom Typnamen, damit der Typ „Vertrag" heissen kann und der Ordner „Vertraege".';
COMMENT ON COLUMN public.document_types.link_target IS
  'VERALTET seit 20.08.2026 — der Typ bestimmt die Zuordnung nicht mehr. Spalte bleibt vorerst stehen; nicht mehr auswerten.';
COMMENT ON COLUMN public.document_types.folder_rule IS
  'VERALTET seit 20.08.2026 — Ablageorte werden festgelegt (document_locations), nicht aus Platzhaltern abgeleitet. Nicht mehr auswerten.';

-- ------------------------------------------------------------
-- (4) document_locations — der festgelegte Ablageort
-- ------------------------------------------------------------
--
-- Eine Zeile je Kombination aus Objekt und Dokumenttyp:
--   Boris + Rechnungen  -> Ordner-ID von DokumentManagement/Boris/Rechnungen
--   Boris + Vertrag     -> Ordner-ID von DokumentManagement/Boris/Vertraege
--
-- entity_type + entity_id statt fester Fremdschluessel, weil hier
-- ABSICHTLICH heterogen verwiesen wird: mal auf ein Haus, mal auf einen
-- Dienstleister, mal auf einen Absender. Eine Spalte je Zieltyp waere
-- eine Tabelle mit ueberwiegend leeren Spalten.
-- Der Verweis ist unkritisch: geht das Objekt verloren, ist der Eintrag
-- nur eine ungenutzte Vorbelegung, kein Datenverlust.

CREATE TABLE IF NOT EXISTS public.document_locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  document_type_id  uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  onedrive_item_id  text NOT NULL,
  onedrive_path     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_locations
  DROP CONSTRAINT IF EXISTS document_locations_entity_type_check;
ALTER TABLE public.document_locations
  ADD CONSTRAINT document_locations_entity_type_check
  CHECK (entity_type IN ('haus','provider','vendor','buchung','reinigung','waesche'));

CREATE UNIQUE INDEX IF NOT EXISTS document_locations_key
  ON public.document_locations (entity_type, entity_id, document_type_id);

COMMENT ON TABLE public.document_locations IS
  'Festgelegter Ablageort je Objekt und Dokumenttyp. Wird beim Ablegen gemerkt und beim naechsten Mal vorgeschlagen. NICHT abgeleitet — Uli waehlt den Ordner.';
COMMENT ON COLUMN public.document_locations.onedrive_item_id IS
  'Ordner-ID. Ueberlebt Umbenennen und Verschieben in OneDrive — deshalb NICHT der Pfad als Schluessel.';
COMMENT ON COLUMN public.document_locations.onedrive_path IS
  'Pfad zum Zeitpunkt der Festlegung, nur zur Anzeige. Darf veralten.';

-- ------------------------------------------------------------
-- (5) RLS und updated_at
-- ------------------------------------------------------------

ALTER TABLE public.document_vendors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage document_vendors" ON public.document_vendors;
CREATE POLICY "Admins manage document_vendors" ON public.document_vendors
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage document_locations" ON public.document_locations;
CREATE POLICY "Admins manage document_locations" ON public.document_locations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS document_vendors_touch ON public.document_vendors;
CREATE TRIGGER document_vendors_touch BEFORE UPDATE ON public.document_vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS document_locations_touch ON public.document_locations;
CREATE TRIGGER document_locations_touch BEFORE UPDATE ON public.document_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- (6) Kontrolle
-- ------------------------------------------------------------

SELECT name, folder_name, color, is_active
FROM public.document_types ORDER BY sort_order;

SELECT count(*) AS vendors   FROM public.document_vendors;
SELECT count(*) AS ablageorte FROM public.document_locations;

SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='documents'
  AND column_name IN ('provider_id','vendor_id','house_id','booking_id','service_task_id','linen_order_id')
ORDER BY column_name;

-- Erwartet:
--   Dokumenttypen mit gefuelltem folder_name (aus der alten Regel abgeleitet)
--   vendors = 0, ablageorte = 0 — beide entstehen erst im Betrieb
--   sechs Bezugsspalten in documents
