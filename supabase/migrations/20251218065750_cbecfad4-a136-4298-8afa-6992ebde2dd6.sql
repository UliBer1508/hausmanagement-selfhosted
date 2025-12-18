-- Entferne alle redundanten (alten) Foreign Key Constraints mit fk_* Präfix
-- Dies verhindert PGRST201-Fehler und vereinfacht Queries

-- booking_action_tracking
ALTER TABLE public.booking_action_tracking DROP CONSTRAINT IF EXISTS fk_booking_action_action;
ALTER TABLE public.booking_action_tracking DROP CONSTRAINT IF EXISTS fk_booking_action_booking;

-- booking_inquiries
ALTER TABLE public.booking_inquiries DROP CONSTRAINT IF EXISTS fk_booking_inquiries_house;

-- booking_linen_config
ALTER TABLE public.booking_linen_config DROP CONSTRAINT IF EXISTS fk_booking_linen_config_house;

-- cleaning_assignments
ALTER TABLE public.cleaning_assignments DROP CONSTRAINT IF EXISTS fk_assignments_staff;
ALTER TABLE public.cleaning_assignments DROP CONSTRAINT IF EXISTS fk_assignments_task;

-- cleaning_automation_settings
ALTER TABLE public.cleaning_automation_settings DROP CONSTRAINT IF EXISTS fk_cleaning_automation_provider;

-- cleaning_confirmations
ALTER TABLE public.cleaning_confirmations DROP CONSTRAINT IF EXISTS fk_confirmations_assignment;

-- cleaning_staff
ALTER TABLE public.cleaning_staff DROP CONSTRAINT IF EXISTS fk_cleaning_staff_provider;

-- competitor_properties
ALTER TABLE public.competitor_properties DROP CONSTRAINT IF EXISTS fk_competitor_properties_house;

-- daily_pricing
ALTER TABLE public.daily_pricing DROP CONSTRAINT IF EXISTS fk_daily_pricing_competitor;
ALTER TABLE public.daily_pricing DROP CONSTRAINT IF EXISTS fk_daily_pricing_house;

-- day_trips
ALTER TABLE public.day_trips DROP CONSTRAINT IF EXISTS fk_day_trips_activity_cache;

-- guest_preference_responses
ALTER TABLE public.guest_preference_responses DROP CONSTRAINT IF EXISTS fk_guest_preference_responses_booking;

-- guest_preferences
ALTER TABLE public.guest_preferences DROP CONSTRAINT IF EXISTS fk_guest_preferences_booking;
ALTER TABLE public.guest_preferences DROP CONSTRAINT IF EXISTS fk_guest_preferences_house;

-- house_cleaning_instructions
ALTER TABLE public.house_cleaning_instructions DROP CONSTRAINT IF EXISTS fk_house_cleaning_instructions_house;

-- house_ical_sources
ALTER TABLE public.house_ical_sources DROP CONSTRAINT IF EXISTS fk_house_ical_sources_house;

-- house_inventory
ALTER TABLE public.house_inventory DROP CONSTRAINT IF EXISTS fk_house_inventory_house;

-- linen_automation_settings
ALTER TABLE public.linen_automation_settings DROP CONSTRAINT IF EXISTS fk_linen_automation_provider;

-- linen_set_definitions
ALTER TABLE public.linen_set_definitions DROP CONSTRAINT IF EXISTS fk_linen_defs_house;

-- provider_messages
ALTER TABLE public.provider_messages DROP CONSTRAINT IF EXISTS fk_provider_messages_provider;
ALTER TABLE public.provider_messages DROP CONSTRAINT IF EXISTS fk_provider_messages_order;
ALTER TABLE public.provider_messages DROP CONSTRAINT IF EXISTS fk_provider_messages_task;

-- tenant_payments
ALTER TABLE public.tenant_payments DROP CONSTRAINT IF EXISTS fk_payments_house;