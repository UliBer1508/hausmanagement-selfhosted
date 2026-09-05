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

    // 4. Preise holen — aus dem Artikelstamm, nicht aus ai_linen_settings
    //
    // UMGESTELLT 05.09.2026. Vorher stand hier `ai_linen_settings.prices`:
    // eine Preisliste JE HAUS, von Hand gepflegt, nachgeschlagen mit dem
    // Set-Schluessel. Zwei Fehler steckten darin:
    //
    //   1. Der Preis ist eine Eigenschaft des DIENSTLEISTERS, nicht des
    //      Hauses. Teuni stellt eine Sammelrechnung ueber beide Chalets;
    //      ein hausbezogener Preis ist dort gar nicht vorgesehen.
    //
    //   2. Der Set-Schluessel traf die Preisliste nicht. Venediger nennt die
    //      Zeile `bettwaesche`, die Preisliste kannte nur `bedding` — der
    //      groesste Posten der Bestellung fiel still aus der Rechnung. Eine
    //      Buchung mit 4 Gaesten kam auf 17,50 statt 57,00 EUR.
    //
    // Jetzt fuehrt der Weg ueber die Artikelnummer, die an der Set-Zeile
    // steht (external_artikelnummer.default): MW4 -> 9,50. Wie die Zeile
    // intern heisst, spielt keine Rolle mehr.
    //
    // ANMERKUNG: Dieselbe Aufloesung wird spaeter von vier weiteren Stellen
    // gebraucht (check-booking-linen-orders, LinenOrderAnalytics,
    // optimize-linen-inventory, LinenPricesTab). Sobald die zweite davon
    // umgestellt wird, gehoert sie in eine Datenbanksicht, damit es nicht
    // zwei Implementierungen gibt, die auseinanderlaufen koennen.

    const { data: artikelRoh, error: artikelError } = await supabase
      .from('laundry_articles')
      .select('id, artikelnummer, bezeichnung, abrechnungsart, nachfolger_id, laundry_article_prices(preis, gueltig_ab, gueltig_bis)');

    if (artikelError) {
      console.error('❌ Fehler beim Laden der Wäscheartikel:', artikelError);
      throw artikelError;
    }

    const artikelNachId = new Map<string, any>();
    const artikelNachNummer = new Map<string, any>();
    for (const a of (artikelRoh ?? []) as any[]) {
      artikelNachId.set(a.id, a);
      const nr = String(a.artikelnummer).toUpperCase();
      if (artikelNachNummer.has(nr)) {
        // Dieselbe Nummer bei zwei Dienstleistern — heute unmoeglich, da nur
        // Teuni Waescheartikel fuehrt. Melden statt still den ersten nehmen.
        console.warn(`⚠️ Artikelnummer ${nr} kommt mehrfach vor — verwendet wird der erste Treffer`);
      } else {
        artikelNachNummer.set(nr, a);
      }
    }

    // Nachfolgekette aufloesen: MWR -> MW3 -> MW4. Eine Set-Zeile zeigt auf
    // EINE Nummer; wechselt Teuni die Nummer, waechst der Preis am Nachfolger
    // nach. Ohne die Aufloesung fröre der Preisstand still ein.
    // Abbruch nach 10 Schritten, damit ein versehentlicher Zyklus die
    // Funktion nicht haengen laesst.
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
      const gueltig = (artikel?.laundry_article_prices ?? [])
        .filter((p: any) => p.gueltig_bis === null)
        .sort((x: any, y: any) => String(y.gueltig_ab).localeCompare(String(x.gueltig_ab)))[0];
      return gueltig ? Number(gueltig.preis) : null;
    };

    // Artikelnummer und Abrechnungsmarke je Set-Zeile
    const zeileArtikel: Record<string, any> = {};
    const zeilePreisZaehlt: Record<string, boolean | undefined> = {};
    for (const [key, config] of Object.entries(customCategories ?? {})) {
      const nr = (config as any)?.external_artikelnummer?.default;
      if (nr) {
        const gefunden = artikelNachNummer.get(String(nr).toUpperCase());
        if (gefunden) zeileArtikel[key] = aktuellerArtikel(gefunden);
        else console.warn(`⚠️ Set-Zeile ${key} verweist auf Artikel ${nr}, den es im Sortiment nicht gibt`);
      }
      zeilePreisZaehlt[key] = (config as any)?.preis_zaehlt;
    }

    // 5. Kosten rechnen
    //
    // WICHTIG (21.07.2026, weiterhin gueltig): Ein fehlender Preis ist NICHT
    // dasselbe wie ein Preis von 0. Fehlende Preise werden gesammelt und
    // zurueckgemeldet; greift KEIN einziger Preis, ist estimated_cost null
    // (= "nicht berechenbar") statt 0 (= "kostenlos").
    //
    // NEU 05.09.2026 — Paketartikel: "Mietwaesche Paket 5 Tlg" kann mehrere
    // Set-Positionen abdecken (bei Wald Bettwaesche, Kissenbezuege,
    // Spannbetttuecher). Dann wird es EINMAL berechnet, nicht je Position.
    // Welche Zeile abrechnet, steht in preis_zaehlt; die uebrigen gehen mit
    // 0 ein und sind als `im_paket` gekennzeichnet — das ist etwas anderes
    // als ein fehlender Preis und darf nicht als solcher gemeldet werden.
    //
    // Stueckartikel verhalten sich GEGENTEILIG: MWHT steht bei Wald auf zwei
    // Zeilen (Geschirrtuecher, WB-Handtuecher) und wird beide Male
    // berechnet. Deshalb entscheidet die Abrechnungsart des ARTIKELS, nicht
    // die Tatsache, dass eine Nummer mehrfach vorkommt.

    // Welche bestellten Zeilen teilen sich einen Paketartikel?
    const paketGruppen = new Map<string, string[]>();
    for (const key of Object.keys(orderItems)) {
      const a = zeileArtikel[key];
      if (a?.abrechnungsart === 'paket') {
        paketGruppen.set(a.id, [...(paketGruppen.get(a.id) ?? []), key]);
      }
    }

    // Je Paketgruppe die abrechnende Zeile bestimmen.
    const rechnetAb = new Map<string, string>();   // article_id -> set_zeile
    const warnungen: string[] = [];
    for (const [artikelId, keys] of paketGruppen) {
      const nummer = artikelNachId.get(artikelId)?.artikelnummer ?? artikelId;
      const markiert = keys.filter((k) => zeilePreisZaehlt[k] === true);
      if (keys.length === 1) {
        rechnetAb.set(artikelId, keys[0]);
      } else if (markiert.length === 1) {
        rechnetAb.set(artikelId, markiert[0]);
      } else {
        // Unentschieden: die erste Zeile rechnet ab, damit ueberhaupt ein
        // Betrag entsteht — aber sichtbar, nicht stillschweigend.
        rechnetAb.set(artikelId, keys[0]);
        warnungen.push(
          `${nummer} steht auf ${keys.length} Positionen (${keys.join(', ')}), ` +
          `${markiert.length === 0 ? 'ohne dass festgelegt ist' : `aber ${markiert.length}-fach markiert, welche`} ` +
          `abrechnet. Berechnet wurde ${keys[0]}. Bitte im Tab Wäschesets festlegen.`,
        );
      }
    }

    let totalCost = 0;
    const missingPrices: string[] = [];
    let pricedItemCount = 0;

    const itemDetails = Object.entries(orderItems).map(([item, qty]: [string, any]) => {
      const artikel = zeileArtikel[item];
      const istPaket = artikel?.abrechnungsart === 'paket';
      const imPaketEnthalten = istPaket && rechnetAb.get(artikel.id) !== item;

      if (imPaketEnthalten) {
        // Kein fehlender Preis — die Position ist im Paketpreis enthalten.
        return {
          item,
          quantity: qty,
          artikelnummer: artikel?.artikelnummer ?? null,
          unit_price: 0,
          total_price: 0,
          price_missing: false,
          im_paket: true,
        };
      }

      const rawPrice = artikel ? preisVon(artikel) : null;
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
        artikelnummer: artikel?.artikelnummer ?? null,
        unit_price: price,
        total_price: itemTotal,
        price_missing: !hasPrice,
        im_paket: false,
      };
    });

    if (missingPrices.length > 0) {
      console.warn('⚠️ Kein Artikel oder kein Preis hinterlegt für:', missingPrices.join(', '));
    }
    if (warnungen.length > 0) {
      console.warn('⚠️ Paketzuordnung unklar:', warnungen.join(' | '));
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

    // Haupt-Wäschefarbe der Bestellung.
    //
    // KORRIGIERT 05.09.2026: Vorher wurde fest auf die Schluessel `bedding`
    // und `pillow_cases` geschaut. Kein Haus fuehrt diese Schluessel noch —
    // Venediger nennt die Zeile `bettwaesche`, Wald `bettwaescheset`. Der
    // Zugriff lief damit fuer BEIDE Haeuser ins Leere und die Bestellung ging
    // immer mit dem Rueckfallwert 'white_striped' hinaus, unabhaengig davon,
    // was im Waescheset eingestellt war.
    //
    // Jetzt ueber die Kategorie: die Farbe der Bestellung ist die Farbe der
    // Bettwaesche, und Bettwaesche liegt im Schlafbereich. Das ist eine
    // Angabe aus den Daten und kein fest verdrahteter Schluesselname.
    let linenColor = 'white_striped';   // Rueckfall, wenn nichts gesetzt ist
    const schlafZeile = Object.keys(itemVariants).find(
      (key) => (customCategories as any)?.[key]?.category === 'Schlafbereich',
    );
    if (schlafZeile) {
      linenColor = itemVariants[schlafZeile];
    } else {
      const ersteFarbe = Object.values(itemVariants)[0];
      if (ersteFarbe) linenColor = ersteFarbe;
    }
    console.log('🎨 Main linen color:', linenColor, schlafZeile ? `(aus ${schlafZeile})` : '(kein Schlafbereich-Artikel)');

    return new Response(JSON.stringify({
      success: true,
      booking: {
        id: booking.id,
        // Gastname aus der guests-Relation (Etappe 4, Block 1)
        guest_name: (booking as any).guests?.name || booking.guest_name,
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
      // Seit 05.09.2026 heisst das: entweder ist der Set-Zeile kein
      // Teuni-Artikel zugeordnet, oder der Artikel hat keinen Preisstand.
      missing_prices: missingPrices,
      // Paketartikel, bei denen unklar ist, welche Position abrechnet.
      // Leer im Normalfall.
      warnungen,
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
