import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import Stripe from 'npm:stripe@17.5.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_charge_id } = await req.json()
    if (!booking_charge_id || typeof booking_charge_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'booking_charge_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Load booking_charge (server-side, trusted source for amount)
    const { data: charge, error: chargeErr } = await supabase
      .from('booking_charges')
      .select('id, booking_id, amount, currency, description, charge_type')
      .eq('id', booking_charge_id)
      .maybeSingle()

    if (chargeErr || !charge) {
      return new Response(
        JSON.stringify({ error: 'booking_charge not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const amount = Number(charge.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid charge amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const currency = (charge.currency || 'EUR').toLowerCase()
    const description = charge.description || `Zusatzforderung (${charge.charge_type})`
    const amountCents = Math.round(amount * 100)

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' })

    // 2. Create Stripe Payment Link with dynamic price
    const price = await stripe.prices.create({
      currency,
      unit_amount: amountCents,
      product_data: { name: description },
    })

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        booking_charge_id: charge.id,
        booking_id: charge.booking_id ?? '',
      },
    })

    // 3. Insert payments row
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        booking_id: charge.booking_id,
        booking_charge_id: charge.id,
        amount,
        currency: 'EUR',
        purpose: 'booking_surcharge',
        description,
        stripe_payment_link_id: paymentLink.id,
        payment_url: paymentLink.url,
        status: 'created',
      })
      .select('id')
      .single()

    if (payErr || !payment) {
      console.error('payments insert failed', payErr)
      return new Response(
        JSON.stringify({ error: 'Failed to persist payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Link booking_charge -> payment
    const { error: updErr } = await supabase
      .from('booking_charges')
      .update({ payment_id: payment.id })
      .eq('id', charge.id)

    if (updErr) {
      console.error('booking_charges update failed', updErr)
    }

    // 5. Return
    return new Response(
      JSON.stringify({ payment_url: paymentLink.url, payment_id: payment.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('create-payment-link error', (e as Error).message)
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})