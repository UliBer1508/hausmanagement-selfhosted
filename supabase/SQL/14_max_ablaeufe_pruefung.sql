-- =============================================================================
-- 14_max_ablaeufe_pruefung.sql
-- =============================================================================
-- ZWECK
--   Die Tabelle max_ablaeufe hatte KEINEN Bezug zur Wirklichkeit:
--
--     - `umsetzung` wurde VON HAND gesetzt. Uli klickte "umgesetzt" — niemand
--       prüfte, ob es stimmt. Eine Behauptung ohne Deckung.
--     - `funktion` ist reiner Text. Steht dort "Tool search_bookings", weiß
--       niemand, ob dieses Tool überhaupt (noch) existiert.
--     - `notiz` sagt Dinge wie "vermutlich gleiche Lücke" — seit dem 11.07.
--       ungeprüft.
--
--   Belegt: Der System-Prompt verwies bis zum 14.07.2026 auf
--   `create_bulk_cleaning_tasks` — stillgelegt am 12.07. VIER TAGE lang stand
--   dort eine Anweisung ins Leere, ohne dass etwas anschlug.
--
-- WAS DIESE DATEI TUT
--   1. Drei Spalten für den PRÜFBEFUND (nicht für Behauptungen):
--        geprueft_am     — wann zuletzt geprüft
--        geprueft_status — ok / fehler / kein_code
--        geprueft_befund — was genau geprüft wurde, oder was fehlt
--
--   2. Eine Funktion, die alle DB-Trigger auflistet — damit die Edge Function
--      `max-ablaeufe-pruefen` sie gegen die Tabelle abgleichen kann.
--
--   Ab dann gilt: `umsetzung` = was Uli WILL. `geprueft_status` = was WIRKLICH
--   da ist. Weichen sie ab, sieht man es sofort.
--
-- IDEMPOTENT: jederzeit erneut ausführbar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Prüf-Spalten
-- -----------------------------------------------------------------------------
ALTER TABLE public.max_ablaeufe
  ADD COLUMN IF NOT EXISTS geprueft_am     timestamptz,
  ADD COLUMN IF NOT EXISTS geprueft_status text,
  ADD COLUMN IF NOT EXISTS geprueft_befund text;

COMMENT ON COLUMN public.max_ablaeufe.geprueft_am IS
  'Wann die Edge Function max-ablaeufe-pruefen diese Zeile zuletzt gegen den Code geprüft hat.';
COMMENT ON COLUMN public.max_ablaeufe.geprueft_status IS
  'ok = alle genannten Bausteine existieren | fehler = etwas fehlt | kein_code = menschlicher Schritt, nichts zu prüfen. NICHT von Hand setzen — wird von der Prüfung geschrieben.';
COMMENT ON COLUMN public.max_ablaeufe.geprueft_befund IS
  'Was geprüft wurde, oder was fehlt. Von der Prüfung geschrieben.';

COMMENT ON COLUMN public.max_ablaeufe.umsetzung IS
  'Was Uli WILL (umgesetzt / pruefen / fehlt / vorbereitet) — eine Absicht, keine Tatsache. Die Tatsache steht in geprueft_status.';


-- -----------------------------------------------------------------------------
-- 2. Trigger-Liste für die Prüfung
--    Eine Edge Function kann pg_trigger nicht direkt abfragen — deshalb diese
--    Funktion als Zugang.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.max_pruefe_trigger_liste()
RETURNS TABLE (trigger_name text, tabelle text, funktion text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT
    t.tgname::text        AS trigger_name,
    c.relname::text       AS tabelle,
    p.proname::text       AS funktion
  FROM pg_trigger t
  JOIN pg_class     c ON c.oid = t.tgrelid
  JOIN pg_proc      p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND n.nspname = 'public';
$$;

COMMENT ON FUNCTION public.max_pruefe_trigger_liste IS
  'Listet alle DB-Trigger im Schema public. Genutzt von der Edge Function max-ablaeufe-pruefen, um die Angaben in max_ablaeufe.funktion gegen die Wirklichkeit abzugleichen.';

GRANT EXECUTE ON FUNCTION public.max_pruefe_trigger_liste() TO service_role;


-- =============================================================================
-- KONTROLLE — nach dem ersten Lauf der Prüfung
-- =============================================================================
-- Wo behauptet die Tabelle etwas, das nicht stimmt?
--
--   SELECT aktion_label, variante, schritt_nr,
--          umsetzung        AS behauptet,
--          geprueft_status  AS tatsaechlich,
--          geprueft_befund
--   FROM public.max_ablaeufe
--   WHERE geprueft_status = 'fehler'
--   ORDER BY aktion, variante, schritt_nr;
--
-- Erwartung beim ersten Lauf: reject_reschedule schlägt an — dort steht
-- "Tool reject_reschedule -- MUSS GEBAUT WERDEN", und das Tool existiert nicht.
--
-- Und: Wo sagt Uli "umgesetzt", die Prüfung aber "fehler"?
--
--   SELECT aktion_label, schritt_nr, umsetzung, geprueft_status, geprueft_befund
--   FROM public.max_ablaeufe
--   WHERE umsetzung = 'umgesetzt' AND geprueft_status = 'fehler';
--
-- Das sind die gefährlichen Fälle: Uli glaubt, es sei fertig — es ist es nicht.
