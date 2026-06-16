ALTER TABLE public.linen_orders ADD COLUMN total_cost numeric(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.linen_orders.total_cost IS 'Geschätzte Wäschekosten pro Bestellung (Menge mal Stückpreis)';
