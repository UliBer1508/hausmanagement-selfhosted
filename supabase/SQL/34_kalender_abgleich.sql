-- =============================================================================
-- 34_kalender_abgleich.sql
-- Phase 4: Kalender-Abgleich (Konzept-iCal-Kollisionswarnung.md, Abschnitt 8)
-- Angelegt: 18.07.2026
-- =============================================================================
--
-- ZWECK
-- -----
-- Legt die Einstellungen und den Ablauf-Eintrag für die Edge Function
-- `kalender-abgleich` an. Die Function selbst ist REIN LESEND — sie legt keine
-- Tabellen an und ändert keine Daten. Diese Migration ist daher schlank.
--
-- HINTERGRUND
-- -----------
-- Am 18.07.2026 fielen zwei Probleme auf, die der bestehende iCal-Sync nicht
-- melden konnte:
--   a) Eine Booking.com-Buchung (Cathrin Clausnitzer, 06.-13.02.2027) fehlte im
--      System. Der Block war eingelesen, wurde aber nie gemeldet, weil Phase 1
--      nur Überschneidungen prüft.
--   b) Booking.com sperrte 19.07.2027-18.01.2028 (183 Nächte) — ein halbes Jahr
--      Verfügbarkeit, ohne dass es jemandem auffiel.
--
-- Ausführen im Supabase SQL-Editor (NICHT per CLI/db push — Repo-Regel).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Einstellungen
-- -----------------------------------------------------------------------------
--
-- Die Grenzwerte stehen bewusst NICHT im Code: Uli vermietet in der Regel ab
-- 4 Nächten, lässt saisonal aber auch 3 zu. Die Obergrenze von 30 Nächten ergibt
-- sich aus den Einstellungen in den Portalen.
--
-- Bedeutung der Grenzen (siehe Konzept 8.4):
--   < min_naechte  -> Mindestaufenthalts-Sperre der Portale, keine Buchung möglich
--   min..max       -> Buchungsverdacht, wenn im System keine Buchung existiert
--   > max_naechte  -> Langsperre: Kalenderhorizont ODER vergessene Sperre.
--                     In den Daten nicht unterscheidbar -> einmalig melden.

INSERT INTO public.system_settings (key, value)
VALUES (
  'kalender_abgleich_settings',
  jsonb_build_object(
    'min_naechte', 4,
    'max_naechte', 30,
    'checks', jsonb_build_object(
      'fehlende_buchung', true,
      'langsperre',       true,
      'feed_fehler',      true
    )
  )
)
ON CONFLICT (key) DO NOTHING;   -- vorhandene Einstellung nicht überschreiben


-- -----------------------------------------------------------------------------
-- 2. Ablauf-Definition in max_ablaeufe
-- -----------------------------------------------------------------------------
--
-- max_ablaeufe ist die verbindliche SOLL-Definition aller Max-Abläufe und wird
-- vom chat-assistant zur Laufzeit gelesen. Ein Ablauf, der hier fehlt, existiert
-- für Max nicht.
--
-- Akteur ist `system` bzw. `max` — KEIN Provider beteiligt. Amela und Teuni haben
-- mit dem Kalender-Abgleich nichts zu tun; die Statuswerte `wartet_provider` und
-- `abgelehnt` kommen hier nicht vor.

INSERT INTO public.max_ablaeufe
  (aktion, aktion_label, ausloeser, variante, schritt_nr, akteur, schritt,
   ergebnis_status, umsetzung, funktion, notiz)
VALUES
  ('kalender_abgleich', 'Kalender-Abgleich mit den Portalen',
   'Cron täglich nach ical-sync / Frage im Chat', 'automatik', 1, 'max',
   'Vergleicht tagesweise: ist jeder von den Portalen als belegt gemeldete Tag im System durch eine Buchung gedeckt?',
   NULL, 'umgesetzt',
   'Edge Function kalender-abgleich',
   'Tagesweise, nicht blockweise: Booking.com fasst aufeinanderfolgende Buchungen zu EINEM Block zusammen (25.12.2026-05.01.2027 = Kerscher + Fischer). Ein 1:1-Vergleich Block gegen Buchung wuerde Fehlalarm schlagen.'),

  ('kalender_abgleich', 'Kalender-Abgleich mit den Portalen',
   NULL, 'automatik', 2, 'max',
   'Grenzt Sperrzeiten von Buchungen ab: unter 4 Naechte = Mindestaufenthalts-Sperre, ueber 30 Naechte = Langsperre',
   NULL, 'umgesetzt',
   'Edge Function kalender-abgleich (Grenzen aus system_settings kalender_abgleich_settings)',
   'Ohne diese Abgrenzung meldet der Abgleich jede Portal-Sperre als fehlende Buchung. Am 18.07.2026 waren das 6 von 19 Blocks.'),

  ('kalender_abgleich', 'Kalender-Abgleich mit den Portalen',
   NULL, 'automatik', 3, 'max',
   'Meldet Befunde in der Morgen-Uebersicht; bei fehlender Buchung zusaetzlich aktiv im Chat',
   'wartet_uli', 'umgesetzt',
   'Edge Function morning-summary (Abschnitt Kalender-Abgleich) + Auto-Insert beim Chat-Oeffnen',
   'Eine fehlende Buchung bedeutet: keine Reinigung, keine Waesche, kein Gaestekontakt — und der Zeitraum koennte direkt noch einmal vergeben werden.'),

  ('kalender_abgleich', 'Kalender-Abgleich mit den Portalen',
   NULL, 'automatik', 4, 'uli',
   'Traegt die fehlende Buchung nach bzw. gibt den gesperrten Zeitraum im Portal frei',
   'abgeschlossen', 'umgesetzt',
   'Uli in der Hausverwaltung (Buchung anlegen) bzw. im Portal-Extranet',
   'BEWUSST KEINE automatische Buchungsanlage: iCal liefert nur Zeitraeume, keine Gastdaten (Name, Anzahl, Kontakt fehlen). Max meldet, Uli traegt nach.')
ON CONFLICT DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. Cron: täglich 06:25 MESZ (04:25 UTC)
-- -----------------------------------------------------------------------------
--
-- Zeitlage bewusst gewählt:
--   04:20 UTC  ical-sync         (holt die Portal-Daten)
--   04:25 UTC  kalender-abgleich (wertet sie aus)   <- diese Migration
--   04:30 UTC  morning-summary   (meldet an Uli)
--
-- Der Abgleich muss NACH dem Sync und VOR der Morgen-Übersicht laufen, sonst
-- wertet er Daten vom Vortag aus bzw. seine Befunde kommen einen Tag zu spät.

-- IDEMPOTENT: alten Job gleichen Namens entfernen, dann neu anlegen
-- (Muster wie 32_ical_sync_cron.sql).
select cron.unschedule('kalender-abgleich-daily')
where exists (select 1 from cron.job where jobname = 'kalender-abgleich-daily');

select cron.schedule(
  'kalender-abgleich-daily',
  '25 4 * * *',
  $$
  select net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/kalender-abgleich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select value from public.system_settings where key = 'kalender_abgleich_settings';
--
--   select schritt_nr, akteur, schritt, ergebnis_status
--   from public.max_ablaeufe
--   where aktion = 'kalender_abgleich'
--   order by schritt_nr;
--
--   select jobname, schedule, active from cron.job where jobname = 'kalender-abgleich-daily';
--
-- Funktionstest (liefert die Befunde als JSON, ändert nichts):
--   Edge Function kalender-abgleich aufrufen — sie ist rein lesend.
-- =============================================================================
