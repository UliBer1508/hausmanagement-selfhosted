-- =============================================================================
-- 65_gaestezahl_info_im_chat.sql
-- Gästezahl-Änderung: Info an Teuni zusätzlich als Chat-Nachricht
-- Stand 06.10.2026
-- =============================================================================
--
-- Ausführung im Supabase-SQL-Editor, Teil für Teil (markieren + ausführen).
-- NICHT `supabase db push` (Migrations-Historie seit Lovable desynchron).
--
-- WARUM (Uli-Entscheidung 06.10.2026)
--
-- Zwei Arten von Information an die Portal-Inhaber:
--   a) NUR INFO              -> Pop-up im Portal (schließbar, ohne Pflicht-Klick)
--                               UND zusätzlich als Nachricht im Chat abgelegt,
--                               damit Uli und der Dienstleister es nachlesen können.
--   b) BESTÄTIGUNG NÖTIG     -> läuft über den Chat (Terminfrage mit Bezug).
--
-- Die Gästezahl-Änderung ist Fall a). Bis heute erschien sie nur als
-- Pflicht-Pop-up im Teuni-Portal. Nach dem Bestätigen war sie im Portal
-- verschwunden, im Chat stand nie etwas — Uli sah nicht, dass Teuni informiert
-- worden war (Anlass: Tal Yehuda, 7 Änderungen im September, nur in der
-- Datenbank nachweisbar).
--
-- Neue Bestellungen und anstehende Lieferungen sieht Teuni in ihrer
-- Bestellliste. Sie bekommen weiter ein Info-Pop-up (schließbar, ohne
-- Bestätigung), aber KEINE Chat-Nachricht — und erst, wenn die Bestellung für
-- Teuni sichtbar ist (fresh-spin-portal-selfhosted, 06.10.2026).
--
-- WAS SICH ÄNDERT
--
-- 1. Bedingung: Hinweis nur noch, wenn Teuni die Bestellung SIEHT —
--    Status 'ausstehend', 'pending', 'delivered', 'geliefert'
--    (= Sichtbarkeitsliste des Teuni-Portals, useBookings.ts).
--    Vorher: 'offen','ausstehend','pending','bestaetigt','bestätigt'.
--      - 'offen' raus: noch nicht von Uli freigegeben, für Teuni unsichtbar;
--        bei der Freigabe stimmt die Menge bereits.
--      - 'delivered' rein: nach der Lieferung muss Teuni ggf. nachliefern
--        (oder weniger abholen) — gerade dann ist die Info wichtig.
-- 2. Zusätzlich eine Chat-Nachricht als "Max (Assistent)" (sender_type
--    'assistant') mit Bezug related_linen_order_id. Sie erwartet KEINE Antwort
--    und legt KEINEN max_actions-Vorgang an.
-- 3. Bündelung: Ändert sich die Gästezahl derselben Buchung innerhalb von
--    30 Minuten erneut, wird die bestehende Nachricht aktualisiert statt einer
--    neuen (Tal Yehuda am 11.09.2026: 7→8→7→9→7 in fünf Minuten).
--    Dafür merkt sich jeder Hinweis die Nachricht in chat_message_id.
--
-- SICHERHEIT: Der Chat-Teil steckt in einem eigenen BEGIN/EXCEPTION-Block.
-- Schlägt er fehl, wird nur gewarnt — die Änderung der Buchung läuft immer
-- durch.
--
-- Herkunft der Funktion: angelegt per Migration im Teuni-Repo
-- (fresh-spin-portal-selfhosted/supabase/migrations/20260618120530_…sql).
-- Diese Datei ersetzt die Funktion vollständig (CREATE OR REPLACE).
--
-- Keine neue Tabelle -> keine GRANTs nötig (Regel ab 30.10.2026 greift nicht).
-- Die neue Spalte erbt die Rechte der bestehenden Tabelle.
-- =============================================================================


-- =============================================================================
-- TEIL 0 — VORHER PRÜFEN (nur lesen)
-- =============================================================================
-- Live-Fassung ansehen. Erwartet: Statusliste
-- ('offen','ausstehend','pending','bestaetigt','bestätigt') und nur EIN INSERT
-- in booking_change_notifications. Weicht sie ab: NICHT weitermachen,
-- Ausgabe an Claude.

select pg_get_functiondef('public.notify_booking_guest_count_change'::regproc);


-- =============================================================================
-- TEIL A — Spalte für die Bündelung
-- =============================================================================

alter table public.booking_change_notifications
  add column if not exists chat_message_id uuid
  references public.provider_messages(id) on delete set null;

comment on column public.booking_change_notifications.chat_message_id is
  'Chat-Nachricht (provider_messages), in der dieser Hinweis steht. Mehrere Hinweise derselben Buchung innerhalb von 30 Minuten teilen sich eine Nachricht (SQL 65).';


-- =============================================================================
-- TEIL B — Trigger-Funktion ersetzen
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_booking_guest_count_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        record;   -- sichtbare Wäschebestellung dieser Buchung
  v_notif_id     uuid;     -- eben angelegter Hinweis
  v_prev_msg     uuid;     -- Nachricht eines Hinweises der letzten 30 Minuten
  v_alt          text;     -- Gästezahl VOR der ersten Änderung im Bündel
  v_gast         text;
  v_haus         text;
  v_anreise      text;
  v_provider     text;
  v_text         text;
  v_msg_id       uuid;
BEGIN
  IF NEW.number_of_guests IS NOT DISTINCT FROM OLD.number_of_guests THEN
    RETURN NEW;
  END IF;

  -- Nur wenn Teuni die Bestellung sieht (Sichtbarkeitsliste des Teuni-Portals).
  SELECT lo.id, lo.provider_id
    INTO v_order
    FROM public.linen_orders lo
   WHERE lo.booking_id = NEW.id
     AND lo.status IN ('ausstehend', 'pending', 'delivered', 'geliefert')
   ORDER BY lo.created_at DESC
   LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Hinweis für das Pop-up (wie bisher)
  INSERT INTO public.booking_change_notifications (booking_id, change_type, old_value, new_value)
  VALUES (NEW.id, 'guest_count', OLD.number_of_guests::text, NEW.number_of_guests::text)
  RETURNING id INTO v_notif_id;

  -- 2) Dieselbe Info im Chat — darf die Buchung NIE blockieren.
  BEGIN
    IF v_order.provider_id IS NULL THEN
      RETURN NEW;   -- ohne Dienstleister kein Chat-Empfänger
    END IF;

    SELECT g.name INTO v_gast FROM public.guests g WHERE g.id = NEW.guest_id;
    SELECT h.name INTO v_haus FROM public.houses h WHERE h.id = NEW.house_id;
    SELECT sp.name INTO v_provider FROM public.service_providers sp WHERE sp.id = v_order.provider_id;
    v_anreise := to_char((NEW.check_in AT TIME ZONE 'Europe/Berlin')::date, 'DD.MM.YYYY');

    -- Gibt es zu dieser Buchung eine Info-Nachricht aus den letzten 30 Minuten?
    SELECT n.chat_message_id INTO v_prev_msg
      FROM public.booking_change_notifications n
     WHERE n.booking_id = NEW.id
       AND n.id <> v_notif_id
       AND n.chat_message_id IS NOT NULL
       AND n.created_at > now() - interval '30 minutes'
     ORDER BY n.created_at DESC
     LIMIT 1;

    IF v_prev_msg IS NOT NULL THEN
      -- Ausgangswert = Gästezahl vor der ERSTEN Änderung dieses Bündels
      SELECT n.old_value INTO v_alt
        FROM public.booking_change_notifications n
       WHERE n.chat_message_id = v_prev_msg
       ORDER BY n.created_at ASC
       LIMIT 1;
    ELSE
      v_alt := OLD.number_of_guests::text;
    END IF;

    IF v_alt IS NOT DISTINCT FROM NEW.number_of_guests::text THEN
      v_text := format(
        'Hallo %s, Info von Max: Die Gästezahl für %s im %s (Anreise %s) wurde kurz geändert und steht jetzt wieder auf %s. Für die Wäsche ändert sich nichts. Keine Antwort nötig.',
        coalesce(v_provider, 'Teuni'), coalesce(nullif(trim(v_gast), ''), 'die Buchung'),
        coalesce(v_haus, 'Haus'), v_anreise, NEW.number_of_guests);
    ELSE
      v_text := format(
        'Hallo %s, Info von Max: Die Gästezahl für %s im %s (Anreise %s) hat sich von %s auf %s geändert. Bitte berücksichtige das bei der Lieferung. Keine Antwort nötig.',
        coalesce(v_provider, 'Teuni'), coalesce(nullif(trim(v_gast), ''), 'die Buchung'),
        coalesce(v_haus, 'Haus'), v_anreise, v_alt, NEW.number_of_guests);
    END IF;

    IF v_prev_msg IS NOT NULL THEN
      UPDATE public.provider_messages
         SET message    = v_text,
             is_read    = false,
             created_at = now()      -- rückt im Chat nach unten, wird neu gesehen
       WHERE id = v_prev_msg
      RETURNING id INTO v_msg_id;
    END IF;

    IF v_msg_id IS NULL THEN
      -- Kein Bündel (oder Nachricht inzwischen gelöscht): neue Nachricht.
      -- Bezug related_linen_order_id: antwortet Teuni trotzdem, hängt ihre
      -- Antwort an dieser Bestellung (usePortalMessages übernimmt den Bezug).
      INSERT INTO public.provider_messages
        (provider_id, sender_type, message, related_linen_order_id, is_read)
      VALUES
        (v_order.provider_id, 'assistant', v_text, v_order.id, false)
      RETURNING id INTO v_msg_id;
    END IF;

    UPDATE public.booking_change_notifications
       SET chat_message_id = v_msg_id
     WHERE id = v_notif_id;

  EXCEPTION WHEN others THEN
    RAISE WARNING 'notify_booking_guest_count_change (Chat): % (Buchung %)', sqlerrm, NEW.id;
  END;

  RETURN NEW;
END;
$$;

-- Der Trigger selbst bleibt unverändert:
--   trg_notify_booking_guest_count_change AFTER UPDATE OF number_of_guests ON bookings
-- CREATE OR REPLACE tauscht nur die Funktion.


-- =============================================================================
-- TEIL C — Ablauf-Beschreibung (max_ablaeufe, Anzeige "Max: Abläufe")
-- =============================================================================

UPDATE public.max_ablaeufe
SET schritt    = 'Teuni wird automatisch informiert: Info-Pop-up im Portal (schließbar) + Info-Nachricht im Chat',
    funktion   = 'DB-Trigger trg_notify_booking_guest_count_change (Funktion notify_booking_guest_count_change) -> booking_change_notifications (Pop-up) + provider_messages (Chat, sender_type assistant, Bündelung 30 Min.). Nur bei für Teuni sichtbarer Bestellung (ausstehend/pending/delivered). Keine Antwort nötig.',
    notiz      = 'Uli-Entscheidung 06.10.2026: Info-Fälle stehen zusätzlich im Chat (SQL 65). Vorher nur Pflicht-Pop-up (28.09.2026).',
    updated_at = now()
WHERE aktion = 'update_linen_for_booking' AND variante = 'standard' AND schritt_nr = 4;


-- =============================================================================
-- KONTROLLE
-- =============================================================================
-- 1. Neue Fassung aktiv (muss true liefern):
--    select position('provider_messages' in pg_get_functiondef('public.notify_booking_guest_count_change'::regproc)) > 0;
--
-- 2. Nach der nächsten Gästezahl-Änderung (Bestellung "ausstehend"):
--    select n.created_at, n.old_value, n.new_value, m.message
--    from booking_change_notifications n
--    left join provider_messages m on m.id = n.chat_message_id
--    order by n.created_at desc limit 5;
--    Erwartet: Nachricht gefüllt; sie erscheint im Teuni-Chat und bei Uli
--    unter Messaging → Teuni.
--
-- 3. Ablauf-Schritt:
--    select schritt_nr, schritt, funktion from max_ablaeufe
--    where aktion = 'update_linen_for_booking' order by schritt_nr;
-- =============================================================================
