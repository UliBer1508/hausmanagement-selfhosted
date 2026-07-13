-- =============================================================================
-- 11_max_close_actions.sql
-- =============================================================================
-- ZWECK
--   Max eroeffnet bei jeder Handlung einen Vorgang in max_actions mit
--   status='wartet_uli'. Ohne Gegenstueck bliebe dieser Vorgang EWIG offen —
--   die Workflow-Kette im Max-Aktionen-Fenster wuerde nie abschliessen.
--
--   Diese drei Trigger schliessen den Vorgang, sobald Uli die erwartete
--   Handlung vollzogen hat. Sie sind der "Uli hat bestaetigt"-Rueckkanal.
--
-- DIE DREI ABSCHLUSS-PUNKTE
--   1. service_tasks : draft -> scheduled      (Reinigung freigegeben)
--   2. linen_orders  : offen -> ausstehend     (Waeschebestellung bestaetigt)
--   3. bookings      : guest_contact_status    (Gast kontaktiert / nicht noetig)
--
--   Jeder Trigger haengt an der Tabelle, in der Uli die Handlung vollzieht —
--   nicht an max_actions. Er greift deshalb IMMER, egal ueber welchen Weg im
--   Frontend Uli die Aenderung macht.
--
-- ------------------------------------------------------------------------------
-- ⚠️  BEKANNTE LUECKE (Stand 13.07.2026) — NICHT UEBERSEHEN
-- ------------------------------------------------------------------------------
--   Trigger 1 sucht Vorgaenge vom Typ 'create_cleaning_for_booking' ODER
--   'reschedule_cleaning'. Der Code in chat-assistant/index.ts schreibt bei
--   executeRescheduleCleaning aber KEINEN max_actions-Eintrag (verifiziert:
--   kein logMaxAction im Funktionsrumpf).
--
--   Folge: Verschiebt Max einen Termin, entsteht kein Vorgang — dieser Trigger
--   findet nichts zu schliessen. Die Kette bricht. Der Trigger ist korrekt;
--   der FEHLENDE TEIL liegt im Code, nicht hier.
--
--   -> Zu beheben in executeRescheduleCleaning (logMaxAction ergaenzen).
--      Solange das offen ist, bleibt Trigger 1 fuer Reschedule wirkungslos.
-- ------------------------------------------------------------------------------
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
-- =============================================================================


-- =============================================================================
-- 1) REINIGUNG FREIGEGEBEN  (service_tasks: draft -> scheduled)
-- =============================================================================
-- Schliesst Vorgaenge, die auf Uli warten. Vorgaenge mit status='wartet_provider'
-- werden bewusst NICHT angefasst — die haben ihren eigenen Lebenszyklus
-- (Provider antwortet -> Trigger in 12_max_provider_reply.sql).

CREATE OR REPLACE FUNCTION public.close_max_action_on_cleaning_scheduled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nur reagieren, wenn eine REINIGUNG von draft auf scheduled wechselt
  IF NEW.service_type = 'cleaning'
     AND OLD.status = 'draft'
     AND NEW.status = 'scheduled'
     AND NEW.booking_id IS NOT NULL
  THEN
    -- Den offenen Max-Vorgang zu dieser Buchung abschliessen.
    -- Nur Vorgaenge, die auf Uli warten (nicht solche, die auf einen
    -- Dienstleister warten — die haben ihren eigenen Lebenszyklus).
    UPDATE public.max_actions
    SET status     = 'abgeschlossen',
        last_step  = COALESCE(last_step, '') ||
                     CASE WHEN COALESCE(last_step, '') = '' THEN '' ELSE ' → ' END ||
                     'Uli hat auf "geplant" gesetzt',
        waiting_for = NULL,
        due_at     = NULL,
        updated_at = now()
    WHERE booking_id = NEW.booking_id
      AND status = 'wartet_uli'
      AND action_type IN ('create_cleaning_for_booking', 'reschedule_cleaning');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_close_max_action_on_cleaning_scheduled ON public.service_tasks;

CREATE TRIGGER trg_close_max_action_on_cleaning_scheduled
  AFTER UPDATE ON public.service_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.close_max_action_on_cleaning_scheduled();


-- =============================================================================
-- 2) WAESCHE BESTAETIGT  (linen_orders: offen -> ausstehend)
-- =============================================================================
-- 'offen' ist fuer Teuni unsichtbar; erst 'ausstehend' macht die Bestellung
-- fuer sie sichtbar. Dieser Wechsel IST die Bestaetigung durch Uli.
--
-- Der OR-Zweig auf details->>'booking_id' faengt Altlasten ab: fruehe
-- max_actions-Zeilen hatten die booking_id nur im JSON, nicht in der Spalte.

CREATE OR REPLACE FUNCTION public.close_max_action_on_linen_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nur beim Uebergang offen -> ausstehend (= Bestaetigung durch Uli)
  IF NOT (OLD.status = 'offen' AND NEW.status = 'ausstehend') THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS NULL THEN
    RETURN NEW;   -- Ausnahmebestellung ohne Buchung -> kein Max-Vorgang
  END IF;

  UPDATE public.max_actions
  SET status      = 'abgeschlossen',
      last_step   = COALESCE(NULLIF(last_step, ''), '') ||
                    CASE WHEN COALESCE(NULLIF(last_step, ''), '') = '' THEN '' ELSE ' -> ' END ||
                    'Uli hat auf "ausstehend" gesetzt',
      waiting_for = NULL,
      due_at      = NULL,
      updated_at  = now()
  WHERE status = 'wartet_uli'
    AND action_type IN ('create_linen_for_booking', 'update_linen_for_booking')
    AND (
          booking_id = NEW.booking_id                              -- Normalfall
          OR (booking_id IS NULL                                    -- Altlast:
              AND details->>'booking_id' = NEW.booking_id::text)    -- nur im JSON
        );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_close_max_action_on_linen_confirmed ON public.linen_orders;

CREATE TRIGGER trg_close_max_action_on_linen_confirmed
  AFTER UPDATE ON public.linen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.close_max_action_on_linen_confirmed();


-- =============================================================================
-- 3) GAST KONTAKTIERT  (bookings: guest_contact_status)
-- =============================================================================
-- Schliesst 'welcome_email'-Vorgaenge. Uli setzt den Kontakt-Status auf
-- 'contacted' (Gast angeschrieben) oder 'not_required' (nicht noetig) —
-- beides beendet den Vorgang.

CREATE OR REPLACE FUNCTION public.close_max_action_on_guest_contacted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nur reagieren, wenn der Kontakt-Status auf „erledigt" springt.
  IF NOT (
       COALESCE(OLD.guest_contact_status, 'pending') = 'pending'
       AND NEW.guest_contact_status IN ('contacted', 'not_required')
     ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.max_actions
  SET status      = 'abgeschlossen',
      last_step   = COALESCE(NULLIF(last_step, ''), '') ||
                    CASE WHEN COALESCE(NULLIF(last_step, ''), '') = '' THEN '' ELSE ' -> ' END ||
                    CASE NEW.guest_contact_status
                      WHEN 'contacted'    THEN 'Uli hat den Gast kontaktiert'
                      ELSE                     'Uli hat auf "nicht nötig" gesetzt'
                    END,
      waiting_for = NULL,
      due_at      = NULL,
      updated_at  = now()
  WHERE status = 'wartet_uli'
    AND action_type = 'welcome_email'
    AND booking_id  = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_close_max_action_on_guest_contacted ON public.bookings;

CREATE TRIGGER trg_close_max_action_on_guest_contacted
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.close_max_action_on_guest_contacted();
