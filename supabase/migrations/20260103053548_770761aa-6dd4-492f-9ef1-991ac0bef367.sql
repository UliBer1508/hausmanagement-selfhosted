-- Update existing 'bestellt' status to 'ausstehend'
UPDATE linen_orders SET status = 'ausstehend' WHERE status = 'bestellt';