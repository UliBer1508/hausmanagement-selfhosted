-- Erweitere den Status-Constraint für linen_orders um "offen" als gültigen Status
ALTER TABLE public.linen_orders 
DROP CONSTRAINT IF EXISTS linen_orders_status_check;

ALTER TABLE public.linen_orders 
ADD CONSTRAINT linen_orders_status_check 
CHECK (status = ANY (ARRAY['offen'::text, 'pending'::text, 'assigned'::text, 'confirmed'::text, 'delivered'::text, 'cancelled'::text]));

-- Setze "offen" als Default-Status für neue Bestellungen
ALTER TABLE public.linen_orders 
ALTER COLUMN status SET DEFAULT 'offen';