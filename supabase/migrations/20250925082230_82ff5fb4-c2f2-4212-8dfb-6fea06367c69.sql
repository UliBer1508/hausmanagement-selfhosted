-- Erstelle Service Tasks für vorhandene Buchungen
INSERT INTO service_tasks (
  house_id, 
  booking_id, 
  service_type, 
  scheduled_date, 
  scheduled_time, 
  status, 
  provider_id, 
  notes
) VALUES 
-- Reinigung für Mark Hoogland Buchung
(
  'a2b4d1f7-f396-40a5-b83f-174ccafa55fd',
  '71a5a5da-d2f6-4742-93e0-568b52d949b9',
  'cleaning',
  '2026-01-10',
  '11:00:00',
  'scheduled',
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  'Reinigung nach Check-out - Mark Hoogland'
),
-- Reinigung für Antonio Peñera Buchung  
(
  'f5b4588b-96cf-46f7-b84a-5f6750f7088e',
  'ece8e58a-dc9a-44b3-8059-88b09ef456d5',
  'cleaning',
  '2025-12-26',
  '11:00:00',
  'scheduled',
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  'Reinigung nach Check-out - Antonio Peñera'
),
-- Reinigung für Leonie Paelke Buchung
(
  'a2b4d1f7-f396-40a5-b83f-174ccafa55fd',
  'bf469887-8aca-49df-80bd-7f8c168b35b2', 
  'cleaning',
  '2026-01-24',
  '11:00:00',
  'scheduled',
  '9de6e071-7e89-4d66-9433-a5f01acaa493',
  'Reinigung nach Check-out - Leonie Paelke'
);