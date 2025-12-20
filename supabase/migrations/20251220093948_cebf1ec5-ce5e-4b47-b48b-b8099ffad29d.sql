-- Add status change tracking columns to service_tasks
ALTER TABLE service_tasks 
  ADD COLUMN IF NOT EXISTS status_changed_by TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Add status change tracking columns to linen_orders
ALTER TABLE linen_orders 
  ADD COLUMN IF NOT EXISTS status_changed_by TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_service_tasks_status_changed ON service_tasks(status_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_linen_orders_status_changed ON linen_orders(status_changed_at DESC);