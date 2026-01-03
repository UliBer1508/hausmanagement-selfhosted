-- Storniere überschüssige offene Bestellungen pro Haus
-- Behalte nur die nächsten 3 Buchungen (sortiert nach delivery_date)
WITH ranked_orders AS (
  SELECT 
    id,
    house_id,
    ROW_NUMBER() OVER (PARTITION BY house_id ORDER BY delivery_date ASC) as rn
  FROM linen_orders
  WHERE status = 'offen'
)
UPDATE linen_orders
SET status = 'cancelled', 
    notes = COALESCE(notes || ' | ', '') || 'Auto-storniert: Überschüssige Bestellung (Limit: 3 lookahead)'
WHERE id IN (
  SELECT id FROM ranked_orders WHERE rn > 3
);