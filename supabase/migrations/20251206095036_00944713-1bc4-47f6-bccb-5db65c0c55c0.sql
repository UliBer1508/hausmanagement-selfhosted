-- Add default_linen_color column to houses table
ALTER TABLE houses 
ADD COLUMN default_linen_color TEXT DEFAULT 'white_striped';

-- Add check constraint for valid linen color values
ALTER TABLE houses
ADD CONSTRAINT check_houses_linen_color 
CHECK (default_linen_color IN ('grey_striped', 'white_striped', 'colorful'));

-- Add linen_color column to linen_orders table  
ALTER TABLE linen_orders 
ADD COLUMN linen_color TEXT DEFAULT 'white_striped';

-- Add check constraint for valid linen color values in orders
ALTER TABLE linen_orders
ADD CONSTRAINT check_linen_orders_color 
CHECK (linen_color IN ('grey_striped', 'white_striped', 'colorful'));

-- Add comment for documentation
COMMENT ON COLUMN houses.default_linen_color IS 'Standard-Wäschefarbe für neue Bestellungen: grey_striped, white_striped, colorful';
COMMENT ON COLUMN linen_orders.linen_color IS 'Gewählte Wäschefarbe für diese Bestellung: grey_striped, white_striped, colorful';