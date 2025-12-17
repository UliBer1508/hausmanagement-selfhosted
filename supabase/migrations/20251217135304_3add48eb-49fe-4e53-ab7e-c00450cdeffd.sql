-- Phase 1i: Drop unused legacy tables (all empty, never used)
-- Note: laundry_staff is KEPT because linen_orders.assigned_staff_id references it

-- Drop laundry_confirmations first (FK to laundry_orders)
DROP TABLE IF EXISTS laundry_confirmations CASCADE;

-- Drop laundry_order_items (FK to laundry_orders)
DROP TABLE IF EXISTS laundry_order_items CASCADE;

-- Drop laundry_orders (legacy table replaced by linen_orders, 0 rows)
DROP TABLE IF EXISTS laundry_orders CASCADE;

-- Drop provider_tokens (empty, unused authentication table)
DROP TABLE IF EXISTS provider_tokens CASCADE;