CREATE INDEX IF NOT EXISTS idx_linen_orders_laundry_invoice_id ON public.linen_orders (laundry_invoice_id);
CREATE INDEX IF NOT EXISTS idx_utility_costs_category_id ON public.utility_costs (category_id);
CREATE INDEX IF NOT EXISTS idx_utility_statements_house_id ON public.utility_statements (house_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_house_id ON public.tenant_payments (house_id);
CREATE INDEX IF NOT EXISTS idx_tenant_rent_changes_house_id ON public.tenant_rent_changes (house_id);
CREATE INDEX IF NOT EXISTS idx_profiles_provider_id ON public.profiles (provider_id);