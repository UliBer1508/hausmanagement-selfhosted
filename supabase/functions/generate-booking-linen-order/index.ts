import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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

    const { booking_id } = await req.json();
    console.log('🧺 Generating linen order for booking:', booking_id);

    // 1. Load booking with house data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        guest_name,
        number_of_guests,
        check_in,
        check_out,
        house_id,
        houses (
          id,
          name,
          address
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError) {
      console.error('❌ Error loading booking:', bookingError);
      throw bookingError;
    }

    console.log('✅ Booking loaded:', { guest: booking.guest_name, guests: booking.number_of_guests });

    // 2. Load linen set definitions for this house
    const { data: rules, error: rulesError } = await supabase
      .from('linen_set_definitions')
      .select('*')
      .eq('house_id', booking.house_id)
      .maybeSingle();

    if (rulesError) {
      console.error('❌ Error loading linen rules:', rulesError);
      throw rulesError;
    }

    if (!rules) {
      throw new Error('Keine Wäsche-Definitionen für dieses Haus gefunden. Bitte legen Sie zuerst Wäsche-Regeln an.');
    }

    console.log('✅ Linen rules loaded for house:', booking.houses.name);

    // 3. Calculate order items (WITHOUT safety buffer, ONLY for this booking)
    // Prefer the new flexible custom_categories config if available
    const orderItems: Record<string, number> = {};
    const itemVariants: Record<string, string> = {}; // NEU: Farbvarianten speichern

    const customCategories = (rules as any).custom_categories as
      | Record<string, any>
      | null;
    const numberOfGuests: number = booking.number_of_guests || 0;

    if (customCategories && Object.keys(customCategories).length > 0) {
      console.log('🧮 Using custom_categories for linen calculation');

      let checkInDate: Date | null = null;
      if (booking.check_in) {
        checkInDate = new Date(booking.check_in);
      }

      const isWinter = (date: Date) => {
        const month = date.getUTCMonth() + 1; // 1-12
        // Simple season split: Nov–Mar = winter, Apr–Oct = summer
        return month === 11 || month === 12 || month <= 3;
      };

      for (const [key, config] of Object.entries(customCategories)) {
        if (!config || (config as any).active === false) continue;

        // Seasonal availability check
        if ((config as any).availability === 'seasonal' && checkInDate) {
          const season = (config as any).season;
          if (season === 'winter' && !isWinter(checkInDate)) continue;
          if (season === 'summer' && isWinter(checkInDate)) continue;
        }

        const quantityConfig = Number((config as any).quantity ?? 0);
        if (!quantityConfig) continue;

        let qty = 0;
        if ((config as any).calculation_type === 'per_guest') {
          qty = numberOfGuests * quantityConfig;
        } else if ((config as any).calculation_type === 'per_booking') {
          qty = quantityConfig;
        }

        if (qty > 0) {
          orderItems[key] = qty;
          // NEU: Farbe aus Regeln extrahieren
          if ((config as any).color) {
            itemVariants[key] = (config as any).color;
          }
        }
      }
    } else {
      console.log('↩️ Falling back to legacy linen definition columns');
      if ((rules as any).bedding_per_guest) {
        orderItems.bedding = numberOfGuests * (rules as any).bedding_per_guest;
      }
      if ((rules as any).large_towels_per_guest) {
        orderItems.large_towels = numberOfGuests * (rules as any).large_towels_per_guest;
      }
      if ((rules as any).small_towels_per_guest) {
        orderItems.small_towels = numberOfGuests * (rules as any).small_towels_per_guest;
      }
      if ((rules as any).sauna_towels_per_guest) {
        orderItems.sauna_towels = numberOfGuests * (rules as any).sauna_towels_per_guest;
      }
      if ((rules as any).sink_towels_per_booking) {
        orderItems.sink_towels = (rules as any).sink_towels_per_booking;
      }
      if ((rules as any).bath_mats_per_booking) {
        orderItems.bath_mats = (rules as any).bath_mats_per_booking;
      }
      if ((rules as any).kitchen_towels_per_booking) {
        orderItems.kitchen_towels = (rules as any).kitchen_towels_per_booking;
      }
    }

    // Remove items with 0 quantity (safety)
    Object.keys(orderItems).forEach((key) => {
      if (!orderItems[key] || orderItems[key] === 0) {
        delete orderItems[key];
      }
    });

    console.log('📦 Calculated order items:', orderItems);

    // 4. Load prices from AI settings
    const { data: aiSettings } = await supabase
      .from('ai_linen_settings')
      .select('prices')
      .eq('house_id', booking.house_id)
      .maybeSingle();

    const defaultPrices = {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      sauna_towels: 20,
      bath_mats: 15,
      sink_towels: 8,
      kitchen_towels: 5
    };

    const prices = aiSettings?.prices || defaultPrices;
    console.log('💶 Using prices:', prices);

    // 5. Calculate costs
    //
    // WICHTIG (21.07.2026): Ein fehlender Preis ist NICHT dasselbe wie ein
    // Preis von 0. Früher wurde `prices[item] || 0` gerechnet — Artikel ohne
    // hinterlegten Preis flossen still mit 0 EUR ein, der Gesamtbetrag war
    // zu niedrig und niemand konnte es sehen.
    // Beispiel: pillow_cases und spannbetttuch stehen in custom_categories,
    // aber in KEINEM der defaultPrices-Objekte (weder hier noch in
    // useLinenAI.ts). Bei Hubert Middelbos ergab das 69 EUR statt des
    // korrekten Betrags.
    // Ab jetzt: fehlende Preise werden gesammelt und zurückgemeldet;
    // greift KEIN einziger Preis, ist estimated_cost null (= "nicht
    // berechenbar") statt 0 (= "kostenlos").
    let totalCost = 0;
    const missingPrices: string[] = [];
    let pricedItemCount = 0;

    const itemDetails = Object.entries(orderItems).map(([item, qty]: [string, any]) => {
      const rawPrice = prices[item];
      const hasPrice = typeof rawPrice === 'number' && rawPrice > 0;

      if (!hasPrice) {
        missingPrices.push(item);
      } else {
        pricedItemCount++;
      }

      const price = hasPrice ? rawPrice : 0;
      const itemTotal = qty * price;
      totalCost += itemTotal;
      return {
        item,
        quantity: qty,
        unit_price: price,
        total_price: itemTotal,
        price_missing: !hasPrice
      };
    });

    if (missingPrices.length > 0) {
      console.warn('⚠️ Keine Preise hinterlegt für:', missingPrices.join(', '));
    }

    // null = kein einziger Artikel hatte einen Preis -> Betrag nicht ermittelbar.
    // Alle Anzeige-Stellen prüfen bereits auf `typeof === 'number'` bzw. `> 0`
    // und blenden dann sauber aus (LaundryOrderCard, TeuniOrdersOverview,
    // BookingOverviewFixed).
    const estimatedCost = pricedItemCount > 0
      ? Math.round(totalCost * 100) / 100
      : null;

    const totalItems = Object.values(orderItems).reduce((sum: number, qty: any) => sum + qty, 0);

    console.log('✅ Order generated successfully:', {
      booking_id,
      total_items: totalItems,
      total_cost: totalCost,
      missing_prices: missingPrices
    });

    console.log('🎨 Item variants (colors):', itemVariants);

    // Bestimme die Haupt-Wäschefarbe aus der Bettwäsche-Regel
    let linenColor = 'white_striped'; // Fallback
    if (itemVariants.bedding) {
      linenColor = itemVariants.bedding;
    } else if (itemVariants.pillow_cases) {
      linenColor = itemVariants.pillow_cases;
    }
    console.log('🎨 Main linen color:', linenColor);

    return new Response(JSON.stringify({
      success: true,
      booking: {
        id: booking.id,
        guest_name: booking.guest_name,
        number_of_guests: booking.number_of_guests,
        check_in: booking.check_in,
        check_out: booking.check_out,
        house: booking.houses
      },
      order_items: orderItems,
      item_variants: itemVariants,
      linen_color: linenColor, // NEU: Haupt-Wäschefarbe für die Bestellung
      item_details: itemDetails,
      total_items: totalItems,
      estimated_cost: estimatedCost,
      // Artikel ohne hinterlegten Preis — im Dialog sichtbar machen, damit
      // klar ist, für welche Positionen bei Teuni noch ein Preis fehlt.
      missing_prices: missingPrices,
      currency: 'EUR',
      note: 'Bestellung NUR für diese Buchung - Safety Buffer im Inventar bleibt unberührt'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Error generating linen order:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unbekannter Fehler beim Erstellen der Wäschebestellung'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
