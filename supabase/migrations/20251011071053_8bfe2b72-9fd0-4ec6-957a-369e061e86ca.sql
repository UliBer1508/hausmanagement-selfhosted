-- Add default_cleaning_hours to houses table
ALTER TABLE houses 
ADD COLUMN default_cleaning_hours NUMERIC(4,2) DEFAULT 3.00;

COMMENT ON COLUMN houses.default_cleaning_hours IS 'Standard-Reinigungsdauer in Stunden für dieses Haus';

-- Add cleaning-related columns to service_tasks table
ALTER TABLE service_tasks
ADD COLUMN cleaning_hours NUMERIC(4,2),
ADD COLUMN cleaning_cost NUMERIC(10,2),
ADD COLUMN payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'pending'));

COMMENT ON COLUMN service_tasks.cleaning_hours IS 'Tatsächliche Reinigungsdauer in Stunden für diesen Auftrag';
COMMENT ON COLUMN service_tasks.cleaning_cost IS 'Berechnete Kosten (Stunden × Stundensatz)';
COMMENT ON COLUMN service_tasks.payment_status IS 'Zahlungsstatus: paid, unpaid, pending';

-- Set default cleaning hours for existing houses
UPDATE houses SET default_cleaning_hours = 3.00 WHERE name ILIKE '%wald%';
UPDATE houses SET default_cleaning_hours = 4.00 WHERE name ILIKE '%venerderigersiedlung%';