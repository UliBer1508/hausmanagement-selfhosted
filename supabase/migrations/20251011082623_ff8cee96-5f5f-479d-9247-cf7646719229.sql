-- Migration: Amela als cleaning_staff für alle ihre Provider-Reinigungen

-- 1. Amela als cleaning_staff anlegen (falls noch nicht vorhanden)
INSERT INTO cleaning_staff (
  id,
  name,
  email,
  service_provider_id,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  'Amela',
  'amela@example.com',
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  service_provider_id = EXCLUDED.service_provider_id,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 2. assigned_staff_id aller Tasks mit Amela als Provider auf Amela setzen
UPDATE service_tasks
SET 
  assigned_staff_id = '9de6e071-7e89-4d66-9433-a5f01acaa493',
  updated_at = NOW()
WHERE provider_id = '9de6e071-7e89-4d66-9433-a5f01acaa493';

-- 3. Alte cleaning_assignments für diese Tasks löschen
DELETE FROM cleaning_assignments
WHERE service_task_id IN (
  SELECT id FROM service_tasks 
  WHERE provider_id = '9de6e071-7e89-4d66-9433-a5f01acaa493'
);

-- 4. Neue cleaning_assignments für Amela erstellen
INSERT INTO cleaning_assignments (
  service_task_id,
  cleaning_staff_id,
  status,
  assigned_at,
  started_at,
  completed_at,
  estimated_duration,
  actual_duration,
  created_at,
  updated_at
)
SELECT 
  st.id,
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  CASE 
    WHEN st.status = 'completed' THEN 'completed'
    WHEN st.status = 'in_progress' THEN 'in_progress'
    WHEN st.status = 'cancelled' THEN 'cancelled'
    ELSE 'assigned'
  END,
  st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time),
  CASE WHEN st.status IN ('completed', 'in_progress') THEN st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time) ELSE NULL END,
  CASE WHEN st.status = 'completed' THEN st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time) + interval '3 hours' ELSE NULL END,
  COALESCE(st.cleaning_hours, 3) * 60,
  CASE WHEN st.status = 'completed' THEN COALESCE(st.cleaning_hours, 3) * 60 ELSE NULL END,
  NOW(),
  NOW()
FROM service_tasks st
WHERE st.provider_id = '9de6e071-7e89-4d66-9433-a5f01acaa493';