import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookingOrderStatus {
  booking_id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  days_until_checkin: number;
  linen_order: {
    exists: boolean;
    order_id?: string;
    status?: string;
    created_at?: string;
  };
  required_items?: Record<string, number>;
  estimated_cost?: number;
  urgency: 'urgent' | 'normal' | 'ok';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { house_id, lookahead_bookings } = await req.json();

    if (!house_id) {
      throw new Error('house_id is required');
    }

    console.log(`[check-booking-linen-orders] Checking orders for house: ${house_id}`);

    // 1. Load config for house
    const { data: config } = await supabase
      .from('booking_linen_config')
      .select('*')
      .eq('house_id', house_id)
      .maybeSingle();

    const lookahead = lookahead_bookings || config?.lookahead_bookings || 3;
    const warningDays = config?.warning_days_before || 7;

    console.log(`[check-booking-linen-orders] Lookahead: ${lookahead} bookings, Warning: ${warningDays} days`);

    // 2. Get next X confirmed bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, guest_name, check_in, check_out, number_of_guests, house_id, houses!bookings_house_id_fkey(id, name)')
      .eq('house_id', house_id)
      .eq('status', 'confirmed')
      .gte('check_in', new Date().toISOString())
      .order('check_in', { ascending: true })
      .limit(lookahead);

    if (bookingsError) throw bookingsError;

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({
          house_id,
          house_name: 'Unknown',
          lookahead_bookings: lookahead,
          bookings: [],
          summary: {
            total_bookings: 0,
            orders_complete: 0,
            orders_missing: 0,
            urgent_count: 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Load linen_set_definitions for house
    const { data: linenDef } = await supabase
      .from('linen_set_definitions')
      .select('*')
      .eq('house_id', house_id)
      .maybeSingle();

    // 4. Load pricing
    const { data: aiSettings } = await supabase
      .from('ai_linen_settings')
      .select('prices')
      .eq('house_id', house_id)
      .maybeSingle();

    const prices = aiSettings?.prices || {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      sauna_towels: 20,
      sink_towels: 8,
      bath_mats: 15,
      kitchen_towels: 12,
    };

    // 5. Check each booking for existing order
    const bookingStatuses: BookingOrderStatus[] = [];
    let ordersComplete = 0;
    let ordersMissing = 0;
    let urgentCount = 0;

    for (const booking of bookings) {
      const checkInDate = new Date(booking.check_in);
      const today = new Date();
      const daysUntilCheckin = Math.ceil((checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Check if linen_order exists for this booking
      const { data: existingOrders } = await supabase
        .from('linen_orders')
        .select('id, status, created_at')
        .eq('booking_id', booking.id)
        .neq('status', 'cancelled');

      const hasOrder = existingOrders && existingOrders.length > 0;
      let urgency: 'urgent' | 'normal' | 'ok' = 'ok';
      let requiredItems: Record<string, number> | undefined;
      let estimatedCost: number | undefined;

      if (!hasOrder) {
        ordersMissing++;
        
        // Calculate required items
        if (linenDef) {
          requiredItems = {
            bedding: booking.number_of_guests * (linenDef.bedding_per_guest || 1),
            large_towels: booking.number_of_guests * (linenDef.large_towels_per_guest || 1),
            small_towels: booking.number_of_guests * (linenDef.small_towels_per_guest || 1),
            sauna_towels: booking.number_of_guests * (linenDef.sauna_towels_per_guest || 1),
            sink_towels: linenDef.sink_towels_per_booking || 1,
            bath_mats: linenDef.bath_mats_per_booking || 1,
            kitchen_towels: linenDef.kitchen_towels_per_booking || 0,
          };

          // Calculate cost
          estimatedCost = Object.entries(requiredItems).reduce((sum, [key, qty]) => {
            return sum + (qty * (prices[key] || 0));
          }, 0);
        }

        // Determine urgency
        if (daysUntilCheckin <= warningDays) {
          urgency = 'urgent';
          urgentCount++;
        } else {
          urgency = 'normal';
        }
      } else {
        ordersComplete++;
        urgency = 'ok';
      }

      bookingStatuses.push({
        booking_id: booking.id,
        guest_name: booking.guest_name,
        check_in: booking.check_in,
        check_out: booking.check_out,
        number_of_guests: booking.number_of_guests,
        days_until_checkin: daysUntilCheckin,
        linen_order: {
          exists: hasOrder,
          order_id: existingOrders?.[0]?.id,
          status: existingOrders?.[0]?.status,
          created_at: existingOrders?.[0]?.created_at,
        },
        required_items: requiredItems,
        estimated_cost: estimatedCost,
        urgency,
      });
    }

    const house_name = bookings[0]?.houses?.name || 'Unknown';

    const response = {
      house_id,
      house_name,
      lookahead_bookings: lookahead,
      warning_days_before: warningDays,
      bookings: bookingStatuses,
      summary: {
        total_bookings: bookings.length,
        orders_complete: ordersComplete,
        orders_missing: ordersMissing,
        urgent_count: urgentCount,
      },
    };

    console.log(`[check-booking-linen-orders] Summary:`, response.summary);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-booking-linen-orders] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
