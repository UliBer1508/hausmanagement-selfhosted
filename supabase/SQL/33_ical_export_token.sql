-- =============================================================================
-- 33_ical_export_token.sql
-- =============================================================================
-- ZWECK (Phase 2 des Moduls CalendarSync)
--   Jedes Ferienhaus bekommt ein eigenes, schwer erratbares Export-Token.
--   Damit stellt unser System pro Haus einen iCal-Feed bereit, den Uli bei
--   Airbnb / VRBO / Belvilla als "anderen Kalender" einträgt. So kennen die
--   Portale die DIREKTBUCHUNGEN aus dem eigenen System und blocken sie.
--
--   Siehe Konzept: docs/Konzept-iCal-Kollisionswarnung.md (Phase 2)
--
-- WARUM EIN TOKEN?
--   Der Feed muss OHNE Login abrufbar sein (Airbnb ruft ihn anonym ab).
--   Statt Authentifizierung schützt ein geheimes Token in der URL — dasselbe
--   Muster wie `portal_token` bei den Dienstleister-Portalen.
--
-- WICHTIG (aus der Plattform-Recherche 17.07.2026):
--   - Die Export-URL muss auf `.ics` ENDEN, sonst lehnen manche Portale sie ab
--     (sie validieren die URL-Form, nicht den Inhalt).
--   - Der Feed darf beim Hinzufügen NICHT LEER sein: es muss mindestens EIN
--     zukünftiges Event enthalten sein, sonst gilt er als ungültig.
--   - Airbnb akzeptiert seit 04/2025 NUR GANZTAGES-Einträge (kein T000000).
--   - Booking.com akzeptiert seit 03/2025 keine Feeds von privaten Seiten mehr
--     -> für Booking.com funktioniert nur die Import-Richtung (Phase 1).
--
-- IDEMPOTENT: Spalte nur anlegen, falls nicht vorhanden; Tokens nur füllen,
--   wo noch keins gesetzt ist.
-- =============================================================================

-- 1) Token-Spalte anlegen
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS ical_export_token text;

COMMENT ON COLUMN public.houses.ical_export_token IS
  'Geheimes Token fuer den oeffentlichen iCal-Export-Feed (Modul CalendarSync, Phase 2). Wird in der Export-URL mitgegeben.';

-- 2) Eindeutigkeit sicherstellen (zwei Häuser duerfen nie dasselbe Token haben)
CREATE UNIQUE INDEX IF NOT EXISTS idx_houses_ical_export_token
  ON public.houses (ical_export_token)
  WHERE ical_export_token IS NOT NULL;

-- 3) Für alle FERIENHÄUSER ohne Token ein zufälliges erzeugen.
--    Kriterium wie im Bestand: rental_type = 'tourist' ODER nicht gesetzt.
--    (Dauermiet-Objekte brauchen keinen Feed — sie sind nicht auf Portalen.)
UPDATE public.houses
SET ical_export_token = encode(gen_random_bytes(24), 'hex')
WHERE ical_export_token IS NULL
  AND (rental_type = 'tourist' OR rental_type IS NULL);

-- Kontrolle nach dem Einspielen:
--   select id, name, rental_type,
--          case when ical_export_token is null then '— kein Token —'
--               else left(ical_export_token, 8) || '…' end as token
--   from public.houses
--   order by name;
