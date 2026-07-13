-- =============================================================================
-- 12_max_provider_reply.sql
-- =============================================================================
-- ZWECK
--   Wenn Amela oder Teuni antwortet, wird der zugehoerige Max-Vorgang
--   automatisch fortgeschrieben: "X hat geantwortet: ..." wird an die
--   Verlaufskette angehaengt, der Status springt auf 'beantwortet'.
--
--   Das ist der EXTERNE FORTSCHREIB-PUNKT der Workflow-Kette. Ohne diesen
--   Trigger endet jede Kette bei "Amela gefragt" und waechst nie weiter —
--   Uli saehe im Max-Aktionen-Fenster nie, dass eine Antwort da ist.
--
-- VERKNUEPFUNG
--   provider_messages.related_task_id  =  max_actions.related_task_id
--   Kein Raten, keine Textsuche: die Reinigungs-ID verbindet beide Seiten.
--   Deshalb MUSS jede Max-Nachricht an einen Provider die related_task_id
--   tragen — und die Portal-Hooks (usePortalMessages.ts in Amela/Teuni)
--   uebernehmen sie automatisch in die Antwort.
--
-- NEBENWIRKUNG (bewusst)
--   Setzt waiting_for und due_at auf NULL. Damit faellt der Vorgang aus dem
--   Zugriff des Ueberfaellig-Waechters (overdue-watch) heraus — richtig, denn
--   es wurde ja geantwortet.
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
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
BEGIN
  -- Nur echte Provider-Antworten mit Aufgabenbezug interessieren.
  IF NEW.sender_type <> 'provider' OR NEW.related_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Passenden (neuesten) offenen Workflow zu dieser related_task_id finden.
  SELECT * INTO v_row
  FROM public.max_actions
  WHERE related_task_id = NEW.related_task_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
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

DROP TRIGGER IF EXISTS trg_max_actions_on_provider_reply ON public.provider_messages;

CREATE TRIGGER trg_max_actions_on_provider_reply
  AFTER INSERT ON public.provider_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.max_actions_on_provider_reply();
