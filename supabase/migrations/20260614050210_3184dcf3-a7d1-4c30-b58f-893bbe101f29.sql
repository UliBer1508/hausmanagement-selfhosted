
-- 1) rental_price_analysis: remove public SELECT, replace with admin-only
DROP POLICY IF EXISTS "rental_price_analysis_public_read" ON public.rental_price_analysis;
CREATE POLICY "rental_price_analysis_admin_read"
  ON public.rental_price_analysis
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) service_providers: replace broad authenticated policy with admin-only
DROP POLICY IF EXISTS "Authenticated users full access" ON public.service_providers;
CREATE POLICY "service_providers_admin_select"
  ON public.service_providers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_providers_admin_insert"
  ON public.service_providers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_providers_admin_update"
  ON public.service_providers
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_providers_admin_delete"
  ON public.service_providers
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) user_view_settings: drop fully-public policies, restrict to authenticated/admin
DROP POLICY IF EXISTS "Public can view settings" ON public.user_view_settings;
DROP POLICY IF EXISTS "Public can insert settings" ON public.user_view_settings;
DROP POLICY IF EXISTS "Public can update settings" ON public.user_view_settings;

CREATE POLICY "user_view_settings_auth_select"
  ON public.user_view_settings
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "user_view_settings_admin_insert"
  ON public.user_view_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_view_settings_admin_update"
  ON public.user_view_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_view_settings_admin_delete"
  ON public.user_view_settings
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
