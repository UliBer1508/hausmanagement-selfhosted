ALTER TABLE public.linen_set_definitions
ADD COLUMN IF NOT EXISTS linen_source text NOT NULL DEFAULT 'own';

ALTER TABLE public.linen_set_definitions
DROP CONSTRAINT IF EXISTS linen_set_definitions_linen_source_check;

ALTER TABLE public.linen_set_definitions
ADD CONSTRAINT linen_set_definitions_linen_source_check
CHECK (linen_source IN ('own', 'teuni'));