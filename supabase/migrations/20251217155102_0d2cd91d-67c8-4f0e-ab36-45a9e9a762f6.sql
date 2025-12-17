-- Ändere Default-Wert für neue Bestellungen auf 'pending'
ALTER TABLE linen_orders 
ALTER COLUMN status SET DEFAULT 'pending';