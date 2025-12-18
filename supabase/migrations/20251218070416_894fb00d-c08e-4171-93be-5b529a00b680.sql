-- Tabelle für Mietänderungen/Mieterhöhungen
CREATE TABLE public.tenant_rent_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  new_rent NUMERIC(10,2) NOT NULL,
  old_rent NUMERIC(10,2),
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index für schnelle Abfragen nach Haus und Datum
CREATE INDEX idx_tenant_rent_changes_house_date 
  ON public.tenant_rent_changes(house_id, effective_date);

-- Trigger für updated_at
CREATE TRIGGER update_tenant_rent_changes_updated_at
  BEFORE UPDATE ON public.tenant_rent_changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();