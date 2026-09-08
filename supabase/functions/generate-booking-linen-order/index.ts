import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

/*
 * Mengen und Kosten einer Wäschebestellung für EINE Buchung.
 *
 * Aufgerufen von: auto-create-linen-orders, create-linen-order-for-booking,
 * dem Tool update_linen_for_booking im chat-assistant und dem Knopf
 * "Wäsche berechnen" im Buchungsformular. Was hier falsch gerechnet wird,
 * ist an allen vier Stellen falsch.
 *
 * ============================================================
 * UMSTELLUNG 08.09.2026 — Preise kommen vom ARTIKEL
 * ============================================================
 *
 * Vorher schlug diese Funktion die Preise über `ai_linen_settings.prices`
 * nach, mit einer hartcodierten Ersatzliste (bedding 30, kitchen_towels 5).
 * Beides war falsch:
 *
 *   - Der Nachschlag lief über den SET-SCHLÜSSEL. Venediger nennt die
 *     Bettwäsche-Zeile `bettwaesche`, die Preisliste kannte nur `bedding` —
 *     der größte Posten jeder Bestellung fiel still aus der Rechnung.
 *   - Die Ersatzwerte waren erfunden. Bettwäsche kostet 9,50, nicht 30;
 *     Geschirrtücher 1,50, nicht 5.
 *
 * Der Weg führt jetzt über die Artikelnummer an der Set-Zeile
 * (`external_artikelnummer.default`), mit Auflösung der Nachfolgekette
 * (MWR -> MW3 -> MW4) und Beachtung der Abrechnungsart. Damit rechnet diese
 * Funktion dasselbe wie `check-booking-linen-orders`, `linenPricing.ts` im
 * Frontend und `55_bestellkosten_2026_nachrechnen.sql`.
 *
 * Ein fehlender Preis ist NICHT dasselbe wie ein Preis von 0. Greift kein
 * einziger Preis, ist `estimated_cost` null — "nicht berechenbar" statt
 * "kostenlos".
 */

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

    // 1. Buchung mit Haus laden
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        guests!bookings_guest_id_fkey(name),
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

    const guestName = (booking as any).guests?.name || (booking as any).guest_name || 'Unbekannt';
    console.log('✅ Booking loaded:', { guest: guestName, guests: booking.number_of_guests });

    // 2. Wäscheset des Hauses laden
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

    console.log('✅ Linen rules loaded for house:', (booking as any).houses?.name);

    // 3. Mengen aus dem Set (ohne Sicherheitspuffer, nur für diese Buchung)
    const orderItems: Record<string, number> = {};
    const itemVariants: Record<string, string> = {};

    const setZeilen = ((rules as any).custom_categories ?? {}) as Record<string, any>;
    const numberOfGuests: number = booking.number_of_guests || 0;

    if (Object.keys(setZeilen).length > 0) {
      console.log('🧮 Using custom_categories for linen calculation');

      const checkInDate: Date | null = booking.check_in ? new Date(booking.check_in) : null;

      const isWinter = (date: Date) => {
        const month = date.getUTCMonth() + 1; // 1-12
        return month === 11 || month === 12 || month <= 3;
      };

      for (const [key, config] of Object.entries(setZeilen)) {
        if (!config || (config as any).active === false) continue;

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
          if ((config as any).color) {
            itemVariants[key] = (config as any).color;
          }
        }
      }
    } else {
      // Rückfall auf die alten Spalten. ACHTUNG: LinenSetRulesTab setzt sie
      // beim Speichern eines Sets alle auf 0 — dieser Zweig liefert dann
      // nichts. Das ist gewollt: lieber leer als erfunden.
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

    Object.keys(orderItems).forEach((key) => {
      if (!orderItems[key] || orderItems[key] === 0) {
        delete orderItems[key];
      }
    });

    console.log('📦 Calculated order items:', orderItems);

    // 4. Artikel samt Preisstand laden
    const { data: artikelRoh, error: artikelError } = await supabase
      .from('laundry_articles')
      .select('id, artikelnummer, bezeichnung, abrechnungsart, nachfolger_id, laundry_article_prices(preis, gueltig_ab, gueltig_bis)');

    if (artikelError) throw artikelError;

    const artikelNachId = new Map<string, any>();
    const artikelNachNummer = new Map<string, any>();
    for (const a of (artikelRoh ?? []) as any[]) {
      artikelNachId.set(a.id, a);
      const nr = String(a.artikelnummer).toUpperCase();
      if (!artikelNachNummer.has(nr)) artikelNachNummer.set(nr, a);
    }

    // Nachfolgekette: Teuni vergibt für dieselbe Leistung neue Nummern.
    // Abbruch nach zehn Schritten, damit ein versehentlicher Zyklus die
    // Schleife nicht endlos laufen lässt.
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

    // Artikel je bestellter Set-Zeile
    const zeileArtikel: Record<string, any> = {};
    for (const key of Object.keys(orderItems)) {
      const nr = setZeilen?.[key]?.external_artikelnummer?.default;
      if (!nr) continue;
      const gefunden = artikelNachNummer.get(String(nr).toUpperCase());
      if (gefunden) zeileArtikel[key] = aktuellerArtikel(gefunden);
    }

    // Paketartikel decken mehrere Positionen ab und werden EINMAL berechnet;
    // welche Zeile abrechnet, sagt preis_zaehlt. Stückartikel verhalten sich
    // gegenteilig: MWHT steht auf Geschirr- und WB-Handtüchern und wird
    // beide Male berechnet.
    const paketGruppen = new Map<string, string[]>();
    for (const key of Object.keys(orderItems)) {
      const a = zeileArtikel[key];
      if (a?.abrechnungsart === 'paket') {
        paketGruppen.set(a.id, [...(paketGruppen.get(a.id) ?? []), key]);
      }
    }
    const rechnetAb = new Map<string, string>();
    for (const [artikelId, keys] of paketGruppen) {
      const markiert = keys.filter((k) => setZeilen?.[k]?.preis_zaehlt === true);
      rechnetAb.set(artikelId, markiert.length === 1 ? markiert[0] : keys[0]);
    }

    // 5. Kosten
    let totalCost = 0;
    const missingPrices: string[] = [];
    let pricedItemCount = 0;

    const itemDetails = Object.entries(orderItems).map(([item, qty]: [string, any]) => {
      const artikel = zeileArtikel[item];

      // Im Paket enthalten: kostet 0 — und das ist etwas anderes als
      // "kein Preis". Deshalb NICHT in missingPrices aufnehmen.
      if (artikel?.abrechnungsart === 'paket' && rechnetAb.get(artikel.id) !== item) {
        return {
          item,
          quantity: qty,
          unit_price: 0,
          total_price: 0,
          price_missing: false,
          im_paket_enthalten: true,
          artikelnummer: artikel.artikelnummer ?? null,
        };
      }

      const preis = preisVon(artikel);
      const hasPrice = typeof preis === 'number' && preis > 0;

      if (!hasPrice) {
        missingPrices.push(item);
      } else {
        pricedItemCount++;
      }

      const price = hasPrice ? (preis as number) : 0;
      const itemTotal = qty * price;
      totalCost += itemTotal;

      return {
        item,
        quantity: qty,
        unit_price: price,
        total_price: Math.round(itemTotal * 100) / 100,
        price_missing: !hasPrice,
        im_paket_enthalten: false,
        artikelnummer: artikel?.artikelnummer ?? null,
      };
    });

    if (missingPrices.length > 0) {
      console.warn('⚠️ Keine Preise hinterlegt für:', missingPrices.join(', '));
    }

    const estimatedCost = pricedItemCount > 0
      ? Math.round(totalCost * 100) / 100
      : null;

    const totalItems = Object.values(orderItems).reduce((sum: number, qty: any) => sum + qty, 0);

    console.log('✅ Order generated successfully:', {
      booking_id,
      total_items: totalItems,
      total_cost: estimatedCost,
      missing_prices: missingPrices
    });

    /*
     * Hauptfarbe der Bestellung.
     *
     * Bis 05.09.2026 wurde sie über `itemVariants.bedding` bestimmt. Diesen
     * Schlüssel führt kein Haus mehr (Venediger `bettwaesche`, Wald
     * `bettwaescheset`) — jede Bestellung ging mit dem Rückfallwert
     * `white_striped` hinaus, unabhängig von der Einstellung im Set. Jetzt
     * über die Kategorie Schlafbereich, ohne festen Schlüsselnamen.
     */
    let linenColor: string | null = null;
    for (const [key, farbe] of Object.entries(itemVariants)) {
      if (setZeilen?.[key]?.category === 'Schlafbereich') {
        linenColor = farbe;
        break;
      }
    }
    if (!linenColor) {
      const ersteFarbe = Object.values(itemVariants)[0];
      linenColor = (ersteFarbe as string) ?? null;
    }
    console.log('🎨 Main linen color:', linenColor);

    return new Response(JSON.stringify({
      success: true,
      booking: {
        id: booking.id,
        // Gastname aus der guests-Relation (Etappe 4, Block 1)
        guest_name: guestName,
        number_of_guests: booking.number_of_guests,
        check_in: booking.check_in,
        check_out: booking.check_out,
        house: (booking as any).houses
      },
      order_items: orderItems,
      item_variants: itemVariants,
      linen_color: linenColor,
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
