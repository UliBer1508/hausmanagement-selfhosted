-- =============================================================================
-- 25_test_reschedule_linen_aufraeumen.sql
-- =============================================================================
-- ZWECK
--   Raeumt die Testdaten des Waesche-Reschedule-Durchlaufs (16.07.2026) weg und
--   setzt Kaloyan Zlateshkis Bestellung auf den Ursprung zurueck.
--
--   Betroffene Testbestellung:
--     linen_order_id = 519de389-15c0-4ae0-b566-e9a881729aee (Kaloyan, Venediger)
--     Ursprung VOR dem Test: status='ausstehend', delivery_date='2027-01-20'
--     Nach dem Test:          status='ausstehend', delivery_date='2027-01-22'
--
--   ⚠️  Das ist eine ECHTE Bestellung, kein Testobjekt — nur der Termin wurde zum
--       Testen verschoben. Deshalb wird sie zurueckgesetzt, nicht geloescht.
--
-- REIHENFOLGE: erst Nachrichten/Vorgaenge loeschen, dann Bestellung zuruecksetzen.
--   Das Zuruecksetzen (ausstehend->... ) loest KEINE Trigger aus, weil der
--   notify/close-Trigger nur bei offen->ausstehend feuert, nicht umgekehrt.
-- =============================================================================

-- 1. Test-Nachrichten von Teuni ("Neuer Liefertermin: 22.01.2027") loeschen.
DELETE FROM public.provider_messages
WHERE related_linen_order_id = '519de389-15c0-4ae0-b566-e9a881729aee'
  AND sender_type = 'provider'
  AND message = 'Neuer Liefertermin: 22.01.2027';

-- 2. Max' Test-Bestaetigung (notify-Trigger) loeschen.
DELETE FROM public.provider_messages
WHERE related_linen_order_id = '519de389-15c0-4ae0-b566-e9a881729aee'
  AND sender_type = 'assistant';

-- 3. Test-Vorgaenge in max_actions loeschen (Reminder + Reschedule).
DELETE FROM public.max_actions
WHERE related_linen_order_id = '519de389-15c0-4ae0-b566-e9a881729aee';

-- 4. Bestellung auf den Ursprung zuruecksetzen (Datum 20.01.2027, Status bleibt
--    ausstehend). status_changed_at/updated_at werden vom Standard-Trigger gepflegt.
UPDATE public.linen_orders
SET delivery_date = '2027-01-20'
WHERE id = '519de389-15c0-4ae0-b566-e9a881729aee';

-- =============================================================================
-- Kontrolle nach dem Einspielen — alles sauber:
--   -- Bestellung zurueckgesetzt?
--   select status, delivery_date from linen_orders
--   where id = '519de389-15c0-4ae0-b566-e9a881729aee';
--   -- erwartet: ausstehend | 2027-01-20
--
--   -- keine Test-Nachrichten mehr?
--   select count(*) from provider_messages
--   where related_linen_order_id = '519de389-15c0-4ae0-b566-e9a881729aee';
--   -- erwartet: 0
--
--   -- keine Test-Vorgaenge mehr?
--   select count(*) from max_actions
--   where related_linen_order_id = '519de389-15c0-4ae0-b566-e9a881729aee';
--   -- erwartet: 0
-- =============================================================================
