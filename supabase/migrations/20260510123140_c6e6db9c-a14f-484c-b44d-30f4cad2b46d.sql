
ALTER TABLE public.linen_automation_settings
  ADD COLUMN IF NOT EXISTS sync_transport TEXT NOT NULL DEFAULT 'rest',
  ADD COLUMN IF NOT EXISTS sync_max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS external_lieferzeit TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS external_abholzeit TEXT NOT NULL DEFAULT '10:00';

CREATE TABLE IF NOT EXISTS public.linen_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linen_order_id UUID REFERENCES public.linen_orders(id) ON DELETE CASCADE,
  transport TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  request_payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  error_message TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linen_sync_log_order ON public.linen_sync_log(linen_order_id);
CREATE INDEX IF NOT EXISTS idx_linen_sync_log_created ON public.linen_sync_log(created_at DESC);

ALTER TABLE public.linen_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read linen_sync_log"
  ON public.linen_sync_log FOR SELECT
  TO authenticated
  USING (true);
