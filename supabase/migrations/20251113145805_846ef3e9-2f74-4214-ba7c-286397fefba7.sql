-- Create tenant_payments table for tracking rent payments
CREATE TABLE tenant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  
  -- Payment data
  payment_date DATE,
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'cash', 'direct_debit')),
  
  -- Additional information
  reference_number TEXT,
  notes TEXT,
  
  -- Receipts
  receipt_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_tenant_payments_house_id ON tenant_payments(house_id);
CREATE INDEX idx_tenant_payments_due_date ON tenant_payments(due_date);
CREATE INDEX idx_tenant_payments_status ON tenant_payments(status);

-- Auto-update trigger
CREATE TRIGGER update_tenant_payments_updated_at
  BEFORE UPDATE ON tenant_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE tenant_payments IS 'Tracks monthly rent payments for long-term rentals';

-- Create storage bucket for tenant receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tenant-receipts', 'tenant-receipts', true)
ON CONFLICT (id) DO NOTHING;