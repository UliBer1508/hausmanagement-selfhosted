-- Entferne die redundanten (alten) Foreign Key Constraints aus service_tasks
-- Dies behebt PGRST201-Fehler im Amela Portal
ALTER TABLE public.service_tasks DROP CONSTRAINT fk_service_tasks_booking;
ALTER TABLE public.service_tasks DROP CONSTRAINT fk_service_tasks_house;
ALTER TABLE public.service_tasks DROP CONSTRAINT fk_service_tasks_provider;