-- Migration: Boris als cleaning_staff für seine 3 Provider-Reinigungen

-- 1. Boris als cleaning_staff anlegen
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
  '193a013f-45ed-4621-b95f-b449aa79c2c9',
  'Boris',
  'boris@example.com',
  '193a013f-45ed-4621-b95f-b449aa79c2c9',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. assigned_staff_id der 3 spezifischen Tasks auf Boris setzen
UPDATE service_tasks
SET 
  assigned_staff_id = '193a013f-45ed-4621-b95f-b449aa79c2c9',
  updated_at = NOW()
WHERE id IN (
  'd2f104bd-cd0b-46c2-a3cf-e8eab4201c44',
  '4d579373-f6f3-41d4-8726-01750c9fd622',
  '821dda77-62a4-438e-99d5-9433992239a7'
);

-- 3. Alte cleaning_assignments für diese Tasks löschen
DELETE FROM cleaning_assignments
WHERE service_task_id IN (
  'd2f104bd-cd0b-46c2-a3cf-e8eab4201c44',
  '4d579373-f6f3-41d4-8726-01750c9fd622',
  '821dda77-62a4-438e-99d5-9433992239a7'
);

-- 4. Neue cleaning_assignments für Boris erstellen
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
  '193a013f-45ed-4621-b95f-b449aa79c2c9',
  'completed',
  st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time),
  st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time),
  st.scheduled_date + COALESCE(st.scheduled_time, '09:00:00'::time) + interval '3 hours',
  180,
  180,
  NOW(),
  NOW()
FROM service_tasks st
WHERE st.id IN (
  'd2f104bd-cd0b-46c2-a3cf-e8eab4201c44',
  '4d579373-f6f3-41d4-8726-01750c9fd622',
  '821dda77-62a4-438e-99d5-9433992239a7'
);