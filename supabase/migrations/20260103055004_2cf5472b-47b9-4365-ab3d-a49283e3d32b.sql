-- Bereinige alle Legacy-Status in linen_orders
-- Migration: pending, bestellt, assigned → ausstehend
UPDATE linen_orders 
SET status = 'ausstehend' 
WHERE status IN ('pending', 'bestellt', 'assigned');