-- =============================================================================
-- 23_max_provider_reply_linen.sql
-- =============================================================================
-- ZWECK
--   Erweitert den Provider-Antwort-Trigger (Datei 12) um den WAESCHE-Bezug.
--
--   Bisher schrieb max_actions_on_provider_reply nur Antworten mit
--   related_task_id fort (Reinigung/Amela). Teunis Waesche-Antworten tragen
--   aber related_linen_order_id (Fix 15.07.2026, usePortalMessages.ts) — fuer
--   die stieg der Trigger sofort aus (NEW.related_task_id IS NULL -> RETURN).
--
--   Folge OHNE diesen Fix: Antwortet Teuni zu einer Waeschebestellung, erfaehrt
--   Max es NIE — der max_actions-Vorgang wird nicht fortgeschrieben, im
--   Max-Aktionen-Fenster erscheint keine Antwort. Die Waesche-Reschedule-Kette
--   haette am ersten Schritt einen toten Punkt.
--
--   Diese Version behandelt BEIDE Bezuege:
--     related_task_id        -> max_actions.related_task_id        (Reinigung)
--     related_linen_order_id -> max_actions.related_linen_order_id (Waesche)
--   Der Reinigungs-Pfad bleibt UNVERAENDERT gegenueber Datei 12.
--
-- VERKNUEPFUNG
--   Kein Raten, keine Textsuche: die jeweilige ID verbindet Antwort und Vorgang.
--   Deshalb MUSS jede Max-Nachricht an einen Provider den passenden Bezug
--   tragen — die Portal-Hooks (usePortalMessages.ts) uebernehmen ihn automatisch
--   in die Antwort.
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.max_actions_on_provider_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row        public.max_actions%ROWTYPE;
  v_details    jsonb;
  v_verlauf    jsonb;
  v_provname   text;
  v_step       jsonb;
  v_snippet    text;
  v_found      boolean := false;
BEGIN
  -- Nur echte Provider-Antworten interessieren. Ein Bezug MUSS vorhanden sein —
  -- entweder Reinigung (related_task_id) ODER Waesche (related_linen_order_id).
  IF NEW.sender_type <> 'provider' THEN
    RETURN NEW;
  END IF;
  IF NEW.related_task_id IS NULL AND NEW.related_linen_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Passenden (neuesten) Workflow finden — je nach vorhandenem Bezug.
  -- Reinigung hat Vorrang, falls (unueblich) beide Bezuege gesetzt waeren.
  IF NEW.related_task_id IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.max_actions
    WHERE related_task_id = NEW.related_task_id
    ORDER BY created_at DESC
    LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found AND NEW.related_linen_order_id IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.max_actions
    WHERE related_linen_order_id = NEW.related_linen_order_id
    ORDER BY created_at DESC
    LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    RETURN NEW;
  END IF;

  -- Providernamen ermitteln (für den Verlaufstext).
  SELECT name INTO v_provname
  FROM public.service_providers
  WHERE id = NEW.provider_id;
  v_provname := COALESCE(v_provname, 'Dienstleister');

  -- Kurzen Auszug der Antwort bilden (max ~120 Zeichen).
  v_snippet := left(COALESCE(NEW.message, ''), 120);

  -- Verlaufsschritt zusammenbauen.
  v_details := COALESCE(v_row.details, '{}'::jsonb);
  v_verlauf := COALESCE(v_details->'verlauf', '[]'::jsonb);
  v_step := jsonb_build_object(
    'schritt', v_provname || ' hat geantwortet: ' || v_snippet,
    'zeitpunkt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'akteur', lower(v_provname)
  );
  v_verlauf := v_verlauf || v_step;
  v_details := jsonb_set(v_details, '{verlauf}', v_verlauf, true);

  UPDATE public.max_actions
  SET details     = v_details,
      status      = 'beantwortet',
      waiting_for = NULL,
      due_at      = NULL,
      last_step   = v_provname || ' hat geantwortet',
      updated_at  = now()
  WHERE id = v_row.id;

  RETURN NEW;
END;
$function$;

-- Trigger unveraendert neu setzen (haengt bereits an provider_messages) —
-- macht die Datei eigenstaendig lauffaehig.
DROP TRIGGER IF EXISTS trg_max_actions_on_provider_reply ON public.provider_messages;

CREATE TRIGGER trg_max_actions_on_provider_reply
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.max_actions_on_provider_reply();

-- =============================================================================
-- Kontrolle nach dem Einspielen: eine Teuni-Antwort mit related_linen_order_id
-- muss den zugehoerigen max_actions-Vorgang auf status='beantwortet' setzen.
-- =============================================================================
