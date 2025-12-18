-- Insert utility settings for Haus Berlin Falkensee
INSERT INTO public.utility_settings (house_id, total_area_sqm, tenant_area_sqm, total_units, tenant_persons)
VALUES ('f830a4e8-19b2-44ae-baf1-d4d7033bfa18', 138, 138, 1, 2)
ON CONFLICT (house_id) DO UPDATE SET
  total_area_sqm = EXCLUDED.total_area_sqm,
  tenant_area_sqm = EXCLUDED.tenant_area_sqm,
  total_units = EXCLUDED.total_units,
  tenant_persons = EXCLUDED.tenant_persons,
  updated_at = now();

-- Insert utility costs for 2025
-- Grundsteuer (194.77€)
INSERT INTO public.utility_costs (house_id, category_id, year, total_amount, distribution_key)
SELECT 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18', id, 2025, 194.77, 'wohnflaeche'
FROM public.utility_cost_categories WHERE name = 'Grundsteuer'
ON CONFLICT (house_id, category_id, year) DO UPDATE SET
  total_amount = EXCLUDED.total_amount,
  distribution_key = EXCLUDED.distribution_key,
  updated_at = now();

-- Wasserversorgung (193.47€)
INSERT INTO public.utility_costs (house_id, category_id, year, total_amount, distribution_key)
SELECT 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18', id, 2025, 193.47, 'personen'
FROM public.utility_cost_categories WHERE name = 'Wasserversorgung'
ON CONFLICT (house_id, category_id, year) DO UPDATE SET
  total_amount = EXCLUDED.total_amount,
  distribution_key = EXCLUDED.distribution_key,
  updated_at = now();

-- Entwässerung (84.00€)
INSERT INTO public.utility_costs (house_id, category_id, year, total_amount, distribution_key)
SELECT 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18', id, 2025, 84.00, 'personen'
FROM public.utility_cost_categories WHERE name = 'Entwässerung'
ON CONFLICT (house_id, category_id, year) DO UPDATE SET
  total_amount = EXCLUDED.total_amount,
  distribution_key = EXCLUDED.distribution_key,
  updated_at = now();

-- Gebäudeversicherung (666.56€)
INSERT INTO public.utility_costs (house_id, category_id, year, total_amount, distribution_key)
SELECT 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18', id, 2025, 666.56, 'wohnflaeche'
FROM public.utility_cost_categories WHERE name = 'Gebäudeversicherung'
ON CONFLICT (house_id, category_id, year) DO UPDATE SET
  total_amount = EXCLUDED.total_amount,
  distribution_key = EXCLUDED.distribution_key,
  updated_at = now();

-- Schornsteinreinigung (73.63€)
INSERT INTO public.utility_costs (house_id, category_id, year, total_amount, distribution_key)
SELECT 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18', id, 2025, 73.63, 'wohnflaeche'
FROM public.utility_cost_categories WHERE name = 'Schornsteinreinigung'
ON CONFLICT (house_id, category_id, year) DO UPDATE SET
  total_amount = EXCLUDED.total_amount,
  distribution_key = EXCLUDED.distribution_key,
  updated_at = now();

-- Add monthly_prepayment field to utility_settings if not exists
ALTER TABLE public.utility_settings 
ADD COLUMN IF NOT EXISTS monthly_prepayment numeric(10,2) DEFAULT NULL;

-- Update monthly prepayment for Berlin Falkensee
UPDATE public.utility_settings 
SET monthly_prepayment = 130
WHERE house_id = 'f830a4e8-19b2-44ae-baf1-d4d7033bfa18';