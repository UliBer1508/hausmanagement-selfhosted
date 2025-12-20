-- Drop the old constraint
ALTER TABLE linen_orders DROP CONSTRAINT IF EXISTS linen_orders_status_check;

-- Add new constraint with all status values including 'in-progress' and 'completed'
ALTER TABLE linen_orders ADD CONSTRAINT linen_orders_status_check 
CHECK (status = ANY (ARRAY[
  'offen', 
  'pending', 
  'assigned', 
  'confirmed', 
  'in-progress',
  'completed',
  'delivered', 
  'cancelled'
]));