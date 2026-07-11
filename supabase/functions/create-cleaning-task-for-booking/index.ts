import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Gezielte Wäschebestellung fuer EINE Buchung.
// Gegenstueck zu create-cleaning-task-for-booking (Reinigung).
// NICHT verwechseln mit auto-create-linen-orders (Batch-Automatik ueber alle Haeuser).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id } = await req.json();
    console.log('📦 create-linen-order-for-booking START, booking:', booking_id);
    if (!booking_id) throw new Error('booking_id is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Buchung laden (Haus + Gast)
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, house_id, guest_name, number_of_guests, check_in,
        houses ( id, name ),
        guests!bookings_guest_id_fkey ( name )
      `)
      .eq('id', booking_id)
      .single();
    if (bErr || !booking) throw new Error('Booking not found');
    const guestName = (booking as any).guests?.name || booking.guest_name;

    // 2. Hinweis, falls schon eine aktive Bestellung existiert.
    //    "erstelle" erstellt trotzdem (die Batch-Automatik ist das, was prueft).
    const { data: existing } = await supabase
      .from('linen_orders')
      .select('id, status')
      .eq('booking_id', booking_id)
      .neq('status', 'cancelled');
    const alreadyExisted = !!(existing && existing.length > 0);

    // 3. Artikel + Menge generieren (dieselbe Logik wie die Automatik)
    const { data: orderData, error: genErr } = await supabase.functions.invoke(
      'generate-booking-linen-order',
      { body: { booking_id } }
    );
    if (genErr || !orderData) {
      throw new Error('Failed to generate order items: ' + (genErr?.message || 'no data'));
    }

    // 4. Lieferdatum aus den Automatik-Einstellungen (Fallback 3 Tage)
    let deliveryAdvance = 3;
    const { data: settings } = await supabase
      .from('linen_automation_settings')
      .select('delivery_advance_days')
      .single();
    if (settings?.delivery_advance_days != null) {
      deliveryAdvance = settings.delivery_advance_days;
    }
    const checkInDate = new Date(booking.check_in);
    const deliveryDate = new Date(checkInDate);
    deliveryDate.setDate(deliveryDate.getDate() - deliveryAdvance);
    const deliveryDateStr = deliveryDate.toISOString().split('T')[0];

    // 5. Bestellung gezielt anlegen (Status offen)
    const { data: order, error: insErr } = await supabase
      .from('linen_orders')
      .insert({
        house_id: booking.house_id,
        booking_id: booking.id,
        provider_id: TEUNI_PROVIDER_ID,
        items: orderData.order_items,
        item_variants: orderData.item_variants,
        linen_color: orderData.linen_color || 'white_striped',
        total_items: orderData.total_items,
        total_cost: orderData.estimated_cost ?? null,
        status: 'offen',
        order_source: 'manual_max',
        suggested_at: new Date().toISOString(),
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: deliveryDateStr,
        delivery_type: 'delivery',
        notes: `Von Max erstellt für ${guestName} (${booking.number_of_guests} Gäste) - Check-in: ${checkInDate.toLocaleDateString('de-DE')}`,
      })
      .select()
      .single();
    if (insErr) throw new Error('Failed to create linen order: ' + insErr.message);

    const deliveryDateDE = deliveryDate.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    console.log('✅ linen order created:', order.id, 'items:', orderData.total_items);

    return new Response(JSON.stringify({
      success: true,
      order_created: true,
      linen_order_id: order.id,
      booking_id: booking.id,
      guest_name: guestName,
      house_name: (booking as any).houses?.name,
      total_items: orderData.total_items,
      estimated_cost: orderData.estimated_cost ?? null,
      delivery_date: deliveryDateDE,
      status: 'offen',
      already_existed: alreadyExisted,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ create-linen-order-for-booking:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'An error occurred',
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
