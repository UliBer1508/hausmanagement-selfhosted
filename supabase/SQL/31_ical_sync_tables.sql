-- =============================================================================
-- 31_ical_sync_tables.sql
-- =============================================================================
-- ZWECK
--   Datenmodell für den iCal-Sync mit Kollisionswarnung (Modul CalendarSync).
--   Externe Plattform-Belegungen (Airbnb, Booking.com, VRBO, Belvilla) werden
--   per iCal-Feed eingelesen; kollidiert ein belegter Zeitraum mit einer
--   bestehenden eigenen Buchung, wird Uli gewarnt.
--
--   Siehe Konzept: docs/Konzept-iCal-Kollisionswarnung.md
--
-- ALLES IST "IF NOT EXISTS" — idempotent, gefahrlos wiederholbar im SQL-Editor.
--   (Kein `db push` — Lovable-Historie-Desync, siehe supabase/SQL/README.md.)
--
-- ZWEI TABELLEN
--   ical_feeds       — je Haus + Plattform eine iCal-IMPORT-URL (von Uli gepflegt).
--   external_blocks  — die eingelesenen Belegungen (nur Zeiträume, keine Gastdaten
--                      — das ist die Grenze der Plattformen). Kollisionen werden
--                      über collision_booking_id markiert.
-- =============================================================================


-- =============================================================================
-- ical_feeds — die abonnierten Import-Feeds
-- =============================================================================
-- platform nutzt DIESELBEN Werte wie bookings.platform (CreateBookingForm):
--   'booking.com' | 'airbnb' | 'vrbo' | 'belvilla'
-- (Kein neues Vokabular — Konsistenz mit dem bestehenden Buchungsfeld.)
CREATE TABLE IF NOT EXISTS public.ical_feeds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id       uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  platform       text NOT NULL,
  feed_url       text NOT NULL,          -- die iCal-Export-URL der Plattform
  is_active      boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,            -- wann zuletzt erfolgreich abgerufen
  last_status    text,                   -- 'ok' | 'error: <text>' | 'leer'
  last_event_count integer,             -- wie viele VEVENTs beim letzten Lauf
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- pro Haus + Plattform nur EIN aktiver Feed (verhindert Doppel-Feeds)
  UNIQUE (house_id, platform)
);

COMMENT ON TABLE public.ical_feeds IS
  'iCal-Import-Feeds je Haus+Plattform (Airbnb/Booking/VRBO/Belvilla). Modul CalendarSync.';


-- =============================================================================
-- external_blocks — die eingelesenen externen Belegungen
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.external_blocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id            uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  platform            text NOT NULL,
  external_uid        text NOT NULL,     -- UID aus dem VEVENT (Dedupe-Schlüssel)
  start_date          date NOT NULL,
  end_date            date NOT NULL,     -- exklusiv (iCal DTEND ist der Abreisetag)
  summary             text,              -- roher VEVENT-SUMMARY-Text
  collision_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  collision_notified  boolean NOT NULL DEFAULT false,  -- E-Mail bei NEUER Kollision nur 1x
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  -- dieselbe Belegung (Plattform+UID) nur einmal
  UNIQUE (platform, external_uid)
);

COMMENT ON TABLE public.external_blocks IS
  'Aus iCal-Feeds eingelesene externe Belegungen (nur Zeiträume). collision_booking_id != NULL = Kollision mit eigener Buchung.';

-- Index für die Kollisionsprüfung (Datumsüberlapp je Haus)
CREATE INDEX IF NOT EXISTS idx_external_blocks_house_dates
  ON public.external_blocks (house_id, start_date, end_date);

-- Index für die "neue Kollision, noch nicht gemeldet"-Abfrage
CREATE INDEX IF NOT EXISTS idx_external_blocks_collision_pending
  ON public.external_blocks (collision_notified)
  WHERE collision_booking_id IS NOT NULL;


-- =============================================================================
-- RLS: nur eingeloggte Admins (wie bei den übrigen internen Tabellen).
--   Die Edge Function nutzt den service_role-Key und umgeht RLS ohnehin.
-- =============================================================================
ALTER TABLE public.ical_feeds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ical_feeds_admin_all ON public.ical_feeds;
CREATE POLICY ical_feeds_admin_all ON public.ical_feeds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS external_blocks_admin_read ON public.external_blocks;
CREATE POLICY external_blocks_admin_read ON public.external_blocks
  FOR SELECT TO authenticated USING (true);


-- Kontrolle nach dem Einspielen:
--   select * from public.ical_feeds;
--   select platform, count(*) from public.external_blocks group by platform;
