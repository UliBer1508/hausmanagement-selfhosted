-- ============================================================
-- notify_amela_on_cleaning_release — Kommentare richtigstellen
-- ============================================================
--
-- WAS HIER GEAENDERT WIRD: NUR KOMMENTARE. Kein Zeichen der Logik.
--
-- WARUM UEBERHAUPT:
-- Die Funktion arbeitet ausschliesslich ueber NEW.provider_id — sie informiert
-- den Dienstleister, der tatsaechlich an der Reinigung haengt. Ihre Kommentare
-- sprachen jedoch durchgehend von "Amela", weil sie zu einer Zeit entstand, als
-- es nur eine Reinigungskraft gab. Seit 21.07.2026 gibt es Boris.
--
-- Wer den Code liest, haelt ihn deshalb fuer Amela-spezifisch und baut
-- moeglicherweise eine zweite Funktion fuer Boris — die es nicht braucht.
-- Irrefuehrende Kommentare sind hier gefaehrlicher als gar keine.
--
-- WARUM DER NAME BLEIBT:
-- notify_amela_on_cleaning_release steht in max_ablaeufe (reschedule_cleaning,
-- Schritt 6) und wird von der taeglichen Pruefung max-ablaeufe-pruefen gegen
-- pg_trigger abgeglichen. Eine Umbenennung muesste beide Stellen mitziehen und
-- brachte ausser einem schoeneren Namen nichts. Risiko ohne Gewinn.
--
-- WARUM CREATE OR REPLACE UND NICHT DROP/CREATE:
-- Der Trigger trg_notify_amela_on_cleaning_release zeigt auf diese Funktion.
-- CREATE OR REPLACE tauscht nur den Rumpf; der Trigger bleibt unberuehrt und
-- feuert ohne Unterbrechung weiter. Ein DROP wuerde den Trigger mitreissen.

CREATE OR REPLACE FUNCTION public.notify_amela_on_cleaning_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  last_provider_msg   record;   -- jüngste Dienstleister-Antwort zu dieser Reinigung
  wunsch_match        text[];   -- Regex-Gruppen aus "Neuer Termin: ..."
  wunsch_iso          date;     -- das vom Dienstleister gewünschte Datum
  neues_datum_de      text;
  bestaetigungstext   text;
BEGIN
  -- PROVIDERNEUTRAL (Kommentare richtiggestellt 22.07.2026):
  -- Diese Funktion gilt fuer JEDEN Reinigungsdienstleister — derzeit Amela und
  -- Boris. Nirgends steht eine feste Provider-ID; massgeblich ist allein
  -- NEW.provider_id, also wer an DIESER Reinigung haengt. Der Funktionsname
  -- stammt aus der Zeit, als es nur Amela gab, und bleibt aus Gruenden der
  -- Nachvollziehbarkeit erhalten (er steht in max_ablaeufe und in der taeglichen
  -- Pruefung).

  -- Nur beim Übergang draft -> scheduled reagieren.
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

  -- Jüngste ANTWORT des Dienstleisters (sender_type = 'provider') zu genau
  -- dieser Reinigung. related_task_id verknüpft die Nachricht eindeutig mit ihr.
  SELECT pm.*
    INTO last_provider_msg
    FROM public.provider_messages pm
   WHERE pm.related_task_id = NEW.id
     AND pm.sender_type = 'provider'
   ORDER BY pm.created_at DESC
   LIMIT 1;

  -- Keine Antwort zu dieser Reinigung -> der Dienstleister war nicht beteiligt
  -- -> nichts senden. (Uli hat den Termin also von sich aus geaendert.)
  IF last_provider_msg.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nur echte Änderungswünsche ("Neuer Termin: TT.MM.JJJJ") lösen eine
  -- Rückmeldung aus. "Ja, der Termin passt." -> kein Wunsch -> nichts senden.
  IF last_provider_msg.message !~ 'Neuer Termin:\s*\d{1,2}\.\d{1,2}\.\d{4}' THEN
    RETURN NEW;
  END IF;

  -- Wunschdatum aus dem Text ziehen (TT.MM.JJJJ) und in ein date wandeln.
  wunsch_match := regexp_match(last_provider_msg.message,
                              'Neuer Termin:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})');
  IF wunsch_match IS NULL THEN
    RETURN NEW;  -- Sicherheitsnetz (sollte durch die Prüfung oben nie eintreten).
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

  -- Datum für die Nachricht schön formatieren (aus dem TATSÄCHLICH gespeicherten Datum).
  neues_datum_de := to_char(NEW.scheduled_date, 'DD.MM.YYYY');

  -- Vergleich: Wurde der Wunsch des Dienstleisters umgesetzt?
  IF NEW.scheduled_date = wunsch_iso THEN
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Reinigungstermin wurde auf ' || neues_datum_de || ' geändert. Danke für den Hinweis!';
  ELSE
    bestaetigungstext :=
      'Hallo, ich bin Max, der KI-Assistent von Uli. ' ||
      'Der Termin konnte leider nicht geändert werden.';
  END IF;

  -- Rückmeldung an den Dienstleister, der gefragt hatte — mit demselben
  -- related_task_id-Bezug (eindeutige Zuordnung im Portal-Chat).
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

-- ------------------------------------------------------------
-- KONTROLLE
-- ------------------------------------------------------------
-- 1) Haengt der Trigger noch? (muss 1 Zeile liefern)
--
--   select tgname, tgrelid::regclass as tabelle, tgenabled
--   from pg_trigger
--   where tgname = 'trg_notify_amela_on_cleaning_release';
--
--    tgenabled = 'O' bedeutet aktiv (Origin). 'D' waere deaktiviert.
--
-- 2) Ist der neue Rumpf drin?
--
--   select prosrc like '%PROVIDERNEUTRAL%' as kommentar_aktualisiert
--   from pg_proc where proname = 'notify_amela_on_cleaning_release';
--
-- ECHTE VERIFIKATION (nicht optional): Deployed ist nicht verifiziert. Erst wenn
-- ein Dienstleister im Portal einen Terminwunsch schickt, Uli die Reinigung von
-- draft auf scheduled setzt und die Rueckmeldung im Portal ankommt, ist bewiesen,
-- dass die Funktion unveraendert arbeitet. Bis dahin gilt nur: SQL lief durch.
