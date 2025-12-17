
-- Phase 1: Foreign Keys hinzufügen (korrigiert)
-- Diese Constraints erzwingen referentielle Integrität auf Datenbankebene

-- =====================================================
-- KERN-BEZIEHUNGEN
-- =====================================================

-- bookings → houses
ALTER TABLE bookings 
  ADD CONSTRAINT fk_bookings_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- service_tasks → houses, bookings, service_providers
ALTER TABLE service_tasks 
  ADD CONSTRAINT fk_service_tasks_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

ALTER TABLE service_tasks 
  ADD CONSTRAINT fk_service_tasks_booking 
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE service_tasks 
  ADD CONSTRAINT fk_service_tasks_provider 
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL;

-- linen_orders → houses, bookings, service_providers
ALTER TABLE linen_orders 
  ADD CONSTRAINT fk_linen_orders_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

ALTER TABLE linen_orders 
  ADD CONSTRAINT fk_linen_orders_booking 
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE linen_orders 
  ADD CONSTRAINT fk_linen_orders_provider 
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL;

-- =====================================================
-- REINIGUNG-BEZIEHUNGEN
-- =====================================================

-- cleaning_staff → service_providers
ALTER TABLE cleaning_staff 
  ADD CONSTRAINT fk_cleaning_staff_provider 
  FOREIGN KEY (service_provider_id) REFERENCES service_providers(id) ON DELETE SET NULL;

-- cleaning_assignments → service_tasks, cleaning_staff
ALTER TABLE cleaning_assignments 
  ADD CONSTRAINT fk_assignments_task 
  FOREIGN KEY (service_task_id) REFERENCES service_tasks(id) ON DELETE CASCADE;

ALTER TABLE cleaning_assignments 
  ADD CONSTRAINT fk_assignments_staff 
  FOREIGN KEY (cleaning_staff_id) REFERENCES cleaning_staff(id) ON DELETE SET NULL;

-- cleaning_confirmations → cleaning_assignments
ALTER TABLE cleaning_confirmations 
  ADD CONSTRAINT fk_confirmations_assignment 
  FOREIGN KEY (cleaning_assignment_id) REFERENCES cleaning_assignments(id) ON DELETE CASCADE;

-- cleaning_automation_settings → service_providers
ALTER TABLE cleaning_automation_settings 
  ADD CONSTRAINT fk_cleaning_automation_provider 
  FOREIGN KEY (default_provider_id) REFERENCES service_providers(id) ON DELETE SET NULL;

-- =====================================================
-- HAUS-KONFIGURATION BEZIEHUNGEN
-- =====================================================

-- tenant_payments → houses
ALTER TABLE tenant_payments 
  ADD CONSTRAINT fk_payments_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- linen_set_definitions → houses
ALTER TABLE linen_set_definitions 
  ADD CONSTRAINT fk_linen_defs_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- booking_linen_config → houses
ALTER TABLE booking_linen_config 
  ADD CONSTRAINT fk_booking_linen_config_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- house_inventory → houses
ALTER TABLE house_inventory 
  ADD CONSTRAINT fk_house_inventory_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- house_cleaning_instructions → houses
ALTER TABLE house_cleaning_instructions 
  ADD CONSTRAINT fk_house_cleaning_instructions_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- house_ical_sources → houses
ALTER TABLE house_ical_sources 
  ADD CONSTRAINT fk_house_ical_sources_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- =====================================================
-- WETTBEWERBER & PREISE
-- =====================================================

-- competitor_properties → houses
ALTER TABLE competitor_properties 
  ADD CONSTRAINT fk_competitor_properties_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- daily_pricing → houses, competitor_properties
ALTER TABLE daily_pricing 
  ADD CONSTRAINT fk_daily_pricing_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

ALTER TABLE daily_pricing 
  ADD CONSTRAINT fk_daily_pricing_competitor 
  FOREIGN KEY (competitor_property_id) REFERENCES competitor_properties(id) ON DELETE CASCADE;

-- =====================================================
-- GÄSTE & BUCHUNGS-BEZIEHUNGEN
-- =====================================================

-- booking_action_tracking → bookings, marketing_actions
ALTER TABLE booking_action_tracking 
  ADD CONSTRAINT fk_booking_action_booking 
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE booking_action_tracking 
  ADD CONSTRAINT fk_booking_action_action 
  FOREIGN KEY (action_id) REFERENCES marketing_actions(id) ON DELETE CASCADE;

-- guest_preferences → bookings, houses
ALTER TABLE guest_preferences 
  ADD CONSTRAINT fk_guest_preferences_booking 
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE guest_preferences 
  ADD CONSTRAINT fk_guest_preferences_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL;

-- guest_preference_responses → bookings
ALTER TABLE guest_preference_responses 
  ADD CONSTRAINT fk_guest_preference_responses_booking 
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- booking_inquiries → houses
ALTER TABLE booking_inquiries 
  ADD CONSTRAINT fk_booking_inquiries_house 
  FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE;

-- =====================================================
-- PROVIDER MESSAGING (korrigierte Spaltennamen)
-- =====================================================

-- provider_messages → service_providers, service_tasks, linen_orders
ALTER TABLE provider_messages 
  ADD CONSTRAINT fk_provider_messages_provider 
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE;

ALTER TABLE provider_messages 
  ADD CONSTRAINT fk_provider_messages_task 
  FOREIGN KEY (related_task_id) REFERENCES service_tasks(id) ON DELETE SET NULL;

ALTER TABLE provider_messages 
  ADD CONSTRAINT fk_provider_messages_order 
  FOREIGN KEY (related_linen_order_id) REFERENCES linen_orders(id) ON DELETE SET NULL;

-- linen_automation_settings → service_providers
ALTER TABLE linen_automation_settings 
  ADD CONSTRAINT fk_linen_automation_provider 
  FOREIGN KEY (default_provider_id) REFERENCES service_providers(id) ON DELETE SET NULL;

-- =====================================================
-- INDIZES FÜR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bookings_house_id ON bookings(house_id);
CREATE INDEX IF NOT EXISTS idx_service_tasks_house_id ON service_tasks(house_id);
CREATE INDEX IF NOT EXISTS idx_service_tasks_booking_id ON service_tasks(booking_id);
CREATE INDEX IF NOT EXISTS idx_service_tasks_provider_id ON service_tasks(provider_id);
CREATE INDEX IF NOT EXISTS idx_linen_orders_house_id ON linen_orders(house_id);
CREATE INDEX IF NOT EXISTS idx_linen_orders_booking_id ON linen_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_task_id ON cleaning_assignments(service_task_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_assignments_staff_id ON cleaning_assignments(cleaning_staff_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_house_id ON tenant_payments(house_id);
CREATE INDEX IF NOT EXISTS idx_competitor_properties_house_id ON competitor_properties(house_id);
CREATE INDEX IF NOT EXISTS idx_daily_pricing_house_id ON daily_pricing(house_id);
CREATE INDEX IF NOT EXISTS idx_daily_pricing_competitor_id ON daily_pricing(competitor_property_id);
CREATE INDEX IF NOT EXISTS idx_provider_messages_provider_id ON provider_messages(provider_id);
