-- Korrektur: Bestellung für Jeroen Reedijk von "offen" auf "pending" setzen
UPDATE linen_orders 
SET status = 'pending' 
WHERE id = 'cf46799a-0bfb-4eae-a033-64ba3e6fcea7';

-- Sicherheits-Check: Alle "offen" Bestellungen mit Buchungsverknüpfung auf "pending" setzen
-- (Bestellungen mit Status "offen" sollten nur Entwürfe ohne Buchung sein)
UPDATE linen_orders 
SET status = 'pending' 
WHERE status = 'offen' 
  AND booking_id IS NOT NULL;