-- Entferne den doppelten Foreign Key, der PGRST201-Fehler im Amela Portal verursacht
ALTER TABLE public.bookings 
DROP CONSTRAINT fk_bookings_house;