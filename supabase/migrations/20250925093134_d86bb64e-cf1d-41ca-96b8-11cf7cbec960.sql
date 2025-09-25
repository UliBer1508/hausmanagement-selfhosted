-- Disable RLS and drop all policies on all tables

-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Allow read access to bookings" ON public.bookings;
DROP POLICY IF EXISTS "Allow read access to cleaning_staff" ON public.cleaning_staff;
DROP POLICY IF EXISTS "Allow reading cron job logs" ON public.cron_job_logs;
DROP POLICY IF EXISTS "Allow read access to houses" ON public.houses;
DROP POLICY IF EXISTS "Allow read access to laundry_order_items" ON public.laundry_order_items;
DROP POLICY IF EXISTS "Allow read access to laundry_orders" ON public.laundry_orders;
DROP POLICY IF EXISTS "Allow read access to laundry_staff" ON public.laundry_staff;
DROP POLICY IF EXISTS "Allow read access to service_providers" ON public.service_providers;
DROP POLICY IF EXISTS "Allow read access to service_tasks" ON public.service_tasks;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert/update roles" ON public.user_roles;

-- Disable RLS on all tables
ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_job_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

-- Also disable RLS on other tables that might have it enabled
ALTER TABLE public.activity_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alpine_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_confirmations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_cleaning_instructions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_ical_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ical_preview_edits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_confirmations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_requirements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_set_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.linen_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_places DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cache DISABLE ROW LEVEL SECURITY;