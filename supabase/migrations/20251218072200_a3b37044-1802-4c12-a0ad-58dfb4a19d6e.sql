-- Add additional costs columns to tenant_rent_changes
ALTER TABLE public.tenant_rent_changes
ADD COLUMN IF NOT EXISTS new_additional_costs NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS old_additional_costs NUMERIC(10,2);