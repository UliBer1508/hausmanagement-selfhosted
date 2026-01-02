-- Migration: Status-Workflow für Wäschebestellungen
-- Reihenfolge: 1. Constraint entfernen, 2. Daten migrieren, 3. Neuen Constraint erstellen

-- 1. Alten CHECK CONSTRAINT entfernen
ALTER TABLE linen_orders DROP CONSTRAINT IF EXISTS linen_orders_status_check;

-- 2. Bestehende Daten migrieren BEVOR der neue Constraint erstellt wird
-- Konvertiere alte 'pending' Status zu 'bestellt'
UPDATE linen_orders 
SET status = 'bestellt' 
WHERE status = 'pending';

-- Konvertiere alte 'in-progress', 'in_progress', 'assigned', 'confirmed' zu 'bestellt'
UPDATE linen_orders 
SET status = 'bestellt' 
WHERE status IN ('in-progress', 'in_progress', 'assigned', 'confirmed');

-- Konvertiere alte 'completed' zu 'ausstehend' (bereit zur Lieferung)
UPDATE linen_orders 
SET status = 'ausstehend' 
WHERE status = 'completed';

-- 3. Neuen CHECK CONSTRAINT mit den neuen Status-Werten erstellen
ALTER TABLE linen_orders ADD CONSTRAINT linen_orders_status_check 
CHECK (status = ANY (ARRAY['offen'::text, 'bestellt'::text, 'ausstehend'::text, 'delivered'::text, 'cancelled'::text]));