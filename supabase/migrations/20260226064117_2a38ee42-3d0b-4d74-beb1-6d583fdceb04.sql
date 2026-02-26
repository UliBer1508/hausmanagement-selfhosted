-- Lösche Test-Daten: "Test User" komplett

-- Alle FK-Abhängigkeiten der Buchung löschen
DELETE FROM guest_app_events WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM guest_app_sessions WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM guest_preference_responses WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM guest_saved_activities WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM activity_recommendations WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM booking_activities WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM booking_action_tracking WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM app_reviews WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM service_tasks WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';
DELETE FROM linen_orders WHERE booking_id = '35006594-9daf-421b-abfb-1faf73f5003f';

-- Buchung löschen
DELETE FROM bookings WHERE id = '35006594-9daf-421b-abfb-1faf73f5003f';

-- Guest löschen
DELETE FROM guests WHERE id = 'aec3f0aa-26d4-48ad-bc2e-1865e1afc279';