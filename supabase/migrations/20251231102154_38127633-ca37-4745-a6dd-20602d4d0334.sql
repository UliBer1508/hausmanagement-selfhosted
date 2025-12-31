-- RLS für booking_inquiries deaktivieren (Entwicklungsphase)
-- Gemäß Geschäftsregel A: Keine RLS während der Entwicklung

ALTER TABLE public.booking_inquiries DISABLE ROW LEVEL SECURITY;