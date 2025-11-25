-- Create provider_messages table for instant messaging
CREATE TABLE provider_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'provider')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  related_task_id UUID REFERENCES service_tasks(id) ON DELETE SET NULL,
  related_linen_order_id UUID REFERENCES linen_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_provider_messages_provider ON provider_messages(provider_id);
CREATE INDEX idx_provider_messages_unread ON provider_messages(provider_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_provider_messages_created ON provider_messages(created_at DESC);

-- Enable Realtime for live updates
ALTER TABLE provider_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE provider_messages;