-- Update cleaning_automation_settings CHECK constraint for schedule_timing
-- Entfernen alte CHECK constraint und neue mit nur on_checkin und on_checkout erstellen

ALTER TABLE cleaning_automation_settings 
  DROP CONSTRAINT IF EXISTS cleaning_automation_settings_schedule_timing_check;

ALTER TABLE cleaning_automation_settings 
  ADD CONSTRAINT cleaning_automation_settings_schedule_timing_check 
  CHECK (schedule_timing IN ('on_checkin', 'on_checkout'));

-- Bestehende Werte aktualisieren falls nötig
UPDATE cleaning_automation_settings 
SET schedule_timing = 'on_checkin' 
WHERE schedule_timing NOT IN ('on_checkin', 'on_checkout');