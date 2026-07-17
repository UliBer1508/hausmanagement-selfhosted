-- =============================================================================
-- 30_max_ablaeufe_spalte_weg.sql
-- =============================================================================
-- ZWECK
--   Erweitert max_ablaeufe um die Spalte `weg` und belegt sie für JEDEN Ablauf.
--   Hintergrund: Die Tabelle definierte bisher nur, WELCHE Funktion ein Schritt
--   nutzt — nicht, WIE Max dorthin kommt. Nach dem Umbau vom 17.07.2026 gilt das
--   Grundprinzip lückenlos: "immer der KI-Weg". `weg` macht das prüfbar.
--
-- WERTE der Spalte `weg`:
--   'ki'      — Max/Gemini interpretiert die Anfrage, holt Infos über Lese-Tools,
--               wählt die Funktion selbst und ruft sie auf (mit Gesprächsverlauf).
--               Das ist ab 17.07.2026 der EINZIGE Weg für alle Chat-Aktionen,
--               inkl. Begrüßungs-E-Mail und Reschedule (früher deterministisch).
--   'system'  — Läuft OHNE Chat/KI: Cron-Jobs und DB-Trigger (Automatik).
--               z.B. overdue-watch, Reminder-Crons, morning-summary-Cron,
--               DB-Trigger, die Amela/Teuni benachrichtigen.
--   'mensch'  — Reiner Handlungsschritt eines Menschen (uli/amela/teuni), kein
--               Code. z.B. "Uli bestätigt im Chat", "Amela drückt Portal-Button",
--               "Uli setzt Status in der Karte auf Geplant".
--
-- ABGELEITET aus akteur + funktion je Schritt:
--   akteur in (uli, amela, teuni) und funktion = menschliche Handlung -> 'mensch'
--   akteur = system (Cron/Trigger)                                    -> 'system'
--   akteur = max, ausgelöst über den Chat                             -> 'ki'
--   akteur = max, aber reiner Automatik-Cron (z.B. check_upcoming,
--            morning_summary automatik, Reminder)                     -> 'system'
--
-- IDEMPOTENT: Spalte wird nur angelegt, falls nicht vorhanden; danach werden alle
--   Zeilen per UPDATE gesetzt (mehrfach ausführbar).
-- =============================================================================

-- 1) Spalte anlegen (falls noch nicht vorhanden)
ALTER TABLE public.max_ablaeufe
  ADD COLUMN IF NOT EXISTS weg text;

COMMENT ON COLUMN public.max_ablaeufe.weg IS
  'Wie der Schritt technisch laeuft: ki (Gemini interpretiert+waehlt Funktion), system (Cron/DB-Trigger, ohne Chat), mensch (reiner Handlungsschritt einer Person).';

-- =============================================================================
-- 2) Werte setzen — pro Ablauf/Variante/Schritt
-- =============================================================================

-- ---- accept_booking_inquiry (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='accept_booking_inquiry' AND variante='standard' AND schritt_nr=1; -- uli: Befehl
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='accept_booking_inquiry' AND variante='standard' AND schritt_nr=2; -- max: zeigt Details
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='accept_booking_inquiry' AND variante='standard' AND schritt_nr=3; -- uli: bestätigt
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='accept_booking_inquiry' AND variante='standard' AND schritt_nr=4; -- max: legt Buchung an

-- ---- reject_booking_inquiry (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reject_booking_inquiry' AND variante='standard' AND schritt_nr=1; -- uli
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reject_booking_inquiry' AND variante='standard' AND schritt_nr=2; -- max: zeigt
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reject_booking_inquiry' AND variante='standard' AND schritt_nr=3; -- uli: bestätigt
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reject_booking_inquiry' AND variante='standard' AND schritt_nr=4; -- max: sendet Absage

-- ---- check_upcoming_bookings (automatik) ----
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='check_upcoming_bookings' AND variante='automatik'; -- Cron/Prüfung

-- ---- create_cleaning_for_booking (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=1; -- uli: Befehl
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=2; -- max: sucht
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=3; -- max: zeigt Auswahl
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=4; -- uli: wählt
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=5; -- max: legt draft an
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=6; -- uli: setzt Geplant
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='create_cleaning_for_booking' AND variante='standard' AND schritt_nr=7; -- DB-Trigger

-- ---- create_cleaning_for_booking (sonderfall_vorhanden) ----
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='sonderfall_vorhanden' AND schritt_nr=1; -- max: findet vorhandene
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='sonderfall_vorhanden' AND schritt_nr=2; -- max: fragt
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_cleaning_for_booking' AND variante='sonderfall_vorhanden' AND schritt_nr=3; -- uli: Ja
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_cleaning_for_booking' AND variante='sonderfall_vorhanden' AND schritt_nr=4; -- max: Edit-Karte

-- ---- create_linen_for_booking (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=1; -- uli: Befehl
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=2; -- max: sucht
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=3; -- uli: wählt
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=4; -- max: legt offen an
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=5; -- uli: setzt ausstehend
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='create_linen_for_booking' AND variante='standard' AND schritt_nr=6; -- max: informiert Teuni

-- ---- update_linen_for_booking (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='update_linen_for_booking' AND variante='standard' AND schritt_nr=1; -- uli: Befehl
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='update_linen_for_booking' AND variante='standard' AND schritt_nr=2; -- max: ersetzt
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='update_linen_for_booking' AND variante='standard' AND schritt_nr=3; -- uli: prüft
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='update_linen_for_booking' AND variante='standard' AND schritt_nr=4; -- max: informiert Teuni

-- ---- reschedule_cleaning (standard) — FRÜHER DETERMINISTISCH, JETZT KI ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=1; -- uli/amela: Wunsch
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=2; -- max: ordnet zu
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=3; -- max: ändert -> draft
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=4; -- max: Button
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=5; -- uli: setzt Geplant
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='reschedule_cleaning' AND variante='standard' AND schritt_nr=6; -- DB-Trigger

-- ---- reject_reschedule (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reject_reschedule' AND variante='standard' AND schritt_nr=1; -- amela: Portal-Button
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reject_reschedule' AND variante='standard' AND schritt_nr=2; -- max: zeigt Wunsch
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reject_reschedule' AND variante='standard' AND schritt_nr=3; -- uli: Nein
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reject_reschedule' AND variante='standard' AND schritt_nr=4; -- max: sendet Absage

-- ---- reschedule_linen_delivery (standard) ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=1; -- uli/teuni: Wunsch
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=2; -- max: ordnet zu
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=3; -- max: ändert -> offen
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=4; -- max: Button
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=5; -- uli: setzt ausstehend
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='reschedule_linen_delivery' AND variante='standard' AND schritt_nr=6; -- DB-Trigger

-- ---- draft_guest_welcome_email (standard) — FRÜHER DETERMINISTISCH, JETZT KI ----
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='draft_guest_welcome_email' AND variante='standard' AND schritt_nr=1; -- uli: Befehl
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='draft_guest_welcome_email' AND variante='standard' AND schritt_nr=2; -- max: ermittelt Buchung
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='draft_guest_welcome_email' AND variante='standard' AND schritt_nr=3; -- max: bereitet Entwurf
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='draft_guest_welcome_email' AND variante='standard' AND schritt_nr=4; -- uli: prüft+sendet

-- ---- draft_guest_welcome_email (sonderfall_keine_email) ----
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='draft_guest_welcome_email' AND variante='sonderfall_keine_email' AND schritt_nr=1; -- max: stellt fest
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='draft_guest_welcome_email' AND variante='sonderfall_keine_email' AND schritt_nr=2; -- max: meldet Uli
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='draft_guest_welcome_email' AND variante='sonderfall_keine_email' AND schritt_nr=3; -- uli: entscheidet

-- ---- get_morning_summary (automatik) ----
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='get_morning_summary' AND variante='automatik'; -- Cron + Edge Function

-- ---- max_cleaning_reminders (automatik) ----
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='max_cleaning_reminders' AND variante='automatik'; -- Cron

-- ---- max_linen_reminders (automatik) ----
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='max_linen_reminders' AND variante='automatik'; -- Cron

-- ---- overdue_watch (automatik) ----
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='overdue_watch' AND variante='automatik'; -- Cron

-- ---- provider_keine_antwort (standard) ----
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='provider_keine_antwort' AND variante='standard' AND schritt_nr=1; -- max: fragt + Frist
UPDATE public.max_ablaeufe SET weg='system' WHERE aktion='provider_keine_antwort' AND variante='standard' AND schritt_nr=2; -- system: überfällig (Cron)
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='provider_keine_antwort' AND variante='standard' AND schritt_nr=3; -- max: informiert Uli aktiv
UPDATE public.max_ablaeufe SET weg='mensch' WHERE aktion='provider_keine_antwort' AND variante='standard' AND schritt_nr=4; -- uli: antwortet frei
UPDATE public.max_ablaeufe SET weg='ki'     WHERE aktion='provider_keine_antwort' AND variante='standard' AND schritt_nr=5; -- max: setzt um

-- =============================================================================
-- 3) Kontrolle: sind alle Zeilen belegt? (darf 0 Zeilen liefern)
-- =============================================================================
-- select aktion, variante, schritt_nr, akteur, weg
-- from public.max_ablaeufe
-- where weg is null
-- order by aktion, variante, schritt_nr;

-- Übersicht nach Weg:
-- select weg, count(*) from public.max_ablaeufe group by weg order by weg;

-- Vollbild:
-- select aktion, variante, schritt_nr, akteur, weg, schritt
-- from public.max_ablaeufe
-- order by aktion, variante, schritt_nr;
