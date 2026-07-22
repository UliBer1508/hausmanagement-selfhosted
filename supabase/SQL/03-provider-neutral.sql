-- ============================================================
-- max_ablaeufe: Reinigungsablaeufe providerneutral beschreiben
-- ============================================================
--
-- BEFUND vom 22.07.2026:
-- Die Ablaufbeschreibungen nennen durchgehend "Amela". Der Code tut das NICHT —
-- er ist laengst allgemeiner:
--
--   chat-assistant          laedt service_providers dynamisch (is_active=true),
--                           send_provider_message findet den Dienstleister ueber
--                           den Namen. Boris kommt automatisch mit.
--   max-cleaning-reminders  fragt JEDEN Provider einer Reinigung; waiting_for
--                           kennt teuni/amela/boris namentlich.
--   Trigger notify_amela_*  arbeitet ausschliesslich ueber NEW.provider_id.
--                           Wer der Provider ist, spielt keine Rolle.
--
-- service_providers enthaelt seit 21.07.2026 drei aktive Eintraege:
--   Amela (cleaning, Portal), Boris (cleaning, Portal), Teuni (laundry, Portal)
--
-- WARUM DAS EIN PROBLEM IST:
-- Die SOLL-Definition beschreibt einen engeren Zustand als die Wirklichkeit. Wer
-- sie liest, haelt Boris fuer nicht abgedeckt — und baut moeglicherweise etwas
-- ein zweites Mal, das es bereits gibt. Genau das Doppelgaenger-Muster, nur eine
-- Ebene hoeher: nicht doppelter Code, sondern doppelte Arbeit.
--
-- KEINE CODE-AENDERUNG NOETIG. Nur die Beschreibung wird nachgezogen.

-- ------------------------------------------------------------
-- (1) max_cleaning_reminders — Label und Schritte
-- ------------------------------------------------------------

UPDATE max_ablaeufe
SET aktion_label = 'Termin-Check Reinigungsdienstleister'
WHERE aktion = 'max_cleaning_reminders';

UPDATE max_ablaeufe
SET schritt = 'Fragt den zustaendigen Reinigungsdienstleister: Passt der Termin? (je Reinigung einmal)',
    notiz = 'Gilt fuer JEDEN Dienstleister, der an der Reinigung haengt (service_tasks.provider_id) — derzeit Amela und Boris. Die Funktion kennt keine feste Provider-ID; waiting_for wird aus dem Namen abgeleitet (amela/boris/teuni), damit MaxActionsPanel.tsx es lesbar anzeigt.'
WHERE aktion = 'max_cleaning_reminders'
  AND variante = 'automatik'
  AND schritt_nr = 1;

UPDATE max_ablaeufe
SET schritt = 'Fragt auch bei Reinigungen ohne Buchung: Passt der Termin? (je Reinigung einmal)',
    notiz = 'Generalreinigung Saisonende, Vorbereitung vor Saisonstart, Fensterreinigung. Kein Gastname, kein Waeschehinweis (es gibt keine Lieferung). Anlass kommt aus service_tasks.notes und ist fuer den Dienstleister sichtbar. Verifiziert 21.07.2026 im Testlauf. Gilt fuer jeden Reinigungsdienstleister, nicht nur Amela.'
WHERE aktion = 'max_cleaning_reminders'
  AND variante = 'ohne_buchung'
  AND schritt_nr = 1;

-- ------------------------------------------------------------
-- (2) reject_reschedule — Label und Schritte
-- ------------------------------------------------------------

UPDATE max_ablaeufe
SET aktion_label = 'Absage an den Reinigungsdienstleister'
WHERE aktion = 'reject_reschedule';

UPDATE max_ablaeufe
SET akteur = 'provider',
    schritt = 'Sendet Neuer Termin: <Datum>',
    funktion = 'Dienstleister im Portal: fester Button "Neuer Termin: TT.MM.JJJJ" (PortalChat.tsx, Datepicker) -> provider_messages mit related_task_id',
    notiz = 'Gleicher Weg fuer Amela und Boris — beide Portale nutzen dieselbe PortalChat-Komponente mit denselben festen Buttons.'
WHERE aktion = 'reject_reschedule'
  AND schritt_nr = 1;

UPDATE max_ablaeufe
SET schritt = 'Sendet dem Dienstleister: Termin kann leider nicht geaendert werden, setzt Reinigung zurueck',
    funktion = 'Tool reject_reschedule (sendet Absage an den zustaendigen Dienstleister mit related_task_id, setzt Reinigung zurueck auf scheduled)'
WHERE aktion = 'reject_reschedule'
  AND schritt_nr = 4;

-- ------------------------------------------------------------
-- (3) reschedule_cleaning — Schritt 1 und 6
-- ------------------------------------------------------------

UPDATE max_ablaeufe
SET schritt = 'Aenderungswunsch (Uli direkt oder Dienstleister via Portal)',
    funktion = 'Uli im Chat ODER Dienstleister im Portal (fester Button "Neuer Termin: TT.MM.JJJJ", PortalChat.tsx)'
WHERE aktion = 'reschedule_cleaning'
  AND schritt_nr = 1;

UPDATE max_ablaeufe
SET schritt = 'DB-Trigger informiert den Dienstleister nur bei echtem Wunsch; weicht Uli ab: konnte leider nicht geaendert werden',
    funktion = 'DB-Trigger trg_notify_amela_on_cleaning_release (feuert bei draft->scheduled, nur wenn der Dienstleister via related_task_id gefragt hatte)',
    notiz = 'Der Trigger heisst historisch "amela", arbeitet aber providerneutral ueber NEW.provider_id — er informiert den Dienstleister, der tatsaechlich an der Reinigung haengt (Amela oder Boris). Name absichtlich NICHT geaendert: er steht in max_ablaeufe und in der taeglichen Pruefung; eine Umbenennung waere Risiko ohne Gewinn. Kette per appendWorkflowStep fortschreiben (offen).'
WHERE aktion = 'reschedule_cleaning'
  AND schritt_nr = 6;

-- ------------------------------------------------------------
-- (4) provider_keine_antwort — Schritt 1
-- ------------------------------------------------------------

UPDATE max_ablaeufe
SET ausloeser = 'Max hat einen Dienstleister gefragt (Amela, Boris oder Teuni)'
WHERE aktion = 'provider_keine_antwort'
  AND schritt_nr = 1;

-- ------------------------------------------------------------
-- KONTROLLE (kein UPDATE — nur zum Nachsehen)
-- ------------------------------------------------------------
-- UPDATE ohne RETURNING liefert in Supabase nie Zeilen ("no rows returned" ist
-- NORMAL). Immer per SELECT nachpruefen:
--
--   select aktion, aktion_label, variante, schritt_nr, akteur, schritt
--   from max_ablaeufe
--   where aktion in ('max_cleaning_reminders','reject_reschedule',
--                    'reschedule_cleaning','provider_keine_antwort')
--   order by aktion, variante, schritt_nr;
--
-- Danach "Gegen Code pruefen" laufen lassen. Erwartung: unveraendert 0 Fehler —
-- es wurden nur Beschreibungstexte geaendert, keine Baustein-Namen.
