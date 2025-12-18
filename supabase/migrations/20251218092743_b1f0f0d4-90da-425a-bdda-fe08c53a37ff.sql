-- 1. Drop the old constraint
ALTER TABLE linen_orders DROP CONSTRAINT check_linen_orders_color;

-- 2. Add the new constraint with 'grey' included
ALTER TABLE linen_orders ADD CONSTRAINT check_linen_orders_color 
  CHECK (linen_color = ANY (ARRAY['grey'::text, 'grey_striped'::text, 'white'::text, 'white_striped'::text, 'colorful'::text]));

-- 3. Update the order
UPDATE linen_orders 
SET 
  item_variants = '{"bath_mats": "grey", "sink_towels": "grey"}'::jsonb,
  linen_color = 'grey'
WHERE id = 'bbbe12a9-d0c8-49c8-88dd-773e710899fe';