-- Special drops for tables with pre-existing differently-named policies
DROP POLICY IF EXISTS "Boris staff full access" ON public.boris_cleaning_staff;
DROP POLICY IF EXISTS "Authenticated users only" ON public.local_events;
DROP POLICY IF EXISTS "Authenticated users only" ON public.market_data_cache;
DROP POLICY IF EXISTS "Authenticated users only" ON public.pricing_logs;

-- boris_cleaning_staff
DROP POLICY IF EXISTS "Authenticated users full access" ON public.boris_cleaning_staff;
ALTER TABLE public.boris_cleaning_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.boris_cleaning_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- local_events
DROP POLICY IF EXISTS "Authenticated users full access" ON public.local_events;
ALTER TABLE public.local_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.local_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- market_data_cache
DROP POLICY IF EXISTS "Authenticated users full access" ON public.market_data_cache;
ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.market_data_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pricing_logs
DROP POLICY IF EXISTS "Authenticated users full access" ON public.pricing_logs;
ALTER TABLE public.pricing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.pricing_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- email_templates
DROP POLICY IF EXISTS "Authenticated users full access" ON public.email_templates;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service_providers
DROP POLICY IF EXISTS "Authenticated users full access" ON public.service_providers;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.service_providers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- boris_card_config
DROP POLICY IF EXISTS "Authenticated users full access" ON public.boris_card_config;
ALTER TABLE public.boris_card_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.boris_card_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- trip_plans
DROP POLICY IF EXISTS "Authenticated users full access" ON public.trip_plans;
ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.trip_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cleaning_assignments
DROP POLICY IF EXISTS "Authenticated users full access" ON public.cleaning_assignments;
ALTER TABLE public.cleaning_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.cleaning_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cleaning_confirmations
DROP POLICY IF EXISTS "Authenticated users full access" ON public.cleaning_confirmations;
ALTER TABLE public.cleaning_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.cleaning_confirmations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- daily_pricing_backup
DROP POLICY IF EXISTS "Authenticated users full access" ON public.daily_pricing_backup;
ALTER TABLE public.daily_pricing_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.daily_pricing_backup FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ai_linen_settings
DROP POLICY IF EXISTS "Authenticated users full access" ON public.ai_linen_settings;
ALTER TABLE public.ai_linen_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.ai_linen_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ical_preview_edits
DROP POLICY IF EXISTS "Authenticated users full access" ON public.ical_preview_edits;
ALTER TABLE public.ical_preview_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.ical_preview_edits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- blocked_bookings
DROP POLICY IF EXISTS "Authenticated users full access" ON public.blocked_bookings;
ALTER TABLE public.blocked_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.blocked_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- saved_places
DROP POLICY IF EXISTS "Authenticated users full access" ON public.saved_places;
ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.saved_places FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- alpine_activities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.alpine_activities;
ALTER TABLE public.alpine_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.alpine_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- utility_cost_categories
DROP POLICY IF EXISTS "Authenticated users full access" ON public.utility_cost_categories;
ALTER TABLE public.utility_cost_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.utility_cost_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- vacation_trips
DROP POLICY IF EXISTS "Authenticated users full access" ON public.vacation_trips;
ALTER TABLE public.vacation_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.vacation_trips FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cron_job_logs
DROP POLICY IF EXISTS "Authenticated users full access" ON public.cron_job_logs;
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.cron_job_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- trip_activities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.trip_activities;
ALTER TABLE public.trip_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.trip_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- guest_preferences
DROP POLICY IF EXISTS "Authenticated users full access" ON public.guest_preferences;
ALTER TABLE public.guest_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.guest_preferences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- activities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.activities;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- activity_availability
DROP POLICY IF EXISTS "Authenticated users full access" ON public.activity_availability;
ALTER TABLE public.activity_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.activity_availability FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- activity_recommendations
DROP POLICY IF EXISTS "Authenticated users full access" ON public.activity_recommendations;
ALTER TABLE public.activity_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.activity_recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ai_optimization_results
DROP POLICY IF EXISTS "Authenticated users full access" ON public.ai_optimization_results;
ALTER TABLE public.ai_optimization_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.ai_optimization_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- booking_activities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.booking_activities;
ALTER TABLE public.booking_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.booking_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- weekly_pricing
DROP POLICY IF EXISTS "Authenticated users full access" ON public.weekly_pricing;
ALTER TABLE public.weekly_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.weekly_pricing FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- booking_card_config
DROP POLICY IF EXISTS "Authenticated users full access" ON public.booking_card_config;
ALTER TABLE public.booking_card_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.booking_card_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- saved_trip_plans
DROP POLICY IF EXISTS "Authenticated users full access" ON public.saved_trip_plans;
ALTER TABLE public.saved_trip_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.saved_trip_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cleaning_settings
DROP POLICY IF EXISTS "Authenticated users full access" ON public.cleaning_settings;
ALTER TABLE public.cleaning_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.cleaning_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- day_trips
DROP POLICY IF EXISTS "Authenticated users full access" ON public.day_trips;
ALTER TABLE public.day_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.day_trips FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- house_cleaning_instructions
DROP POLICY IF EXISTS "Authenticated users full access" ON public.house_cleaning_instructions;
ALTER TABLE public.house_cleaning_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.house_cleaning_instructions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- house_inventory
DROP POLICY IF EXISTS "Authenticated users full access" ON public.house_inventory;
ALTER TABLE public.house_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.house_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- laundry_staff
DROP POLICY IF EXISTS "Authenticated users full access" ON public.laundry_staff;
ALTER TABLE public.laundry_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.laundry_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- booking_action_tracking
DROP POLICY IF EXISTS "Authenticated users full access" ON public.booking_action_tracking;
ALTER TABLE public.booking_action_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.booking_action_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- marketing_actions
DROP POLICY IF EXISTS "Authenticated users full access" ON public.marketing_actions;
ALTER TABLE public.marketing_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.marketing_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- app_modules_config
DROP POLICY IF EXISTS "Authenticated users full access" ON public.app_modules_config;
ALTER TABLE public.app_modules_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.app_modules_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- guest_preference_responses
DROP POLICY IF EXISTS "Authenticated users full access" ON public.guest_preference_responses;
ALTER TABLE public.guest_preference_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.guest_preference_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- external_article_mapping
DROP POLICY IF EXISTS "Authenticated users full access" ON public.external_article_mapping;
ALTER TABLE public.external_article_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.external_article_mapping FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pricelabs_listings
DROP POLICY IF EXISTS "Authenticated users full access" ON public.pricelabs_listings;
ALTER TABLE public.pricelabs_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.pricelabs_listings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- booking_linen_config
DROP POLICY IF EXISTS "Authenticated users full access" ON public.booking_linen_config;
ALTER TABLE public.booking_linen_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.booking_linen_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- competitor_properties
DROP POLICY IF EXISTS "Authenticated users full access" ON public.competitor_properties;
ALTER TABLE public.competitor_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.competitor_properties FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- preference_configuration
DROP POLICY IF EXISTS "Authenticated users full access" ON public.preference_configuration;
ALTER TABLE public.preference_configuration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.preference_configuration FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- guest_saved_activities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.guest_saved_activities;
ALTER TABLE public.guest_saved_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.guest_saved_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- price_scraping_config
DROP POLICY IF EXISTS "Authenticated users full access" ON public.price_scraping_config;
ALTER TABLE public.price_scraping_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.price_scraping_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- price_comparison_alerts
DROP POLICY IF EXISTS "Authenticated users full access" ON public.price_comparison_alerts;
ALTER TABLE public.price_comparison_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.price_comparison_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pricelabs_market_data
DROP POLICY IF EXISTS "Authenticated users full access" ON public.pricelabs_market_data;
ALTER TABLE public.pricelabs_market_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.pricelabs_market_data FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cleaning_automation_settings
DROP POLICY IF EXISTS "Authenticated users full access" ON public.cleaning_automation_settings;
ALTER TABLE public.cleaning_automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.cleaning_automation_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- usage_reports
DROP POLICY IF EXISTS "Authenticated users full access" ON public.usage_reports;
ALTER TABLE public.usage_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.usage_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- guests
DROP POLICY IF EXISTS "Authenticated users full access" ON public.guests;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.guests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- house_linen_inventory
DROP POLICY IF EXISTS "Authenticated users full access" ON public.house_linen_inventory;
ALTER TABLE public.house_linen_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.house_linen_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- house_amenities
DROP POLICY IF EXISTS "Authenticated users full access" ON public.house_amenities;
ALTER TABLE public.house_amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.house_amenities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- daily_pricing
DROP POLICY IF EXISTS "Authenticated users full access" ON public.daily_pricing;
ALTER TABLE public.daily_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.daily_pricing FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- linen_set_definitions
DROP POLICY IF EXISTS "Authenticated users full access" ON public.linen_set_definitions;
ALTER TABLE public.linen_set_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.linen_set_definitions FOR ALL TO authenticated USING (true) WITH CHECK (true);