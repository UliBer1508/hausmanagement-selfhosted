-- Add hourly_rate column to service_providers table
ALTER TABLE service_providers 
ADD COLUMN hourly_rate NUMERIC(10,2);

COMMENT ON COLUMN service_providers.hourly_rate IS 'Stundensatz in EUR für Reinigungskräfte';