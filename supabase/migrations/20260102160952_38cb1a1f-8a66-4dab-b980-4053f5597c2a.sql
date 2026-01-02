-- Korrigiere die Januar-Zahlung für Haus Berlin auf Warmmiete (1270 + 130 = 1400)
UPDATE tenant_payments 
SET amount = 1400.00 
WHERE id = '539c1d75-a3ee-4fc2-b900-4176cebcfa50';