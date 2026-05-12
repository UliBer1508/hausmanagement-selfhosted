ALTER TABLE public.linen_automation_settings
ADD COLUMN IF NOT EXISTS teuni_stammdaten_sync_enabled boolean NOT NULL DEFAULT false;