-- ============================================================
-- 51_dokumentenverwaltung.sql
-- Dokumentenverwaltung mit OneDrive-Ablage
-- ============================================================
--
-- Stand 20.08.2026.
--
-- GRUNDSATZ: Die Datei bleibt in OneDrive. Die Datenbank haelt nur
-- Metadaten und den Verweis (onedrive_item_id). Es gibt KEINE Zweitablage
-- in Supabase Storage — zwei Ablagen waeren zwei Wahrheiten.
--
-- Bezug: docs/Konzept-OneDrive-Belegarchiv.md (Abschnitte 3-7 gelten
-- unveraendert). Diese Datei ergaenzt die dort fehlende Richtung
-- App -> OneDrive sowie die Verknuepfung mit Objekten.
--
-- Ausfuehren im Supabase SQL-Editor, NICHT per db push.
-- Idempotent: mehrfaches Ausfuehren ist unschaedlich.

-- ------------------------------------------------------------
-- (1) integration_tokens — Microsoft-Refresh-Token
-- ------------------------------------------------------------
--
-- BEWUSST OHNE POLICY: nur service_role (Edge Functions) kommt heran.
-- Das ist Absicht, kein vergessener Schritt. Ein Token im Browser
-- wuerde die Absicherung aufheben.

CREATE TABLE IF NOT EXISTS public.integration_tokens (
  provider          text PRIMARY KEY,
  refresh_token     text NOT NULL,
  access_token      text,
  access_expires_at timestamptz,
  account_label     text,
  last_error        text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.integration_tokens IS
  'Refresh-Tokens externer Dienste. KEINE RLS-Policy: nur service_role greift zu. Microsoft rotiert den Refresh-Token bei jedem Refresh — er MUSS zurueckgeschrieben werden.';

-- ------------------------------------------------------------
-- (2) document_types — vom Nutzer pflegbar
-- ------------------------------------------------------------
--
-- link_target bestimmt, welche Objekte beim Ablegen zur Auswahl stehen.
-- folder_rule bestimmt den Speicherort in OneDrive, mit Platzhaltern
-- {haus} und {jahr}. Fehlende Ordner werden beim Ablegen angelegt.

CREATE TABLE IF NOT EXISTS public.document_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  link_target  text NOT NULL DEFAULT 'keine',
  folder_rule  text NOT NULL,
  color        text NOT NULL DEFAULT 'slate',
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 100,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_link_target_check;
ALTER TABLE public.document_types
  ADD CONSTRAINT document_types_link_target_check
  CHECK (link_target IN ('haus','buchung','reinigung','waesche','keine'));

-- Ein Typ ohne Verknuepfung kann {haus} nicht aufloesen.
ALTER TABLE public.document_types
  DROP CONSTRAINT IF EXISTS document_types_rule_check;
ALTER TABLE public.document_types
  ADD CONSTRAINT document_types_rule_check
  CHECK (link_target <> 'keine' OR folder_rule NOT LIKE '%{haus}%');

CREATE UNIQUE INDEX IF NOT EXISTS document_types_name_key
  ON public.document_types (lower(name));

COMMENT ON COLUMN public.document_types.folder_rule IS
  'Pfad in OneDrive, relativ zum Laufwerk-Stammordner. Platzhalter {haus} und {jahr}. Beispiel: {haus}/Reinigung';
COMMENT ON COLUMN public.document_types.is_active IS
  'Deaktivierte Typen erscheinen nicht mehr zur Auswahl, bleiben aber an bestehenden Dokumenten lesbar. Deshalb deaktivieren statt loeschen.';

-- ------------------------------------------------------------
-- (3) documents
-- ------------------------------------------------------------
--
-- Feste Fremdschluessel je Bezugstyp statt eines polymorphen
-- entity_id: so prueft die Datenbank die Integritaet, und geloeschte
-- Buchungen/Reinigungen hinterlassen keine toten Verweise.
-- Ein Dokument haengt an HOECHSTENS EINEM Objekt.

CREATE TABLE IF NOT EXISTS public.documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name          text NOT NULL,
  mime_type          text,
  size_bytes         bigint,

  document_type_id   uuid REFERENCES public.document_types(id) ON DELETE SET NULL,

  house_id           uuid REFERENCES public.houses(id)         ON DELETE SET NULL,
  booking_id         uuid REFERENCES public.bookings(id)       ON DELETE SET NULL,
  service_task_id    uuid REFERENCES public.service_tasks(id)  ON DELETE SET NULL,
  linen_order_id     uuid REFERENCES public.linen_orders(id)   ON DELETE SET NULL,

  onedrive_item_id   text NOT NULL UNIQUE,
  onedrive_drive_id  text,
  onedrive_web_url   text,
  onedrive_path      text,

  note               text,
  uploaded_by        uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.documents.onedrive_item_id IS
  'driveItem.id — bleibt beim Umbenennen und Verschieben stabil. NIE den Pfad als Schluessel verwenden. UNIQUE ist zugleich der Duplikatschutz.';
COMMENT ON COLUMN public.documents.onedrive_path IS
  'Pfad zum Zeitpunkt der Ablage, nur zur Anzeige. Kann veralten — massgeblich ist onedrive_item_id.';

CREATE INDEX IF NOT EXISTS documents_house_idx        ON public.documents (house_id);
CREATE INDEX IF NOT EXISTS documents_booking_idx      ON public.documents (booking_id);
CREATE INDEX IF NOT EXISTS documents_task_idx         ON public.documents (service_task_id);
CREATE INDEX IF NOT EXISTS documents_linen_idx        ON public.documents (linen_order_id);
CREATE INDEX IF NOT EXISTS documents_type_idx         ON public.documents (document_type_id);
CREATE INDEX IF NOT EXISTS documents_created_idx      ON public.documents (created_at DESC);
-- Namenssuche: einfacher B-Tree auf lower(file_name).
-- Bewusst KEIN gin_trgm_ops — die Erweiterung pg_trgm ist in diesem
-- Projekt nirgends aktiviert, der Index wuerde die Migration abbrechen.
CREATE INDEX IF NOT EXISTS documents_name_idx        ON public.documents (lower(file_name));

-- ------------------------------------------------------------
-- (4) RLS — Muster wie bei den uebrigen Tabellen
-- ------------------------------------------------------------

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage document_types" ON public.document_types;
CREATE POLICY "Admins manage document_types" ON public.document_types
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage documents" ON public.documents;
CREATE POLICY "Admins manage documents" ON public.documents
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ------------------------------------------------------------
-- (5) updated_at automatisch pflegen
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_touch ON public.documents;
CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS document_types_touch ON public.document_types;
CREATE TRIGGER document_types_touch BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- (5b) Sperre gegen gleichzeitigen Token-Refresh
-- ------------------------------------------------------------
--
-- Zwei Edge Functions, die gleichzeitig refreshen, entwerten sich
-- gegenseitig den Refresh-Token. _shared/onedrive.ts ruft diese
-- Funktion vor jedem Refresh auf. Die Sperre endet mit der Transaktion.

CREATE OR REPLACE FUNCTION public.lock_onedrive_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('onedrive_token_refresh'));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_onedrive_refresh() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_onedrive_refresh() TO service_role;

-- ------------------------------------------------------------
-- (6) Starttypen (nur einfuegen, wenn noch keine vorhanden)
-- ------------------------------------------------------------

INSERT INTO public.document_types (name, link_target, folder_rule, color, sort_order)
SELECT * FROM (VALUES
  ('Reinigungsrechnung',  'reinigung', '{haus}/Reinigung',     'emerald', 10),
  ('Wäsche-Lieferschein', 'waesche',   '{haus}/Wäsche',        'violet',  20),
  ('Hausunterlage',       'haus',      '{haus}',               'amber',   30),
  ('Gastkorrespondenz',   'buchung',   '{haus}/Gäste/{jahr}',  'sky',     40),
  ('Sonstiges',           'keine',     'Dokument Management',  'slate',   90)
) AS v(name, link_target, folder_rule, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.document_types);

-- ------------------------------------------------------------
-- (7) Kontrolle
-- ------------------------------------------------------------

SELECT name, link_target, folder_rule, color, is_active
FROM public.document_types ORDER BY sort_order;

SELECT count(*) AS dokumente FROM public.documents;
SELECT provider, account_label, last_error, updated_at FROM public.integration_tokens;

-- Nach diesem Lauf ist integration_tokens LEER. Das ist richtig:
-- die Zeile entsteht erst bei der einmaligen Anmeldung ueber
-- /functions/v1/onedrive-oauth.
