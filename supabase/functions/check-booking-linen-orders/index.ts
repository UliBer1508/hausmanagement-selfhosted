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
      .select('id, check_in, check_out, number_of_guests, house_id, houses!bookings_house_id_fkey(id, name), guests!bookings_guest_id_fkey(name)')
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

    // 4b. Artikel und Preise (umgestellt 05.09.2026)
    //
    // Vorher standen hier ai_linen_settings.prices und eine hartcodierte
    // Ersatzliste mit erfundenen Werten (bedding 30, kitchen_towels 12 —
    // tatsaechlich 9,50 und 1,50). Der Nachschlag lief ueber den
    // SET-SCHLUESSEL; Venediger nennt die Bettwaesche-Zeile `bettwaesche`,
    // die Preisliste kannte nur `bedding`, der groesste Posten fiel aus.
    //
    // Jetzt derselbe Weg wie in generate-booking-linen-order: ueber die
    // Artikelnummer an der Set-Zeile, mit Aufloesung der Nachfolgekette
    // (MWR -> MW3 -> MW4) und Beachtung der Abrechnungsart.
    const { data: artikelRoh, error: artikelError } = await supabase
      .from('laundry_articles')
      .select('id, artikelnummer, abrechnungsart, nachfolger_id, laundry_article_prices(preis, gueltig_ab, gueltig_bis)');

    if (artikelError) throw artikelError;

    const artikelNachId = new Map<string, any>();
    const artikelNachNummer = new Map<string, any>();
    for (const a of (artikelRoh ?? []) as any[]) {
      artikelNachId.set(a.id, a);
      const nr = String(a.artikelnummer).toUpperCase();
      if (!artikelNachNummer.has(nr)) artikelNachNummer.set(nr, a);
    }

    const aktuellerArtikel = (start: any) => {
      let cur = start;
      let n = 0;
      while (cur?.nachfolger_id && n < 10) {
        const next = artikelNachId.get(cur.nachfolger_id);
        if (!next) break;
        cur = next;
        n++;
      }
      return cur;
    };

    const preisVon = (artikel: any): number | null => {
      const g = (artikel?.laundry_article_prices ?? [])
        .filter((p: any) => p.gueltig_bis === null)
        .sort((x: any, y: any) => String(y.gueltig_ab).localeCompare(String(x.gueltig_ab)))[0];
      return g ? Number(g.preis) : null;
    };

    // Set-Zeilen des Hauses: Menge, Berechnungsart, Artikel, Abrechnungsmarke
    const setZeilen = (linenDef?.custom_categories ?? {}) as Record<string, any>;

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
        
        // Mengen aus custom_categories (umgestellt 05.09.2026)
        //
        // Vorher wurden sie aus den alten Spalten bedding_per_guest usw.
        // gebildet. Die setzt LinenSetRulesTab beim Speichern eines
        // Waeschesets ALLE auf 0 — und `0 || 1` ergibt in JavaScript 1.
        // Die Funktion meldete daher fuer jede Position 1 Stueck je Gast,
        // voellig unabhaengig vom tatsaechlichen Set.
        const zeilen = Object.entries(setZeilen);
        if (zeilen.length > 0) {
          requiredItems = {};

          for (const [key, cfg] of zeilen) {
            if (!cfg?.active) continue;

            // Saisonale Zeilen nur in ihrer Saison
            if (cfg.availability === 'seasonal') {
              const monat = checkInDate.getMonth() + 1;
              const winter = monat >= 10 || monat <= 4;
              if (cfg.season === 'winter' && !winter) continue;
              if (cfg.season === 'summer' && winter) continue;
            }

            const anzahl = Number(cfg.quantity ?? 0);
            if (!anzahl) continue;

            const menge = cfg.calculation_type === 'per_guest'
              ? booking.number_of_guests * anzahl
              : anzahl;
            if (menge > 0) requiredItems[key] = menge;
          }

          // Kosten ueber die Artikelnummer.
          //
          // Paketartikel decken mehrere Positionen ab und werden EINMAL
          // berechnet; welche Zeile abrechnet, sagt preis_zaehlt. Stueck-
          // artikel verhalten sich gegenteilig: MWHT steht in beiden
          // Haeusern auf Geschirr- und WB-Handtuechern und wird beide Male
          // berechnet.
          const zeileArtikel: Record<string, any> = {};
          for (const [key, cfg] of zeilen) {
            const nr = cfg?.external_artikelnummer?.default;
            if (!nr) continue;
            const gefunden = artikelNachNummer.get(String(nr).toUpperCase());
            if (gefunden) zeileArtikel[key] = aktuellerArtikel(gefunden);
          }

          const paketGruppen = new Map<string, string[]>();
          for (const key of Object.keys(requiredItems)) {
            const a = zeileArtikel[key];
            if (a?.abrechnungsart === 'paket') {
              paketGruppen.set(a.id, [...(paketGruppen.get(a.id) ?? []), key]);
            }
          }
          const rechnetAb = new Map<string, string>();
          for (const [artikelId, keys] of paketGruppen) {
            const markiert = keys.filter((k) => setZeilen[k]?.preis_zaehlt === true);
            rechnetAb.set(artikelId, markiert.length === 1 ? markiert[0] : keys[0]);
          }

          let summe = 0;
          let mitPreis = 0;
          for (const [key, menge] of Object.entries(requiredItems)) {
            const artikel = zeileArtikel[key];
            if (!artikel) continue;
            if (artikel.abrechnungsart === 'paket' && rechnetAb.get(artikel.id) !== key) continue;
            const preis = preisVon(artikel);
            if (typeof preis === 'number' && preis > 0) {
              summe += menge * preis;
              mitPreis++;
            }
          }

          // Kein einziger Preis greift -> "nicht berechenbar", nicht 0.
          estimatedCost = mitPreis > 0 ? Math.round(summe * 100) / 100 : undefined;
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
        // Gastname aus der guests-Relation (Etappe 4, Block 1)
        guest_name: (booking as any).guests?.name || booking.guest_name,
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
