
-- PHASE 1: KRITISCH

ALTER TABLE public.tenant_rent_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view tenant_rent_changes" ON public.tenant_rent_changes;
DROP POLICY IF EXISTS "Admins can insert tenant_rent_changes" ON public.tenant_rent_changes;
DROP POLICY IF EXISTS "Admins can update tenant_rent_changes" ON public.tenant_rent_changes;
DROP POLICY IF EXISTS "Admins can delete tenant_rent_changes" ON public.tenant_rent_changes;

CREATE POLICY "Admins can view tenant_rent_changes" ON public.tenant_rent_changes FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert tenant_rent_changes" ON public.tenant_rent_changes FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update tenant_rent_changes" ON public.tenant_rent_changes FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tenant_rent_changes" ON public.tenant_rent_changes FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
DROP POLICY IF EXISTS "house_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "house_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "house_images_admin_delete" ON storage.objects;

CREATE POLICY "house_images_admin_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "house_images_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "house_images_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));

-- PHASE 2: PERMISSIVE POLICIES HÄRTEN

DROP POLICY IF EXISTS "Allow all operations during development" ON public.monthly_pricing;
DROP POLICY IF EXISTS "monthly_pricing_public_read" ON public.monthly_pricing;
DROP POLICY IF EXISTS "monthly_pricing_admin_write" ON public.monthly_pricing;
DROP POLICY IF EXISTS "monthly_pricing_admin_update" ON public.monthly_pricing;
DROP POLICY IF EXISTS "monthly_pricing_admin_delete" ON public.monthly_pricing;
CREATE POLICY "monthly_pricing_public_read" ON public.monthly_pricing FOR SELECT USING (true);
CREATE POLICY "monthly_pricing_admin_write" ON public.monthly_pricing FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "monthly_pricing_admin_update" ON public.monthly_pricing FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "monthly_pricing_admin_delete" ON public.monthly_pricing FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Allow all access to rental_price_analysis" ON public.rental_price_analysis;
DROP POLICY IF EXISTS "rental_price_analysis_public_read" ON public.rental_price_analysis;
DROP POLICY IF EXISTS "rental_price_analysis_admin_write" ON public.rental_price_analysis;
DROP POLICY IF EXISTS "rental_price_analysis_admin_update" ON public.rental_price_analysis;
DROP POLICY IF EXISTS "rental_price_analysis_admin_delete" ON public.rental_price_analysis;
CREATE POLICY "rental_price_analysis_public_read" ON public.rental_price_analysis FOR SELECT USING (true);
CREATE POLICY "rental_price_analysis_admin_write" ON public.rental_price_analysis FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rental_price_analysis_admin_update" ON public.rental_price_analysis FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "rental_price_analysis_admin_delete" ON public.rental_price_analysis FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view app reviews" ON public.app_reviews;
DROP POLICY IF EXISTS "app_reviews_admin_select" ON public.app_reviews;
CREATE POLICY "app_reviews_admin_select" ON public.app_reviews FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.app_reviews_public WITH (security_invoker = on) AS
SELECT id, booking_id, rating, feedback_text, preferred_language, submitted_from_screen, created_at
FROM public.app_reviews;
GRANT SELECT ON public.app_reviews_public TO anon, authenticated;

-- PHASE 3: FUNKTIONEN HÄRTEN

REVOKE EXECUTE ON FUNCTION public.delete_booking_cascade(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_dynamic_price(uuid, date, numeric, jsonb, numeric, numeric, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_database_size() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_all_table_rows() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.track_token_usage(text) FROM anon, authenticated, public;

ALTER FUNCTION public.update_linen_orders_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_house_inventory_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_marketing_actions_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_portal_token(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ai_linen_settings_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_booking_card_config_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_alpine_region() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_external_article_mapping_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_competitor_properties_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_daily_pricing_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_price_scraping_config_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_database_size() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_all_table_rows() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_recommendation_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_draft_invoice_for_linen_order() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_provider_portal_token(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_provider_portal_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_laundry_order_items_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_linen_transactions_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_guest_from_booking() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_linen_set_definitions_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_monthly_pricing_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_linen_inventory_to_houses() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_additional_fees_to_houses() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_amenities_to_houses() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_dynamic_price(uuid, date, numeric, jsonb, numeric, numeric, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_utility_tables_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.track_token_usage(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
