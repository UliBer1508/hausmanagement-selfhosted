-- =============================================================================
-- 24_max_ablaeufe_reschedule_linen_finalisieren.sql
-- =============================================================================
-- ZWECK
--   Zwei Nachtraege an der Definition reschedule_linen_delivery, nachdem der
--   Code vollstaendig gebaut, deployed und getestet ist:
--
--   1. Schritt 6: Trigger-NAME in der funktion-Spalte korrigieren.
--      Die Kontrollfunktion ("Gegen Code pruefen") extrahiert Objektnamen aus
--      der funktion-Spalte und sucht sie als Trigger. Der Text nannte
--      "notify_teuni_on_linen_release" — das ist aber der FUNKTIONSname. Der
--      TRIGGER heisst trg_aa_notify_teuni_on_linen_release (das 'aa'-Praefix
--      erzwingt, dass er VOR trg_close_max_action_on_linen_confirmed laeuft,
--      damit notify den offenen Vorgang sieht, bevor close ihn schliesst).
--      -> funktion-Text auf den tatsaechlichen Trigger-Namen anpassen.
--
--   2. Alle 6 Schritte von umsetzung='geplant' auf 'umgesetzt'.
--      Der Code ist gebaut und deployed; die Kontrollfunktion bestaetigt
--      Schritt 2 (read_provider_replies) und Schritt 3 (reschedule_linen_delivery).
--
-- IDEMPOTENT: kann jederzeit erneut ausgefuehrt werden.
-- =============================================================================

-- 1. Schritt 6: Trigger-Name in der funktion-Spalte praezisieren.
--    WICHTIG fuer die Kontrollfunktion (max-ablaeufe-pruefen):
--    Ihre Regex /(?:DB-)?Trigger\s+(\w+)/ nimmt das erste Wort NACH "Trigger".
--    Deshalb muss VOR JEDEM Trigger-Namen das Wort "Trigger" stehen, sonst wird
--    er nicht geprueft. Und der Name muss der ECHTE Trigger-Name sein
--    (trg_aa_... bzw. trg_close_...), weil die Suche das aa-Praefix nicht kennt.
UPDATE public.max_ablaeufe
SET funktion =
      'DB-Trigger trg_aa_notify_teuni_on_linen_release (Funktion '
      || 'notify_teuni_on_linen_release; feuert bei offen->ausstehend, nur wenn '
      || 'Teuni via related_linen_order_id gefragt hatte; aa-Praefix erzwingt Lauf '
      || 'VOR dem close-Trigger) + '
      || 'Trigger trg_close_max_action_on_linen_confirmed (Typ reschedule_linen_delivery ergaenzt)'
WHERE aktion = 'reschedule_linen_delivery' AND schritt_nr = 6;

-- 2. Alle 6 Schritte auf umgesetzt setzen (Code ist gebaut, deployed, getestet).
UPDATE public.max_ablaeufe
SET umsetzung = 'umgesetzt'
WHERE aktion = 'reschedule_linen_delivery';

-- Kontrolle nach dem Einspielen:
--   select schritt_nr, umsetzung, funktion
--   from public.max_ablaeufe
--   where aktion = 'reschedule_linen_delivery'
--   order by schritt_nr;
-- Danach im Kontrollfenster "Gegen Code pruefen" erneut laufen lassen:
--   Schritt 6 sollte den Trigger trg_aa_notify_teuni_on_linen_release finden.
