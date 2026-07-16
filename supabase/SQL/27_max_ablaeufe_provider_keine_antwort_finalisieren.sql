-- =============================================================================
-- 27_max_ablaeufe_provider_keine_antwort_finalisieren.sql
-- =============================================================================
-- ZWECK
--   Zwei Nachtraege an der Definition provider_keine_antwort, nachdem der Code
--   (Frist 24 h + Prompt-Regel) deployed ist:
--
--   1. Schritt 1: funktion-Text so, dass die Kontrollfunktion BEIDE Reminder-
--      Functions prueft. Ihre Regex /Edge Function\s+([\w-]+)/ nimmt nur das
--      ERSTE Wort nach "Edge Function". Im alten Text stand
--      "Edge Function max-cleaning-reminders / max-linen-reminders" — der zweite
--      Name (max-linen-reminders) wurde NICHT extrahiert, also nicht geprueft.
--      -> Vor JEDEN Function-Namen "Edge Function" setzen.
--
--   2. Alle 5 Schritte von 'geplant' auf 'umgesetzt' (Code deployed).
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
-- =============================================================================

-- 1. Schritt 1: beide Reminder-Functions einzeln mit "Edge Function" davor.
UPDATE public.max_ablaeufe
SET funktion =
      'Tool send_provider_message (bei Terminfragen im Chat) bzw. '
      || 'Edge Function max-cleaning-reminders und '
      || 'Edge Function max-linen-reminders (Cron) — setzen due_at (Fragezeitpunkt + 24 h) '
      || 'und status=wartet_provider'
WHERE aktion = 'provider_keine_antwort' AND schritt_nr = 1;

-- 2. Alle 5 Schritte auf umgesetzt.
UPDATE public.max_ablaeufe
SET umsetzung = 'umgesetzt'
WHERE aktion = 'provider_keine_antwort';

-- Kontrolle:
--   select schritt_nr, umsetzung, funktion
--   from public.max_ablaeufe
--   where aktion = 'provider_keine_antwort' order by schritt_nr;
-- Danach "Gegen Code pruefen" -> alle Bausteine sollten gefunden werden.
