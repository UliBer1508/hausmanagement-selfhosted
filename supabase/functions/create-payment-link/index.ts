import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import Stripe from 'npm:stripe@17.5.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const booking_charge_id: string | undefined = body?.booking_charge_id
    const booking_id: string | undefined = body?.booking_id

    if (!booking_charge_id && !booking_id) {
      return new Response(
        JSON.stringify({ error: 'booking_charge_id or booking_id is required' }),
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

    // 1. Load charges (server-side, trusted source for amounts)
    let charges: Array<{ id: string; booking_id: string; amount: number; currency: string | null; description: string | null; charge_type: string }> = []
    let bookingId = ''

    if (booking_id) {
      const { data, error } = await supabase
        .from('booking_charges')
        .select('id, booking_id, amount, currency, description, charge_type, status, payment_id')
        .eq('booking_id', booking_id)
        .eq('status', 'open')
        .is('payment_id', null)
        .order('created_at', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      charges = (data ?? []) as any
      bookingId = booking_id
    } else if (booking_charge_id) {
      const { data, error } = await supabase
        .from('booking_charges')
        .select('id, booking_id, amount, currency, description, charge_type')
        .eq('id', booking_charge_id)
        .maybeSingle()
      if (error || !data) {
        return new Response(JSON.stringify({ error: 'booking_charge not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      charges = [data as any]
      bookingId = (data as any).booking_id
    }

    if (charges.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Keine offenen Forderungen vorhanden' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const totalAmount = charges.reduce((s, c) => s + Number(c.amount || 0), 0)
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid total amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const currency = (charges[0].currency || 'EUR').toLowerCase()

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' })

    // 2. Build line_items (one per charge)
    const line_items = charges.map((c) => ({
      price_data: {
        currency,
        unit_amount: Math.round(Number(c.amount) * 100),
        product_data: {
          name: c.description || `Zusatzforderung (${c.charge_type})`,
        },
      },
      quantity: 1,
    }))

    // price_data is not supported on paymentLinks line_items directly — create prices first
    const prices = await Promise.all(
      charges.map((c) =>
        stripe.prices.create({
          currency,
          unit_amount: Math.round(Number(c.amount) * 100),
          product_data: { name: c.description || `Zusatzforderung (${c.charge_type})` },
        }),
      ),
    )

    const paymentLink = await stripe.paymentLinks.create({
      line_items: prices.map((p) => ({ price: p.id, quantity: 1 })),
      metadata: {
        booking_id: bookingId,
        charge_ids: charges.map((c) => c.id).join(','),
      },
    })

    // 3. Insert ONE payments row
    const bundled = charges.length > 1
    const desc = bundled
      ? `Gebündelte Zusatzforderungen (${charges.length} Positionen)`
      : charges[0].description || `Zusatzforderung (${charges[0].charge_type})`

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        booking_charge_id: bundled ? null : charges[0].id,
        amount: totalAmount,
        currency: 'EUR',
        purpose: 'booking_surcharge',
        description: desc,
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

    // 4. Link ALL included booking_charges -> payment
    const { error: updErr } = await supabase
      .from('booking_charges')
      .update({ payment_id: payment.id })
      .in('id', charges.map((c) => c.id))

    if (updErr) {
      console.error('booking_charges update failed', updErr)
    }

    return new Response(
      JSON.stringify({
        payment_url: paymentLink.url,
        payment_id: payment.id,
        amount: totalAmount,
        charge_ids: charges.map((c) => c.id),
      }),
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