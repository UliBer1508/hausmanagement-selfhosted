-- Korrigiere das fehlerhafte Fälligkeitsdatum
UPDATE tenant_payments 
SET due_date = '2026-01-01' 
WHERE id = '74876832-d064-4eda-a1fd-a66999a88fde';