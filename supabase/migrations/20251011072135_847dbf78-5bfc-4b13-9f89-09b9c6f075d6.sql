-- Update completed cleaning tasks for Amela and Boris
-- Set cleaning hours, costs, and mark as paid

UPDATE service_tasks
SET 
  cleaning_hours = COALESCE(
    cleaning_hours, 
    (SELECT default_cleaning_hours FROM houses WHERE id = service_tasks.house_id)
  ),
  cleaning_cost = COALESCE(
    cleaning_cost,
    (SELECT default_cleaning_hours FROM houses WHERE id = service_tasks.house_id) * 
    (SELECT hourly_rate FROM service_providers WHERE id = service_tasks.provider_id)
  ),
  payment_status = 'paid'
WHERE 
  service_type = 'cleaning'
  AND status = 'completed'
  AND provider_id IN (
    SELECT id FROM service_providers WHERE name IN ('Amela', 'Boris')
  )
  AND payment_status != 'paid';