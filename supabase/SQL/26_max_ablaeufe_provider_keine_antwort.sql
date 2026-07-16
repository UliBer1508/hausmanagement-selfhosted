-- =============================================================================
-- 26_max_ablaeufe_provider_keine_antwort.sql
-- =============================================================================
-- ZWECK
--   Definiert den Ablauf "provider_keine_antwort": Wenn Amela oder Teuni 24 h
--   nach einer Frage nicht geantwortet hat, informiert Max Uli aktiv (beim
--   Chat-Oeffnen ueber die Morgen-Uebersicht) und fragt, wie vorzugehen ist.
--   Uli antwortet FREI (keine festen Optionen — wir nutzen KI), Max setzt die
--   Anweisung mit den VORHANDENEN Werkzeugen um.
--
--   Entscheidungen (Uli, 16.07.2026):
--     - Frist: stur 24 h ab Fragezeitpunkt, Wochenende mitgezaehlt.
--     - Max meldet sich beim Chat-Oeffnen aktiv (Weg A) — kein Push.
--     - Keine festgelegten Antwort-Optionen: Uli formuliert frei, Max versteht.
--     - Keine neuen Werkzeuge: Umsetzung nur mit dem, was Max schon kann
--       (send_provider_message zum Nachfragen; Vorgang abschliessen; Frist neu).
--
-- KERN-EINSICHT
--   Der Mechanismus existierte zu ~80 % bereits: due_at wird beim Fragen gesetzt,
--   overdue-watch erkennt Ablauf -> ueberfaellig, morning-summary zeigt es oben,
--   der Chat zeigt die Morgen-Uebersicht beim Oeffnen. Gebaut wird nur:
--     (1) Frist 2 Tage -> 24 h (drei Code-Stellen)
--     (2) Prompt-Regel: Max fragt aktiv nach und setzt die freie Antwort um.
--
-- WICHTIG: Dies ist NUR die Soll-Definition. Der Code (Frist-Aenderung +
--   Prompt-Block) wird ERST danach gebaut — nachdem Uli diese Definition
--   in der DB geprueft hat.
--
-- IDEMPOTENT: loescht vorhandene provider_keine_antwort-Zeilen und legt neu an.
-- =============================================================================

DELETE FROM public.max_ablaeufe WHERE aktion = 'provider_keine_antwort';

INSERT INTO public.max_ablaeufe
  (aktion, aktion_label, ausloeser, variante, schritt_nr, akteur, schritt,
   ergebnis_status, karte, umsetzung, notiz, funktion)
VALUES
  ('provider_keine_antwort', 'Keine Antwort vom Dienstleister',
   'Max hat Amela/Teuni gefragt', 'standard', 1, 'max',
   'Fragt den Dienstleister; setzt Frist (due_at) = Fragezeitpunkt + 24 h, Status wartet_provider',
   'wartet_provider', NULL, 'geplant',
   'Frist stur 24 h ab Fragezeitpunkt, Wochenende mitgezaehlt.',
   'Tool send_provider_message (bei Terminfragen im Chat) bzw. Edge Function max-cleaning-reminders / max-linen-reminders (Cron) — setzen due_at und status=wartet_provider'),

  ('provider_keine_antwort', 'Keine Antwort vom Dienstleister',
   NULL, 'standard', 2, 'system',
   'Nach Ablauf der 24 h ohne Antwort: Vorgang wird ueberfaellig',
   'ueberfaellig', NULL, 'geplant',
   'Gleiche Mechanik wie overdue_watch (bestehender Ablauf), nur mit 24-h-Frist.',
   'Edge Function overdue-watch (Cron overdue-watch-daily, 06:15): sucht max_actions status=wartet_provider mit abgelaufenem due_at -> setzt ueberfaellig'),

  ('provider_keine_antwort', 'Keine Antwort vom Dienstleister',
   NULL, 'standard', 3, 'max',
   'Beim Chat-Oeffnen: informiert Uli aktiv ueber den ueberfaelligen Vorgang und fragt, wie vorzugehen ist',
   'wartet_uli', NULL, 'geplant',
   'Der ueberfaellige Fall steht bereits ganz oben in der Morgen-Uebersicht, die beim Chat-Oeffnen automatisch erscheint. Prompt-Regel macht daraus eine aktive Nachfrage statt einer blossen Meldung.',
   'Edge Function morning-summary (zeigt ueberfaellige Vorgaenge oben) + Tool get_morning_summary + Auto-Insert beim Chat-Oeffnen (ChatAssistant.tsx) + Prompt-Regel im chat-assistant'),

  ('provider_keine_antwort', 'Keine Antwort vom Dienstleister',
   NULL, 'standard', 4, 'uli',
   'Antwortet frei, was geschehen soll (z. B. nochmal fragen, abschliessen, spaeter erneut)',
   NULL, NULL, 'geplant',
   'KEINE festen Optionen — Uli formuliert frei, Max interpretiert (Modell A: Max handelt nur nach dieser Freigabe).',
   'Uli im Chat (Freitext-Anweisung an Max)'),

  ('provider_keine_antwort', 'Keine Antwort vom Dienstleister',
   NULL, 'standard', 5, 'max',
   'Setzt Ulis Anweisung mit vorhandenen Werkzeugen um (nochmal fragen / abschliessen / Frist neu)',
   'abgeschlossen', NULL, 'geplant',
   'Keine neuen Werkzeuge. Nochmal fragen -> send_provider_message (setzt due_at neu). Abschliessen/Frist-Verlaengern -> Statusaenderung des Vorgangs. Umsetzung haengt von Ulis freier Anweisung ab.',
   'Tool send_provider_message (erneute Frage, setzt neue Frist) bzw. Statusaenderung in max_actions je nach Ulis Anweisung');

-- Kontrolle nach dem Einspielen:
--   select schritt_nr, akteur, schritt, ergebnis_status, umsetzung, funktion
--   from public.max_ablaeufe
--   where aktion = 'provider_keine_antwort'
--   order by schritt_nr;
