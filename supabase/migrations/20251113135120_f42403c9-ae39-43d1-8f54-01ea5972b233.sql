-- Add tenant_info JSONB column to houses table for long-term rental management
ALTER TABLE houses
ADD COLUMN IF NOT EXISTS tenant_info JSONB DEFAULT NULL;

COMMENT ON COLUMN houses.tenant_info IS 'Tenant information for long-term rentals: tenant_name, tenant_email, tenant_phone, contract_start, contract_end, monthly_rent, deposit_amount, payment_day, payment_method, notes';