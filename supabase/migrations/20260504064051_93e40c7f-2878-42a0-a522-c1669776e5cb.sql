
-- AirDNA Listings Verknüpfung pro Haus
CREATE TABLE IF NOT EXISTS public.airdna_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  airdna_property_id text,
  airdna_market_id text,
  location_normalized text,
  last_synced_at timestamptz,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (house_id, airdna_property_id)
);

CREATE INDEX IF NOT EXISTS idx_airdna_listings_house ON public.airdna_listings(house_id);

ALTER TABLE public.airdna_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "airdna_listings_all_authenticated"
ON public.airdna_listings FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_airdna_listings_updated_at
BEFORE UPDATE ON public.airdna_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- pg_cron + pg_net für Cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
