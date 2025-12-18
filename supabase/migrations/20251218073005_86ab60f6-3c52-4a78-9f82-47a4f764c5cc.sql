-- 1. Kostenarten-Katalog (vordefiniert + benutzerdefiniert)
CREATE TABLE public.utility_cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT true,
  default_distribution_key TEXT DEFAULT 'wohnflaeche',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Vordefinierte Kostenarten nach §2 BetrKV
INSERT INTO public.utility_cost_categories (name, description, default_distribution_key, is_system) VALUES
  ('Grundsteuer', 'Laufende öffentliche Lasten des Grundstücks', 'wohnflaeche', true),
  ('Wasserversorgung', 'Kosten der Wasserversorgung', 'personen', true),
  ('Entwässerung', 'Kosten der Entwässerung', 'personen', true),
  ('Heizkosten', 'Kosten des Betriebs der zentralen Heizungsanlage', 'verbrauch_70_30', true),
  ('Warmwasser', 'Kosten der zentralen Warmwasserversorgung', 'verbrauch_70_30', true),
  ('Aufzug', 'Kosten des Betriebs des Aufzugs', 'wohnflaeche', true),
  ('Straßenreinigung', 'Kosten der Straßenreinigung', 'wohnflaeche', true),
  ('Müllabfuhr', 'Kosten der Müllbeseitigung', 'wohnflaeche', true),
  ('Gebäudereinigung', 'Kosten der Gebäudereinigung und Ungezieferbekämpfung', 'wohnflaeche', true),
  ('Gartenpflege', 'Kosten der Gartenpflege', 'wohnflaeche', true),
  ('Beleuchtung', 'Kosten der Beleuchtung (Allgemeinräume)', 'wohnflaeche', true),
  ('Schornsteinreinigung', 'Kosten der Schornsteinreinigung', 'wohnflaeche', true),
  ('Gebäudeversicherung', 'Kosten der Sach- und Haftpflichtversicherung', 'wohnflaeche', true),
  ('Hauswart', 'Kosten für den Hauswart', 'wohnflaeche', true),
  ('Kabelanschluss', 'Kosten des Betriebs der Gemeinschafts-Antennenanlage', 'einheiten', true),
  ('Sonstige Betriebskosten', 'Sonstige Betriebskosten gemäß Mietvertrag', 'wohnflaeche', true);

-- 2. Objekt-spezifische Einstellungen für Nebenkostenabrechnung
CREATE TABLE public.utility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  total_area_sqm NUMERIC(10,2),
  tenant_area_sqm NUMERIC(10,2),
  total_units INTEGER DEFAULT 1,
  tenant_persons INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(house_id)
);

-- 3. Erfasste Kosten pro Jahr und Objekt
CREATE TABLE public.utility_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.utility_cost_categories(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  distribution_key TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(house_id, category_id, year)
);

-- 4. Erstellte Abrechnungen
CREATE TABLE public.utility_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_costs NUMERIC(10,2) NOT NULL DEFAULT 0,
  tenant_share NUMERIC(10,2) NOT NULL DEFAULT 0,
  prepayments NUMERIC(10,2) NOT NULL DEFAULT 0,
  result NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_breakdown JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'sent')),
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(house_id, year)
);

-- Indizes für Performance
CREATE INDEX idx_utility_costs_house_year ON public.utility_costs(house_id, year);
CREATE INDEX idx_utility_statements_house_year ON public.utility_statements(house_id, year);

-- Update Trigger für updated_at
CREATE OR REPLACE FUNCTION public.update_utility_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_utility_cost_categories_updated_at
  BEFORE UPDATE ON public.utility_cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_utility_tables_updated_at();

CREATE TRIGGER update_utility_settings_updated_at
  BEFORE UPDATE ON public.utility_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_utility_tables_updated_at();

CREATE TRIGGER update_utility_costs_updated_at
  BEFORE UPDATE ON public.utility_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_utility_tables_updated_at();

CREATE TRIGGER update_utility_statements_updated_at
  BEFORE UPDATE ON public.utility_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_utility_tables_updated_at();