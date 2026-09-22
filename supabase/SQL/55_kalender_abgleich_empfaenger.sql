-- =============================================================================
-- 55_kalender_abgleich_empfaenger.sql
-- Kalender-Abgleich: Mail an Uli UND an Max' Postfach, Kollisionen als Befund
-- =============================================================================
--
-- WARUM (22.09.2026):
-- Eine nachts eingegangene Booking.com-Buchung (Venediger Chalet,
-- 29.12.2026–03.01.2027) wurde vom Kalender-Abgleich korrekt erkannt. Die Mail
-- "1 Buchung(en) fehlen im System" ging aber nur an max.steinbock@gmail.com —
-- bei Uli kam sie nicht an.
--
-- kalender-abgleich liest `mail_to` seit 22.09.2026 als Text ODER als Liste.
-- Diese Datei stellt auf eine Liste mit beiden Adressen um.
--
-- Zusätzlich: Schalter `checks.kollision` (mögliche Doppelbuchung als Befund in
-- Banner, Sync-Meldung, Morgen-Übersicht und Mail). Standard im Code ist true;
-- hier nur ausdrücklich gesetzt, damit er in der Einstellung sichtbar ist.
--
-- Idempotent: mehrfaches Ausführen ändert nichts weiter.
-- =============================================================================

update public.system_settings
set value = value
  || jsonb_build_object(
       'mail_to', jsonb_build_array('uli.berresheim@hotmail.de', 'max.steinbock@gmail.com')
     )
  || jsonb_build_object(
       'checks', coalesce(value->'checks', '{}'::jsonb) || jsonb_build_object('kollision', true)
     )
where key = 'kalender_abgleich_settings';


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select value->'mail_to' as empfaenger, value->'checks' as pruefungen
--   from public.system_settings where key = 'kalender_abgleich_settings';
--
-- Erwartet: ["uli.berresheim@hotmail.de", "max.steinbock@gmail.com"]
--           und in den Prüfungen "kollision": true
