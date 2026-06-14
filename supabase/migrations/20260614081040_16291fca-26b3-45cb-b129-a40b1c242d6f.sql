CREATE TABLE public.booking_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    house_id uuid REFERENCES public.houses(id),
    charge_type text NOT NULL,
    description text,
    quantity numeric DEFAULT 1,
    unit_amount numeric NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'EUR',
    status text DEFAULT 'open',
    origin text DEFAULT 'auto_delta',
    payment_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    booking_charge_id uuid REFERENCES public.booking_charges(id) ON DELETE SET NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'EUR',
    purpose text NOT NULL,
    description text,
    stripe_payment_link_id text,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    stripe_event_id text,
    status text DEFAULT 'created',
    payment_url text,
    paid_at timestamptz,
    raw_event jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.booking_charges
    ADD CONSTRAINT fk_booking_charges_payment
    FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX idx_booking_charges_booking_id ON public.booking_charges(booking_id);
CREATE INDEX idx_booking_charges_status ON public.booking_charges(status);
CREATE INDEX idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE UNIQUE INDEX idx_payments_stripe_intent ON public.payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX idx_payments_stripe_event ON public.payments(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_charges TO authenticated;
GRANT ALL ON public.booking_charges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.booking_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.booking_charges FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);