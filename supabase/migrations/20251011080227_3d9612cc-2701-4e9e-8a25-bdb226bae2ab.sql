-- Migration: Amela als Reinigungskraft für abgeschlossene Reinigungen eintragen
-- und Zahlungsstatus setzen (außer 11.10.2025)

-- 1. Alle abgeschlossenen Reinigungen: Amela als assigned_staff_id setzen
UPDATE service_tasks
SET 
  assigned_staff_id = '369769c9-2594-4687-85c6-e52b49e605c5',
  updated_at = NOW()
WHERE service_type = 'cleaning' 
  AND status = 'completed';

-- 2. Alle abgeschlossenen Reinigungen auf 'paid' setzen (außer 11.10.2025)
UPDATE service_tasks
SET 
  payment_status = 'paid',
  updated_at = NOW()
WHERE service_type = 'cleaning' 
  AND status = 'completed'
  AND scheduled_date != '2025-10-11';

-- 3. Explizit die Reinigung vom 11.10.2025 auf 'unpaid' setzen
UPDATE service_tasks
SET 
  payment_status = 'unpaid',
  updated_at = NOW()
WHERE service_type = 'cleaning' 
  AND status = 'completed'
  AND scheduled_date = '2025-10-11';

-- 4. Cleaning Assignments für alle abgeschlossenen Reinigungen erstellen
DO $$
DECLARE
  task_record RECORD;
BEGIN
  FOR task_record IN 
    SELECT id, scheduled_date, scheduled_time, completed_at
    FROM service_tasks
    WHERE service_type = 'cleaning' 
      AND status = 'completed'
      AND assigned_staff_id = '369769c9-2594-4687-85c6-e52b49e605c5'
  LOOP
    -- Nur einfügen wenn noch kein Assignment existiert
    INSERT INTO cleaning_assignments (
      service_task_id,
      cleaning_staff_id,
      status,
      assigned_at,
      started_at,
      completed_at,
      created_at,
      updated_at
    )
    SELECT
      task_record.id,
      '369769c9-2594-4687-85c6-e52b49e605c5',
      'completed',
      task_record.scheduled_date + COALESCE(task_record.scheduled_time, '09:00:00'::time),
      task_record.scheduled_date + COALESCE(task_record.scheduled_time, '09:00:00'::time),
      task_record.completed_at,
      NOW(),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM cleaning_assignments 
      WHERE service_task_id = task_record.id
    );
  END LOOP;
END $$;