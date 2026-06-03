DROP POLICY IF EXISTS "Authenticated users full access" ON public.weather_cache;
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.weather_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access" ON public.route_cache;
ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.route_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access" ON public.activity_cache;
ALTER TABLE public.activity_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.activity_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);