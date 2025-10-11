-- Schritt 1: Assignment für Dr. Mirtschink-Reinigung erstellen (falls Amela noch nicht zugeordnet)
INSERT INTO cleaning_assignments (
  service_task_id,
  cleaning_staff_id,
  status,
  assigned_at
)
SELECT 
  '3bfc99ae-6988-4457-84ba-d96800cb0094'::uuid,
  cs.id,
  'completed',
  '2025-10-11 09:00:00+00'::timestamp with time zone
FROM cleaning_staff cs
WHERE cs.name = 'Amela'
  AND NOT EXISTS (
    SELECT 1 FROM cleaning_assignments ca 
    WHERE ca.service_task_id = '3bfc99ae-6988-4457-84ba-d96800cb0094'::uuid
  )
LIMIT 1;

-- Schritt 2: Alle Amela-Reinigungen VOR 11.10.2025 auf "paid" setzen
UPDATE service_tasks
SET payment_status = 'paid', updated_at = NOW()
WHERE id IN (
  SELECT st.id
  FROM service_tasks st
  JOIN cleaning_assignments ca ON st.id = ca.service_task_id
  JOIN cleaning_staff cs ON ca.cleaning_staff_id = cs.id
  WHERE cs.name = 'Amela'
    AND st.service_type = 'cleaning'
    AND st.scheduled_date < '2025-10-11'
);

-- Schritt 3: Reinigung vom 11.10.2025 explizit auf "unpaid" setzen
UPDATE service_tasks
SET payment_status = 'unpaid', updated_at = NOW()
WHERE id = '3bfc99ae-6988-4457-84ba-d96800cb0094'::uuid;