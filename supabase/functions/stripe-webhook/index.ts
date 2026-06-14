import Stripe from 'https://esm.sh/stripe@17.5.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function findPayment(criteria: {
  payment_intent_id?: string | null;
  payment_link_id?: string | null;
  session_id?: string | null;
}) {
  // Try payment_intent first
  if (criteria.payment_intent_id) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_payment_intent_id', criteria.payment_intent_id)
      .maybeSingle();
    if (data) return data;
  }
  if (criteria.session_id) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_session_id', criteria.session_id)
      .maybeSingle();
    if (data) return data;
  }
  if (criteria.payment_link_id) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_payment_link_id', criteria.payment_link_id)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function markPaid(payment: any, event: Stripe.Event, paymentIntentId: string | null) {
  if (payment.status === 'paid') {
    console.log('Payment already paid, skipping:', payment.id);
    return;
  }

  const updates: Record<string, unknown> = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    stripe_event_id: event.id,
    raw_event: event as unknown as Record<string, unknown>,
  };
  if (paymentIntentId) updates.stripe_payment_intent_id = paymentIntentId;

  const { error: updErr } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', payment.id);
  if (updErr) throw updErr;

  // booking_charge → paid
  if (payment.booking_charge_id) {
    const { error } = await supabase
      .from('booking_charges')
      .update({ status: 'paid' })
      .eq('id', payment.booking_charge_id);
    if (error) console.error('booking_charges update error', error);
  }

  // Bundled payment: mark ALL charges that reference this payment_id as paid
  {
    const { error } = await supabase
      .from('booking_charges')
      .update({ status: 'paid' })
      .eq('payment_id', payment.id);
    if (error) console.error('booking_charges bundled update error', error);
  }

  // Add amount to booking_amount and adjust booking payment_status
  if (payment.booking_id) {
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, booking_amount')
      .eq('id', payment.booking_id)
      .maybeSingle();
    if (bErr) console.error('booking load error', bErr);

    const newAmount = round2(Number(booking?.booking_amount ?? 0) + Number(payment.amount ?? 0));

    // Check remaining open booking_charges
    const { count: openCount } = await supabase
      .from('booking_charges')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', payment.booking_id)
      .neq('status', 'paid')
      .neq('status', 'cancelled');

    const payment_status = (openCount ?? 0) > 0 ? 'partial' : 'paid';

    const { error: updBErr } = await supabase
      .from('bookings')
      .update({ booking_amount: newAmount, payment_status })
      .eq('id', payment.booking_id);
    if (updBErr) console.error('booking update error', updBErr);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe signature verification failed:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Idempotency: already processed?
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ received: true, idempotent: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = await findPayment({
          payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          session_id: session.id,
          payment_link_id: typeof session.payment_link === 'string' ? session.payment_link : null,
        });
        if (payment) {
          await markPaid(
            payment,
            event,
            typeof session.payment_intent === 'string' ? session.payment_intent : null,
          );
        } else {
          console.warn('No payment row found for session', session.id);
        }
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const payment = await findPayment({ payment_intent_id: pi.id });
        if (payment) {
          await markPaid(payment, event, pi.id);
        } else {
          console.warn('No payment row found for payment_intent', pi.id);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const payment = await findPayment({ payment_intent_id: pi.id });
        if (payment) {
          const { error } = await supabase
            .from('payments')
            .update({
              status: 'failed',
              stripe_event_id: event.id,
              raw_event: event as unknown as Record<string, unknown>,
              stripe_payment_intent_id: pi.id,
            })
            .eq('id', payment.id);
          if (error) console.error('failed update error', error);
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
        const payment = await findPayment({ payment_intent_id: piId });
        if (payment) {
          const { error } = await supabase
            .from('payments')
            .update({
              status: 'refunded',
              stripe_event_id: event.id,
              raw_event: event as unknown as Record<string, unknown>,
            })
            .eq('id', payment.id);
          if (error) console.error('refunded update error', error);
        }
        break;
      }
      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Webhook handler error:', err);
    // Return 200 to acknowledge receipt and avoid Stripe retry storms on internal errors
    return new Response(JSON.stringify({ received: true, error: 'handler_error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});