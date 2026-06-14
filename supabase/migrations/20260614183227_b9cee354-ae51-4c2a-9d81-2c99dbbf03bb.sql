CREATE TABLE public.guest_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
  guest_email TEXT,
  guest_name TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound','inbound')),
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_communications TO authenticated;
GRANT ALL ON public.guest_communications TO service_role;

CREATE INDEX guest_comm_guest_id_idx   ON public.guest_communications(guest_id);
CREATE INDEX guest_comm_email_idx      ON public.guest_communications(guest_email);
CREATE INDEX guest_comm_occurred_idx   ON public.guest_communications(occurred_at DESC);

ALTER TABLE public.guest_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON public.guest_communications
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));