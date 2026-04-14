CREATE TABLE public.rental_price_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  analysis_date timestamp with time zone NOT NULL DEFAULT now(),
  avg_rent numeric,
  min_rent numeric,
  max_rent numeric,
  price_per_sqm numeric,
  comparable_count integer DEFAULT 0,
  sources jsonb DEFAULT '[]'::jsonb,
  search_params jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_price_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to rental_price_analysis" ON public.rental_price_analysis FOR ALL USING (true) WITH CHECK (true);