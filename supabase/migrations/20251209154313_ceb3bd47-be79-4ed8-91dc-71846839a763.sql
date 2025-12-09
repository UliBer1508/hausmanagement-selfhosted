-- Create laundry_invoices table for syncing invoices from external Wäsche Oberpinzgau database
CREATE TABLE laundry_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- External references
  external_rechnung_id UUID NOT NULL UNIQUE,
  external_bestellung_id UUID,
  external_kunde_id UUID,
  
  -- Invoice data
  rechnungsnummer TEXT NOT NULL,
  rechnungsdatum DATE NOT NULL,
  faelligkeitsdatum DATE,
  
  -- Customer snapshot (for display without external access)
  kunde_name TEXT,
  kunde_kundennummer TEXT,
  kunde_strasse TEXT,
  kunde_plz TEXT,
  kunde_ort TEXT,
  
  -- Amounts
  nettobetrag NUMERIC(10,2),
  mwst_satz NUMERIC(5,2),
  mwst_betrag NUMERIC(10,2),
  bearbeitungsgebuehr NUMERIC(10,2),
  bruttobetrag NUMERIC(10,2) NOT NULL,
  
  -- Local status (independent from external DB - not overwritten on sync)
  status TEXT DEFAULT 'offen' CHECK (status IN ('offen', 'bezahlt', 'storniert', 'mahnung')),
  bezahlt_am DATE,
  
  -- Positions as JSONB
  positionen JSONB,
  
  -- Sync metadata
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  external_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Local fields
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_laundry_invoices_status ON laundry_invoices(status);
CREATE INDEX idx_laundry_invoices_rechnungsdatum ON laundry_invoices(rechnungsdatum);
CREATE INDEX idx_laundry_invoices_faelligkeitsdatum ON laundry_invoices(faelligkeitsdatum);

-- Auto-update trigger for updated_at
CREATE TRIGGER update_laundry_invoices_updated_at
  BEFORE UPDATE ON laundry_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE laundry_invoices IS 'Synchronized invoices from external Wäsche Oberpinzgau database. Local status and bezahlt_am are not overwritten during sync.';