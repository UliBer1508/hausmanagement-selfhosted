-- Ändere den Default-Wert des status Feldes in linen_orders auf 'ausstehend'
ALTER TABLE linen_orders 
ALTER COLUMN status SET DEFAULT 'ausstehend';