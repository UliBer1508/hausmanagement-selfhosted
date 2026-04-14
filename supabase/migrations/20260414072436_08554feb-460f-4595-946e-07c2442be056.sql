ALTER TABLE public.monthly_pricing
  ADD COLUMN IF NOT EXISTS nights integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS guests_adults integer,
  ADD COLUMN IF NOT EXISTS guests_children integer,
  ADD COLUMN IF NOT EXISTS platform_source text;