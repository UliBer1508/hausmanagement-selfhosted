-- Erweitere order_source CHECK Constraint um 'auto_booking_lookahead'

-- 1. Entferne alten Constraint
ALTER TABLE linen_orders 
DROP CONSTRAINT IF EXISTS linen_orders_order_source_check;

-- 2. Füge neuen Constraint mit erweiterten Werten hinzu
ALTER TABLE linen_orders 
ADD CONSTRAINT linen_orders_order_source_check 
CHECK (order_source = ANY (ARRAY[
  'booking_required'::text,
  'manual'::text,
  'buffer_refill'::text,
  'auto_booking_lookahead'::text
]));