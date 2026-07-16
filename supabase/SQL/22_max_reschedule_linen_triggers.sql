-- =============================================================================
-- 22_max_reschedule_linen_triggers.sql
-- =============================================================================
-- ZWECK
--   Schliesst die Waesche-Reschedule-Kette (Ablauf reschedule_linen_delivery)
--   auf DB-Ebene ab — das Waesche-Gegenstueck zur Reinigungs-Kette.
--
--   Zwei Trigger feuern beim selben Ereignis: linen_orders offen -> ausstehend
--   (= Ulis Freigabe eines geaenderten Liefertermins).
--
--     A) notify_teuni_on_linen_release   (NEU)
--        Informiert Teuni — aber NUR, wenn SIE die Aenderung per
--        "Neuer Liefertermin: TT.MM.JJJJ" angestossen hatte.
--        Spiegel von notify_amela_on_cleaning_release (Datei 10).
--
--     B) close_max_action_on_linen_confirmed  (ERWEITERT)
--        Schliesst jetzt auch reschedule_linen_delivery-Vorgaenge.
--        Nur der action_type-Filter wird ergaenzt.
--
-- VERKNUEPFUNG (Kernprinzip, wie bei Amela)
--   provider_messages.related_linen_order_id = linen_orders.id
--   Dadurch ist eindeutig, welche Bestellung Teuni meint. Kein Raten.
--
-- ------------------------------------------------------------------------------
-- ⚠️  TRIGGER-REIHENFOLGE — NICHT UEBERSEHEN (Option 1: ueber den Namen erzwungen)
-- ------------------------------------------------------------------------------
--   Beide Trigger haengen an linen_orders und feuern bei offen->ausstehend.
--   Postgres fuehrt gleichzeitige Trigger in ALPHABETISCHER Namensreihenfolge aus.
--
--   notify_teuni MUSS ZUERST laufen: es liest den offenen reschedule-Vorgang
--   (max_actions.status='wartet_uli'), BEVOR close ihn auf 'abgeschlossen' setzt.
--   Laeuft close zuerst, findet notify_teuni keinen offenen Vorgang mehr und
--   sendet faelschlich nichts.
--
--   DESHALB die Namen:
--     trg_aa_notify_teuni_on_linen_release      (aa... -> laeuft ZUERST)
--     trg_close_max_action_on_linen_confirmed   (c...  -> laeuft DANACH)
--   'aa' < 'c'. Das 'aa'-Praefix ist Absicht, kein Tippfehler: es erzwingt,
--   dass notify vor close laeuft. NICHT umbenennen, ohne diese Abhaengigkeit
--   zu beruecksichtigen.
-- ------------------------------------------------------------------------------
--
-- WICHTIGER UNTERSCHIED ZU AMELA — doppelt belegter Statuswechsel
--   Bei Reinigung ist draft->scheduled IMMER eine Reschedule-Freigabe.
--   Bei Waesche ist offen->ausstehend DOPPELT belegt:
--     - neue Bestellung, die Uli zum ersten Mal freigibt   (create/update)
--     - geaenderter Liefertermin, den Uli freigibt           (reschedule)
--   Damit Teuni bei einer NEUEN Bestellung nicht faelschlich eine
--   "Termin geaendert"-Nachricht bekommt, feuert notify_teuni NUR, wenn zu
--   dieser Bestellung ein OFFENER reschedule_linen_delivery-Vorgang existiert.
--
-- FAELLE (notify_teuni)
--   1. Teuni wuenschte Aenderung, Uli setzt genau ihr Datum
--        -> "Der Liefertermin wurde auf TT.MM.JJJJ geaendert. Danke!"
--   2. Teuni wuenschte Aenderung, Uli setzt ein ANDERES Datum
--        -> "Der Liefertermin konnte leider nicht geaendert werden."
--   3. Neue Bestellung (kein Reschedule-Vorgang)      -> nichts senden
--   4. Uli aendert von sich aus (keine Teuni-Antwort)  -> nichts senden
--
-- ABHAENGIGKEIT
--   Erkennt Teunis Wunsch am festen Text "Neuer Liefertermin: TT.MM.JJJJ".
--   Aendert sich dieses Format im Teuni-Portal (PortalChat.tsx), MUSS das
--   Regex hier mitgezogen werden. Sonst reisst die Kette still.
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
-- =============================================================================


-- =============================================================================
-- A) NEU: notify_teuni_on_linen_release
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_teuni_on_linen_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  last_provider_msg   record;   -- juengste Teuni-Antwort zu dieser Bestellung
  offener_reschedule  int;      -- offene reschedule_linen_delivery-Vorgaenge
  wunsch_match        text[];   -- Regex-Gruppen aus "Neuer Liefertermin: ..."
  wunsch_iso          date;     -- Teunis gewuenschtes Datum
  neues_datum_de      text;
  bestaetigungstext   text;
BEGIN
  -- Nur beim Uebergang offen -> ausstehend reagieren.
  IF NOT (OLD.status = 'offen' AND NEW.status = 'ausstehend') THEN
    RETURN NEW;
  END IF;

  -- Ohne Provider kann keine Nachricht zugestellt werden -> nichts tun.
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- SCHUTZ GEGEN DOPPELDEUTIGKEIT (offen->ausstehend gilt auch fuer neue
  -- Bestellungen): nur weitermachen, wenn zu dieser Bestellung ein OFFENER
  -- Reschedule-Vorgang existiert. Bei einer neuen Bestellung gibt es keinen.
  --
  -- Diese Abfrage MUSS laufen, BEVOR close den Vorgang schliesst — deshalb der
  -- Trigger-Name 'trg_aa_...' (siehe Kopf).
  SELECT count(*)
    INTO offener_reschedule
    FROM public.max_actions ma
   WHERE ma.related_linen_order_id = NEW.id
     AND ma.action_type = 'reschedule_linen_delivery'
     AND ma.status = 'wartet_uli';

  IF offener_reschedule = 0 THEN
    RETURN NEW;
  END IF;

  -- Juengste ANTWORT von Teuni (sender_type = 'provider') zu genau dieser Bestellung.
  SELECT pm.*
    INTO last_provider_msg
    FROM public.provider_messages pm
   WHERE pm.related_linen_order_id = NEW.id
     AND pm.sender_type = 'provider'
   ORDER BY pm.created_at DESC
   LIMIT 1;

  -- Keine Teuni-Antwort -> Teuni war nicht beteiligt -> nichts senden.
  IF last_provider_msg.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nur echte Aenderungswuensche ("Neuer Liefertermin: TT.MM.JJJJ").
  IF last_provider_msg.message !~ 'Neuer Liefertermin:\s*\d{1,2}\.\d{1,2}\.\d{4}' THEN
    RETURN NEW;
  END IF;

  -- Teunis Wunschdatum aus dem Text ziehen und in ein date wandeln.
  wunsch_match := regexp_match(last_provider_msg.message,
                              'Neuer Liefertermin:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})');
  IF wunsch_match IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    wunsch_iso := to_date(
      wunsch_match[3] || '-' || lpad(wunsch_match[2],2,'0') || '-' || lpad(wunsch_match[1],2,'0'),
      'YYYY-MM-DD'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;   -- Datum unlesbar -> lieber nichts senden als Falsches.
  END;

  -- Datum aus dem TATSAECHLICH gespeicherten delivery_date.
  neues_datum_de := to_char(NEW.delivery_date, 'DD.MM.YYYY');

  -- Vergleich: Wurde Teunis Wunsch umgesetzt?
  IF NEW.delivery_date = wunsch_iso THEN
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Liefertermin wurde auf ' || neues_datum_de || ' geändert. Danke für den Hinweis!';
  ELSE
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Liefertermin konnte leider nicht geändert werden.';
  END IF;

  -- Rueckmeldung an Teuni — mit demselben related_linen_order_id-Bezug.
  INSERT INTO public.provider_messages (
    provider_id,
    sender_type,
    message,
    related_linen_order_id,
    is_read
  ) VALUES (
    NEW.provider_id,
    'assistant',
    bestaetigungstext,
    NEW.id,
    false
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aa_notify_teuni_on_linen_release ON public.linen_orders;

CREATE TRIGGER trg_aa_notify_teuni_on_linen_release
  AFTER UPDATE OF status ON public.linen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_teuni_on_linen_release();


-- =============================================================================
-- B) ERWEITERT: close_max_action_on_linen_confirmed
--    Ergaenzt reschedule_linen_delivery im action_type-Filter.
--    Alles andere unveraendert gegenueber Datei 11.
-- =============================================================================

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
    AND action_type IN ('create_linen_for_booking', 'update_linen_for_booking', 'reschedule_linen_delivery')
    AND (
          booking_id = NEW.booking_id                              -- Normalfall
          OR (booking_id IS NULL                                    -- Altlast:
              AND details->>'booking_id' = NEW.booking_id::text)    -- nur im JSON
        );

  RETURN NEW;
END;
$function$;

-- Trigger neu setzen (haengt bereits an linen_orders) — macht die Datei
-- eigenstaendig lauffaehig. Name unveraendert, Reihenfolge zu trg_aa_... siehe Kopf.
DROP TRIGGER IF EXISTS trg_close_max_action_on_linen_confirmed ON public.linen_orders;

CREATE TRIGGER trg_close_max_action_on_linen_confirmed
  AFTER UPDATE ON public.linen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.close_max_action_on_linen_confirmed();


-- =============================================================================
-- Kontrolle nach dem Einspielen — beide Trigger auf linen_orders sichtbar,
-- alphabetisch (aa vor close):
--   select tgname from pg_trigger
--   where tgrelid = 'public.linen_orders'::regclass and not tgisinternal
--   order by tgname;
-- =============================================================================
