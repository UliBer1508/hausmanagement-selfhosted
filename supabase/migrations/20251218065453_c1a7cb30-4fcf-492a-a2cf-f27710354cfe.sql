-- Entferne die redundanten (alten) Foreign Key Constraints aus linen_orders
-- Dies ermöglicht die Anzeige von Bestellungen ohne Buchung
ALTER TABLE public.linen_orders DROP CONSTRAINT IF EXISTS fk_linen_orders_booking;
ALTER TABLE public.linen_orders DROP CONSTRAINT IF EXISTS fk_linen_orders_house;
ALTER TABLE public.linen_orders DROP CONSTRAINT IF EXISTS fk_linen_orders_provider;