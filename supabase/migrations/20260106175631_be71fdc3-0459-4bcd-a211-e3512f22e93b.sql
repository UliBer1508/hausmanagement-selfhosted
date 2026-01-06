-- Update all existing linen_orders without provider_id to Teuni Provider
UPDATE linen_orders 
SET provider_id = 'd8110105-8ac9-45e3-ad32-aaf42393744c'
WHERE provider_id IS NULL;