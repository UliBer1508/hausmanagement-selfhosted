-- Remove all RLS policies and disable RLS on all tables

-- Disable RLS on all tables
ALTER TABLE public.activity_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alpine_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_confirmations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_job_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_cleaning_instructions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_ical_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ical_preview_edits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_confirmations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_requirements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_set_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_places DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cache DISABLE ROW LEVEL SECURITY;

-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Allow all operations on notification preferences" ON public.notification_preferences;