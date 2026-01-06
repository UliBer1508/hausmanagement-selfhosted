import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🤖 [auto-create-linen-orders] Starting daily run...');

    // 1. Load automation settings
    const { data: settings, error: settingsError } = await supabase
      .from('linen_automation_settings')
      .select('*')
      .single();

    if (settingsError) {
      console.error('❌ Failed to load settings:', settingsError);
      throw settingsError;
    }

    if (!settings?.is_enabled) {
      console.log('⏸️ Automation disabled, skipping.');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Automation disabled',
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`✅ Automation enabled. Settings:`, {
      lookahead_bookings: settings.lookahead_bookings,
      min_advance_days: settings.min_advance_days,
      delivery_advance_days: settings.delivery_advance_days,
    });

    // 2. Load all tourist houses
    const { data: houses, error: housesError } = await supabase
      .from('houses')
      .select('id, name')
      .eq('rental_type', 'tourist');

    if (housesError) {
      console.error('❌ Failed to load houses:', housesError);
      throw housesError;
    }

    console.log(`📍 Found ${houses?.length || 0} tourist houses`);

    let totalCreated = 0;
    let totalSkipped = 0;
    const details: any[] = [];

    // 3. Process each house
    for (const house of houses || []) {
      console.log(`\n🏠 Processing house: ${house.name}`);

      // FIX: First count EXISTING open orders for this house
      const { data: existingOpenOrders, error: openOrdersError } = await supabase
        .from('linen_orders')
        .select('id')
        .eq('house_id', house.id)
        .in('status', ['offen', 'ausstehend']);

      if (openOrdersError) {
        console.error(`❌ Failed to count open orders for ${house.name}:`, openOrdersError);
        continue;
      }

      const currentOpenCount = existingOpenOrders?.length || 0;
      const slotsAvailable = Math.max(0, settings.lookahead_bookings - currentOpenCount);

      console.log(`  📊 Offene Bestellungen: ${currentOpenCount}/${settings.lookahead_bookings}, Slots frei: ${slotsAvailable}`);

      if (slotsAvailable === 0) {
        console.log(`  ⏭️ Maximum erreicht - zeige Buchungen als übersprungen`);
        
        // Load bookings anyway to show them in details
        const { data: bookingsForDetails } = await supabase
          .from('bookings')
          .select('id, guest_name, check_in, guests!bookings_guest_id_fkey(name)')
          .eq('house_id', house.id)
          .eq('status', 'confirmed')
          .gte('check_in', new Date().toISOString())
          .order('check_in', { ascending: true })
          .limit(settings.lookahead_bookings);
          
        // Add all as skipped - query existing order for each to get status
        for (const booking of bookingsForDetails || []) {
          const guestName = (booking as any).guests?.name || booking.guest_name;
          
          // Query existing order for this booking to get status
          const { data: existingOrder } = await supabase
            .from('linen_orders')
            .select('id, status')
            .eq('booking_id', booking.id)
            .neq('status', 'cancelled')
            .maybeSingle();
          
          totalSkipped++;
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: booking.check_in,
            action: 'skipped',
            reason: existingOrder ? 'order_exists' : 'max_reached',
            existing_status: existingOrder?.status || null,
            current_open: currentOpenCount,
            max_allowed: settings.lookahead_bookings
          });
        }
        continue;
      }

      // Load bookings to find those without orders
      const maxBookingsToCheck = 15;
      
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, number_of_guests, guests!bookings_guest_id_fkey(name)')
        .eq('house_id', house.id)
        .eq('status', 'confirmed')
        .gte('check_in', new Date().toISOString())
        .order('check_in', { ascending: true })
        .limit(maxBookingsToCheck);

      if (bookingsError) {
        console.error(`❌ Failed to load bookings for ${house.name}:`, bookingsError);
        continue;
      }

      console.log(`  📅 Found ${bookings?.length || 0} upcoming bookings`);

      // Counter for NEW orders created per house
      let newOrdersCreatedForHouse = 0;

      for (const booking of bookings || []) {
        // Stop if we've filled all available slots
        if (newOrdersCreatedForHouse >= slotsAvailable) {
          console.log(`  ✅ Alle ${slotsAvailable} freien Slots gefüllt`);
          break;
        }

        // Nutze guests-Relation falls verfügbar, sonst Legacy-Feld
        const guestName = (booking as any).guests?.name || booking.guest_name;
        console.log(`\n  📋 Checking booking: ${guestName} (${booking.id.substring(0, 8)}...)`);

        // Check if order already exists (excluding cancelled)
        const { data: existingOrders, error: ordersError } = await supabase
          .from('linen_orders')
          .select('id, status')
          .eq('booking_id', booking.id)
          .neq('status', 'cancelled');

        if (ordersError) {
          console.error(`  ❌ Failed to check existing orders:`, ordersError);
          continue;
        }

        if (existingOrders && existingOrders.length > 0) {
          console.log(`  ⏭️ Skip: Order already exists (status: ${existingOrders[0].status})`);
          totalSkipped++;
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: booking.check_in,
            action: 'skipped',
            reason: 'order_exists',
            existing_status: existingOrders[0].status
          });
          // FIX: Don't count towards lookahead limit, just skip
          continue;
        }

        // Calculate days until check-in
        const checkInDate = new Date(booking.check_in);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil(
          (checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        console.log(`  📆 Days until check-in: ${daysUntil}`);

        if (daysUntil < settings.min_advance_days) {
          console.log(`  ⏭️ Skip: Too close to check-in (${daysUntil} < ${settings.min_advance_days} days)`);
          totalSkipped++;
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: booking.check_in,
            action: 'skipped',
            reason: 'too_close',
            days_until: daysUntil,
            min_required: settings.min_advance_days
          });
          // FIX: Don't count towards lookahead limit, just skip
          continue;
        }

        // Generate order items via Edge Function
        console.log(`  🔄 Generating order items...`);
        const { data: orderData, error: genError } = await supabase.functions.invoke(
          'generate-booking-linen-order',
          { body: { booking_id: booking.id } }
        );

        if (genError || !orderData) {
          console.error(`  ❌ Failed to generate order:`, genError);
          totalSkipped++;
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: booking.check_in,
            action: 'skipped',
            reason: 'generation_failed',
            error: genError?.message
          });
          continue;
        }

        console.log(`  ✅ Generated ${orderData.total_items} items`);

        // Calculate delivery date
        const deliveryDate = new Date(checkInDate);
        deliveryDate.setDate(deliveryDate.getDate() - settings.delivery_advance_days);
        const deliveryDateStr = deliveryDate.toISOString().split('T')[0];

        console.log(`  📦 Delivery date: ${deliveryDateStr}`);

        // Create linen_order with status "offen"
        const { error: insertError } = await supabase
          .from('linen_orders')
          .insert({
            house_id: house.id,
            booking_id: booking.id,
            provider_id: 'd8110105-8ac9-45e3-ad32-aaf42393744c', // Teuni Provider
            items: orderData.order_items,
            item_variants: orderData.item_variants,
            linen_color: orderData.linen_color || 'white_striped', // NEU: Haupt-Wäschefarbe aus Regeln
            total_items: orderData.total_items,
            status: 'offen',
            order_source: 'auto_booking_lookahead',
            suggested_at: new Date().toISOString(),
            order_date: new Date().toISOString().split('T')[0],
            delivery_date: deliveryDateStr,
            delivery_type: 'delivery',
            notes: `Automatisch erstellt für ${guestName} (${booking.number_of_guests} Gäste) - Check-in: ${checkInDate.toLocaleDateString('de-DE')}`,
          });

        if (insertError) {
          console.error(`  ❌ Failed to insert order:`, insertError);
          totalSkipped++;
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: booking.check_in,
            action: 'skipped',
            reason: 'insert_failed',
            error: insertError.message
          });
        } else {
          totalCreated++;
          newOrdersCreatedForHouse++; // FIX: Count towards per-house limit
          details.push({
            booking_id: booking.id,
            guest: guestName,
            house: house.name,
            check_in: checkInDate.toISOString().split('T')[0],
            action: 'created',
            delivery_date: deliveryDateStr,
            items_count: orderData.total_items
          });
          console.log(`  ✅ Created order with status "offen" (${newOrdersCreatedForHouse}/${slotsAvailable} slots filled)`);
        }
      }
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      settings: {
        lookahead_bookings: settings.lookahead_bookings,
        min_advance_days: settings.min_advance_days,
        delivery_advance_days: settings.delivery_advance_days,
      },
      summary: {
        houses_processed: houses?.length || 0,
        orders_created: totalCreated,
        bookings_skipped: totalSkipped,
      },
      details,
    };

    console.log('\n✅ [auto-create-linen-orders] Completed:', result.summary);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ [auto-create-linen-orders] Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
