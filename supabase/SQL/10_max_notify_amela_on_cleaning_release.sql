-- =============================================================================
-- 10_max_notify_amela_on_cleaning_release.sql
-- =============================================================================
-- ZWECK
--   Wenn Uli eine Reinigung von 'draft' auf 'scheduled' freigibt, wird Amela
--   automatisch informiert — ABER NUR, wenn sie diese Aenderung selbst per
--   "Neuer Termin: TT.MM.JJJJ" angestossen hatte.
--
--   Damit wird der abgestimmte Ablauf aus docs/Prozess-Reinigung-Terminaenderung.md
--   in der Datenbank durchgesetzt: die Bestaetigung geht ERST nach der Freigabe
--   raus, nie schon beim Aendern.
--
-- WARUM ALS DB-TRIGGER (und nicht im Frontend)
--   "Bei draft->scheduled ggf. Amela informieren" ist eine DATENREGEL, keine
--   UI-Regel. Der Trigger greift IMMER — egal ob Uli ueber die Chat-Karte, die
--   Reinigungsverwaltung oder anderweitig freigibt.
--
-- VERKNUEPFUNG (Kernprinzip)
--   provider_messages.related_task_id = service_tasks.id
--   Dadurch ist eindeutig, welche Reinigung Amela meint. Kein Raten.
--
-- FAELLE
--   1. Amela wuenschte Aenderung, Uli setzt genau ihr Datum
--        -> "Der Reinigungstermin wurde auf TT.MM.JJJJ geaendert. Danke!"
--   2. Amela wuenschte Aenderung, Uli setzt ein ANDERES Datum
--        -> "Der Termin konnte leider nicht geaendert werden." (ohne Datumsnennung)
--   3. Amela antwortete "Ja, der Termin passt."   -> nichts senden
--   4. Uli aendert von sich aus (keine Amela-Antwort) -> nichts senden
--
-- ABHAENGIGKEIT (WICHTIG)
--   Erkennt Amelas Wunsch am festen Text "Neuer Termin: TT.MM.JJJJ".
--   Aendert sich dieses Format im Amela-Portal (PortalChat.tsx, handleTerminChange),
--   MUSS das Regex hier mitgezogen werden. Sonst reisst die Kette still.
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_amela_on_cleaning_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  last_provider_msg   record;   -- juengste Amela-Antwort zu dieser Reinigung
  wunsch_match        text[];   -- Regex-Gruppen aus "Neuer Termin: ..."
  wunsch_iso          date;     -- Amelas gewuenschtes Datum
  neues_datum_de      text;
  bestaetigungstext   text;
BEGIN
  -- Nur beim Uebergang draft -> scheduled reagieren.
  IF NOT (OLD.status = 'draft' AND NEW.status = 'scheduled') THEN
    RETURN NEW;
  END IF;

  -- Nur Reinigungen betrachten.
  IF NEW.service_type IS DISTINCT FROM 'cleaning' THEN
    RETURN NEW;
  END IF;

  -- Ohne Provider kann keine Nachricht zugestellt werden -> nichts tun.
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Juengste ANTWORT von Amela (sender_type = 'provider') zu genau dieser Reinigung.
  -- related_task_id verknuepft die Nachricht eindeutig mit der Reinigung.
  SELECT pm.*
    INTO last_provider_msg
    FROM public.provider_messages pm
   WHERE pm.related_task_id = NEW.id
     AND pm.sender_type = 'provider'
   ORDER BY pm.created_at DESC
   LIMIT 1;

  -- Keine Amela-Antwort zu dieser Reinigung -> Amela war nicht beteiligt -> nichts senden.
  IF last_provider_msg.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nur echte Aenderungswuensche ("Neuer Termin: TT.MM.JJJJ") loesen eine Rueckmeldung aus.
  -- "Ja, der Termin passt." -> kein Aenderungswunsch -> nichts senden.
  IF last_provider_msg.message !~ 'Neuer Termin:\s*\d{1,2}\.\d{1,2}\.\d{4}' THEN
    RETURN NEW;
  END IF;

  -- Amelas Wunschdatum aus dem Text ziehen (TT.MM.JJJJ) und in ein date wandeln.
  wunsch_match := regexp_match(last_provider_msg.message,
                              'Neuer Termin:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})');
  IF wunsch_match IS NULL THEN
    RETURN NEW;  -- Sicherheitsnetz (sollte durch die Pruefung oben nie eintreten).
  END IF;

  BEGIN
    wunsch_iso := to_date(
      wunsch_match[3] || '-' || lpad(wunsch_match[2],2,'0') || '-' || lpad(wunsch_match[1],2,'0'),
      'YYYY-MM-DD'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Datum unlesbar -> lieber nichts senden als Falsches senden.
    RETURN NEW;
  END;

  -- Datum fuer die Nachricht schoen formatieren (aus dem TATSAECHLICH gespeicherten Datum).
  neues_datum_de := to_char(NEW.scheduled_date, 'DD.MM.YYYY');

  -- Vergleich: Wurde Amelas Wunsch umgesetzt?
  IF NEW.scheduled_date = wunsch_iso THEN
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Reinigungstermin wurde auf ' || neues_datum_de || ' geändert. Danke für den Hinweis!';
  ELSE
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Termin konnte leider nicht geändert werden.';
  END IF;

  -- Rueckmeldung an Amela — mit demselben related_task_id-Bezug (eindeutige Zuordnung).
  INSERT INTO public.provider_messages (
    provider_id,
    sender_type,
    message,
    related_task_id,
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

DROP TRIGGER IF EXISTS trg_notify_amela_on_cleaning_release ON public.service_tasks;

CREATE TRIGGER trg_notify_amela_on_cleaning_release
  AFTER UPDATE OF status ON public.service_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_amela_on_cleaning_release();
