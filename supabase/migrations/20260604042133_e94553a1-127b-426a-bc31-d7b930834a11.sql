
-- PART A: Drop duplicate indexes
DROP INDEX IF EXISTS public.idx_cleaning_assignments_staff_id;
DROP INDEX IF EXISTS public.idx_cleaning_assignments_task_id;
DROP INDEX IF EXISTS public.idx_competitor_properties_house_id;
DROP INDEX IF EXISTS public.idx_preference_config_parent;
DROP INDEX IF EXISTS public.idx_provider_messages_provider_id;

-- PART B: Wrap auth.uid() in (select ...) to fix auth_rls_initplan

-- user_profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (((select auth.uid()) = id) OR has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (((select auth.uid()) = id) OR has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can insert profiles" ON public.user_profiles;
CREATE POLICY "Admin can insert profiles" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = id) OR has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can delete profiles" ON public.user_profiles;
CREATE POLICY "Admin can delete profiles" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = id) OR has_role((select auth.uid()), 'admin'::app_role));

-- system_settings
DROP POLICY IF EXISTS "Admin full access" ON public.system_settings;
CREATE POLICY "Admin full access" ON public.system_settings
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- house_ical_sources
DROP POLICY IF EXISTS "Admin full access" ON public.house_ical_sources;
CREATE POLICY "Admin full access" ON public.house_ical_sources
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- booking_inquiries
DROP POLICY IF EXISTS "Admin can delete inquiries" ON public.booking_inquiries;
CREATE POLICY "Admin can delete inquiries" ON public.booking_inquiries
  FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can read inquiries" ON public.booking_inquiries;
CREATE POLICY "Admin can read inquiries" ON public.booking_inquiries
  FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can update inquiries" ON public.booking_inquiries;
CREATE POLICY "Admin can update inquiries" ON public.booking_inquiries
  FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- profiles
DROP POLICY IF EXISTS "Admin full access" ON public.profiles;
CREATE POLICY "Admin full access" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- user_roles
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id) OR has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can modify roles" ON public.user_roles;
CREATE POLICY "Admin can modify roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can update roles" ON public.user_roles;
CREATE POLICY "Admin can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin can delete roles" ON public.user_roles;
CREATE POLICY "Admin can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- tenant_payments
DROP POLICY IF EXISTS "Admin full access" ON public.tenant_payments;
CREATE POLICY "Admin full access" ON public.tenant_payments
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- linen_automation_settings
DROP POLICY IF EXISTS "Admin full access" ON public.linen_automation_settings;
CREATE POLICY "Admin full access" ON public.linen_automation_settings
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- utility_statements
DROP POLICY IF EXISTS "Admin full access" ON public.utility_statements;
CREATE POLICY "Admin full access" ON public.utility_statements
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- tenant_rent_changes
DROP POLICY IF EXISTS "Admins can view tenant_rent_changes" ON public.tenant_rent_changes;
CREATE POLICY "Admins can view tenant_rent_changes" ON public.tenant_rent_changes
  FOR SELECT TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert tenant_rent_changes" ON public.tenant_rent_changes;
CREATE POLICY "Admins can insert tenant_rent_changes" ON public.tenant_rent_changes
  FOR INSERT TO public
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update tenant_rent_changes" ON public.tenant_rent_changes;
CREATE POLICY "Admins can update tenant_rent_changes" ON public.tenant_rent_changes
  FOR UPDATE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete tenant_rent_changes" ON public.tenant_rent_changes;
CREATE POLICY "Admins can delete tenant_rent_changes" ON public.tenant_rent_changes
  FOR DELETE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- utility_costs
DROP POLICY IF EXISTS "Admin full access" ON public.utility_costs;
CREATE POLICY "Admin full access" ON public.utility_costs
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- utility_settings
DROP POLICY IF EXISTS "Admin full access" ON public.utility_settings;
CREATE POLICY "Admin full access" ON public.utility_settings
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- notification_preferences
DROP POLICY IF EXISTS "Admin full access" ON public.notification_preferences;
CREATE POLICY "Admin full access" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- boris_notification_preferences
DROP POLICY IF EXISTS "Admin full access" ON public.boris_notification_preferences;
CREATE POLICY "Admin full access" ON public.boris_notification_preferences
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- laundry_invoices
DROP POLICY IF EXISTS "Admin full access" ON public.laundry_invoices;
CREATE POLICY "Admin full access" ON public.laundry_invoices
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- house_additional_fees
DROP POLICY IF EXISTS "Admin full access" ON public.house_additional_fees;
CREATE POLICY "Admin full access" ON public.house_additional_fees
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

-- monthly_pricing
DROP POLICY IF EXISTS "monthly_pricing_admin_write" ON public.monthly_pricing;
CREATE POLICY "monthly_pricing_admin_write" ON public.monthly_pricing
  FOR INSERT TO public
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "monthly_pricing_admin_update" ON public.monthly_pricing;
CREATE POLICY "monthly_pricing_admin_update" ON public.monthly_pricing
  FOR UPDATE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "monthly_pricing_admin_delete" ON public.monthly_pricing;
CREATE POLICY "monthly_pricing_admin_delete" ON public.monthly_pricing
  FOR DELETE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- rental_price_analysis
DROP POLICY IF EXISTS "rental_price_analysis_admin_write" ON public.rental_price_analysis;
CREATE POLICY "rental_price_analysis_admin_write" ON public.rental_price_analysis
  FOR INSERT TO public
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "rental_price_analysis_admin_update" ON public.rental_price_analysis;
CREATE POLICY "rental_price_analysis_admin_update" ON public.rental_price_analysis
  FOR UPDATE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "rental_price_analysis_admin_delete" ON public.rental_price_analysis;
CREATE POLICY "rental_price_analysis_admin_delete" ON public.rental_price_analysis
  FOR DELETE TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));

-- app_reviews
DROP POLICY IF EXISTS "app_reviews_admin_select" ON public.app_reviews;
CREATE POLICY "app_reviews_admin_select" ON public.app_reviews
  FOR SELECT TO public
  USING (has_role((select auth.uid()), 'admin'::app_role));
