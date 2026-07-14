-- =============================================================================
-- 13_max_verlaufskette.sql
-- =============================================================================
-- ZWECK
--   Die drei Abschluss-Trigger schreiben ihren Schritt bisher NUR in das
--   Textfeld `last_step` — aber NICHT in `details.verlauf`.
--
--   Folge: Das Max-Aktionen-Fenster (MaxActionsPanel.tsx) hat eine fertig
--   gebaute Kettenanzeige ([Schritt 1] → [Schritt 2] → …), die aber leer bleibt,
--   weil `verlauf` nur EINEN Eintrag hat (den von logMaxAction).
--   Der Nutzer sieht deshalb rohes JSON statt einer lesbaren Kette.
--
--   Belegt an echten Daten (14.07.2026):
--     last_step: "Termin verschoben: 16.08. → 17.08. … → Uli hat auf 'geplant' gesetzt"
--     verlauf:   [ { "Termin verschoben: 16.08. → 17.08. …" } ]      ← nur 1 Schritt!
--
-- WAS DIESE DATEI TUT
--   Alle drei Trigger hängen ihren Schritt jetzt ZUSÄTZLICH an details.verlauf an.
--   `last_step` bleibt unverändert (Abwärtskompatibilität).
--
--   Format eines Verlaufs-Eintrags (wie in logMaxAction, chat-assistant):
--     { "schritt": "…", "zeitpunkt": "2026-07-14T06:00:42Z", "akteur": "uli" }
--
-- IDEMPOTENT: CREATE OR REPLACE — jederzeit erneut ausführbar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Hilfsfunktion: hängt einen Schritt an details.verlauf an.
-- Verhindert doppelte Pflege derselben Logik an drei Stellen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.max_append_verlauf(
  p_details jsonb,
  p_schritt text,
  p_akteur  text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_set(
    COALESCE(p_details, '{}'::jsonb),
    '{verlauf}',
    COALESCE(p_details -> 'verlauf', '[]'::jsonb) ||
      jsonb_build_object(
        'schritt',   p_schritt,
        'zeitpunkt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'akteur',    p_akteur
      )
  );
$$;

COMMENT ON FUNCTION public.max_append_verlauf IS
  'Hängt einen Schritt an max_actions.details->verlauf an. Genutzt von den Abschluss-Triggern.';


-- =============================================================================
-- TRIGGER 1 — Reinigung: draft -> scheduled  (Uli gibt frei)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_max_action_on_cleaning_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.service_type = 'cleaning'
     AND OLD.status = 'draft'
     AND NEW.status = 'scheduled'
     AND NEW.booking_id IS NOT NULL
  THEN
    UPDATE public.max_actions
    SET status      = 'abgeschlossen',
        last_step   = COALESCE(last_step, '') ||
                      CASE WHEN COALESCE(last_step, '') = '' THEN '' ELSE ' → ' END ||
                      'Uli hat auf "geplant" gesetzt',
        -- NEU (14.07.2026): Schritt auch in die Verlaufskette schreiben,
        -- damit das Max-Aktionen-Fenster den Ablauf als Kette zeigen kann.
        details     = public.max_append_verlauf(
                        details,
                        'Uli hat auf "geplant" gesetzt — Reinigung ist bestätigt',
                        'uli'
                      ),
        waiting_for = NULL,
        due_at      = NULL,
        updated_at  = now()
    WHERE booking_id = NEW.booking_id
      AND status = 'wartet_uli'
      AND action_type IN ('create_cleaning_for_booking', 'reschedule_cleaning');
  END IF;

  RETURN NEW;
END;
$function$;


-- =============================================================================
-- TRIGGER 2 — Wäsche: offen -> ausstehend  (Uli gibt frei)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_max_action_on_linen_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'offen'
     AND NEW.status = 'ausstehend'
     AND NEW.booking_id IS NOT NULL
  THEN
    UPDATE public.max_actions
    SET status      = 'abgeschlossen',
        last_step   = COALESCE(NULLIF(last_step, ''), '') ||
                      CASE WHEN COALESCE(NULLIF(last_step, ''), '') = '' THEN '' ELSE ' -> ' END ||
                      'Uli hat auf "ausstehend" gesetzt',
        details     = public.max_append_verlauf(
                        details,
                        'Uli hat auf "ausstehend" gesetzt — Bestellung ist bestätigt',
                        'uli'
                      ),
        waiting_for = NULL,
        due_at      = NULL,
        updated_at  = now()
    WHERE booking_id = NEW.booking_id
      AND status = 'wartet_uli'
      AND action_type IN ('create_linen_for_booking', 'update_linen_for_booking');
  END IF;

  RETURN NEW;
END;
$function$;


-- =============================================================================
-- TRIGGER 3 — Gast kontaktiert  (guest_contact_status)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_max_action_on_guest_contacted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.guest_contact_status IS DISTINCT FROM NEW.guest_contact_status
     AND NEW.guest_contact_status = 'contacted'
  THEN
    UPDATE public.max_actions
    SET status      = 'abgeschlossen',
        last_step   = COALESCE(NULLIF(last_step, ''), '') ||
                      CASE WHEN COALESCE(NULLIF(last_step, ''), '') = '' THEN '' ELSE ' -> ' END ||
                      'Uli hat den Gast kontaktiert',
        details     = public.max_append_verlauf(
                        details,
                        'Uli hat den Gast kontaktiert',
                        'uli'
                      ),
        waiting_for = NULL,
        due_at      = NULL,
        updated_at  = now()
    WHERE booking_id = NEW.id
      AND status = 'wartet_uli'
      AND action_type = 'guest_welcome_email';
  END IF;

  RETURN NEW;
END;
$function$;


-- =============================================================================
-- ALTBESTAND NACHTRAGEN
-- =============================================================================
-- Vorgänge, die VOR diesem Fix abgeschlossen wurden, haben den Abschluss-Schritt
-- nur in `last_step` (erkennbar am " → " bzw. " -> "), nicht in `verlauf`.
-- Damit die Kette auch dort vollständig erscheint, wird er einmalig nachgetragen.
--
-- Erkennungsmerkmal: status='abgeschlossen', aber verlauf hat nur 1 Eintrag.
UPDATE public.max_actions
SET details = public.max_append_verlauf(
      details,
      CASE
        WHEN action_type IN ('create_cleaning_for_booking', 'reschedule_cleaning')
          THEN 'Uli hat auf "geplant" gesetzt — Reinigung ist bestätigt'
        WHEN action_type IN ('create_linen_for_booking', 'update_linen_for_booking')
          THEN 'Uli hat auf "ausstehend" gesetzt — Bestellung ist bestätigt'
        ELSE 'Vorgang abgeschlossen'
      END,
      'uli'
    )
WHERE status = 'abgeschlossen'
  AND jsonb_array_length(COALESCE(details -> 'verlauf', '[]'::jsonb)) = 1
  AND (last_step LIKE '%→%' OR last_step LIKE '%->%');


-- =============================================================================
-- KONTROLLE — nach dem Ausführen laufen lassen
-- =============================================================================
-- Erwartung: abgeschlossene Vorgänge haben MINDESTENS 2 Verlaufsschritte.
--
--   SELECT action_type, status, guest_name,
--          jsonb_array_length(details -> 'verlauf') AS schritte,
--          details -> 'verlauf' AS kette
--   FROM public.max_actions
--   ORDER BY created_at DESC
--   LIMIT 5;
--
-- Danach im Max-Aktionen-Fenster nachsehen: Statt rohem JSON muss dort jetzt
-- eine Kette stehen, z. B.
--   [Termin verschoben: 16.08. → 20.08.] → [Uli hat auf "geplant" gesetzt]
