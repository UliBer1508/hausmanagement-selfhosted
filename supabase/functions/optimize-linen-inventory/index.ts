import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface AISettings {
  lookahead_bookings: number;
  safety_buffer: number;
  max_storage_ratio: number;
  reorder_threshold: number;
  seasonal_factor: boolean;
  prices: {
    bedding: number;
    large_towels: number;
    small_towels: number;
    bath_mats: number;
    sink_towels: number;
    sauna_towels: number;
  };
}

interface LinenItem {
  bedding?: number;
  large_towels?: number;
  small_towels?: number;
  bath_mats?: number;
  sink_towels?: number;
  sauna_towels?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { house_id, ai_settings } = await req.json();
    
    if (!house_id) {
      throw new Error('house_id is required');
    }

    console.log('Starting optimization for house:', house_id);

    // Fetch upcoming bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('house_id', house_id)
      .gte('check_in', new Date().toISOString())
      .order('check_in', { ascending: true })
      .limit(ai_settings?.lookahead_bookings || 5);

    if (bookingsError) throw bookingsError;

    // Fetch house data
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('linen_stock, ordered_linen, max_guests')
      .eq('id', house_id)
      .single();

    if (houseError) throw houseError;

    // Fetch linen rules
    const { data: linenRules, error: rulesError } = await supabase
      .from('linen_set_definitions')
      .select('*')
      .eq('house_id', house_id)
      .maybeSingle();

    if (rulesError) console.error('Error fetching linen rules:', rulesError);

    /*
     * Teuni-Artikel mit Preisen (umgestellt 05.09.2026).
     *
     * Vorher wurde der Preis aus ai_settings.prices genommen, mit
     * Pauschalfallback 15 EUR fuer JEDEN Artikel. Ein Badvorleger kostet
     * 1,10 — der Fallback lag also um das Dreizehnfache daneben, und
     * ai_settings.prices wird seit der Umstellung der Preismaske gar nicht
     * mehr gepflegt.
     */
    const { data: artikelRoh } = await supabase
      .from('laundry_articles')
      .select('id, artikelnummer, abrechnungsart, nachfolger_id, laundry_article_prices(preis, gueltig_ab, gueltig_bis)');

    const artikelNachId = new Map<string, any>();
    const artikelNachNummer = new Map<string, any>();
    for (const a of (artikelRoh ?? []) as any[]) {
      artikelNachId.set(a.id, a);
      const nr = String(a.artikelnummer).toUpperCase();
      if (!artikelNachNummer.has(nr)) artikelNachNummer.set(nr, a);
    }

    // Preis je SET-SCHLUESSEL, aufgeloest ueber Artikelnummer und
    // Nachfolgekette (MWR -> MW3 -> MW4).
    const preisJeSchluessel: Record<string, number> = {};
    const setZeilen = (linenRules?.custom_categories ?? {}) as Record<string, any>;
    for (const [key, zeile] of Object.entries(setZeilen)) {
      const nr = (zeile as any)?.external_artikelnummer?.default;
      if (!nr) continue;
      let a = artikelNachNummer.get(String(nr).toUpperCase());
      let n = 0;
      while (a?.nachfolger_id && n < 10) {
        const next = artikelNachId.get(a.nachfolger_id);
        if (!next) break;
        a = next; n++;
      }
      const gueltig = (a?.laundry_article_prices ?? [])
        .filter((pr: any) => pr.gueltig_bis === null)
        .sort((x: any, y: any) => String(y.gueltig_ab).localeCompare(String(x.gueltig_ab)))[0];
      if (gueltig) preisJeSchluessel[key] = Number(gueltig.preis);
    }

    const settings = ai_settings || getDefaultAISettings();
    const rules = linenRules || getDefaultLinenRules();

    const optimization = calculateOptimalInventory(
      house.linen_stock || {},
      bookings || [],
      rules,
      settings,
      house.max_guests
    );

    const orderSuggestion = generateOrderSuggestion(
      optimization.current_stock,
      optimization.recommended_stock,
      settings,
      preisJeSchluessel
    );

    const result = {
      current_stock: optimization.current_stock,
      upcoming_demand: optimization.forecasted_demand,
      recommended_stock: optimization.recommended_stock,
      order_suggestion: orderSuggestion,
      ai_insights: optimization.insights,
      confidence_score: optimization.confidence,
      storage_utilization: optimization.storage_utilization
    };

    // Save optimization result to database
    await supabase
      .from('ai_optimization_results')
      .insert({
        house_id,
        optimization_result: result,
        confidence_score: optimization.confidence,
        recommendations: orderSuggestion.items
      });

    // Check buffer status
    const bufferStatus = checkBufferStatus(house_id, optimization.current_stock);
    console.log('🎯 Buffer status:', bufferStatus);

    console.log('Optimization completed successfully');

    return new Response(JSON.stringify({
      ...result,
      buffer_status: bufferStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Optimization error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

function calculateOptimalInventory(
  currentStock: LinenItem,
  bookings: any[],
  rules: any,
  settings: AISettings,
  maxGuests: number
) {
  /*
   * Positionen aus dem Waescheset (umgestellt 05.09.2026).
   *
   * Vorher eine feste Liste von sechs Schluesseln, die zu keinem der
   * beiden Haeuser mehr passt: Venediger fuehrt `bettwaesche`, Wald
   * `bettwaescheset`, `bedding` gibt es nirgends. Die Mengen kamen aus
   * den Altspalten `${type}_per_guest`, die LinenSetRulesTab beim
   * Speichern eines Sets auf 0 setzt — die Prognose war damit leer.
   */
  const zeilen = (rules?.custom_categories ?? {}) as Record<string, any>;
  const linenTypes = Object.entries(zeilen)
    .filter(([, z]) => (z as any)?.active)
    .map(([key]) => key);
  
  const forecasted: LinenItem = {};
  const recommended: LinenItem = {};
  const insights: string[] = [];

  // Calculate base demand from bookings
  let totalGuests = 0;
  let totalBookings = bookings.length;

  bookings.forEach(booking => {
    totalGuests += booking.number_of_guests || 0;
  });

  // Apply booking pattern adjustment
  let demandMultiplier = 1.0;
  
  if (bookings.length > 0) {
    const patternFactor = analyzeBookingPattern(bookings);
    if (patternFactor !== 1.0) {
      demandMultiplier *= patternFactor;
      insights.push(`Buchungsmuster-Anpassung: ${(patternFactor * 100).toFixed(1)}%`);
    }
  }

  // Calculate demand for each linen type
  linenTypes.forEach(type => {
    const zeile = zeilen[type] ?? {};
    const anzahl = Number(zeile.quantity ?? 0);
    const perGuest = zeile.calculation_type === 'per_guest' ? anzahl : 0;
    const perBooking = zeile.calculation_type === 'per_guest' ? 0 : anzahl;

    const baseDemand = (totalGuests * perGuest) + (totalBookings * perBooking);
    forecasted[type] = Math.ceil(baseDemand * demandMultiplier);
    
    // Berechne empfohlenen Bestand OHNE Safety Buffer
    // Buffer wird separat im Inventar vorgehalten
    recommended[type] = forecasted[type];
    
    // Apply max storage ratio
    const maxStorage = Math.ceil(recommended[type] * settings.max_storage_ratio);
    recommended[type] = Math.min(recommended[type], maxStorage);
  });

  // Calculate confidence score based on data availability
  let confidence = 0.6; // Base confidence without ML data
  if (bookings.length > 3) confidence += 0.1;
  if (bookings.length > 5) confidence += 0.1;
  confidence = Math.min(confidence, 0.85);

  // Generate insights
  if (bookings.length > 3) {
    insights.push(`Hohe Buchungsdichte: ${bookings.length} Buchungen im Vorausblick`);
  }

  if (totalBookings > 0 && totalGuests / totalBookings > 4) {
    insights.push('Große Gruppen erwartet - erhöhter Wäschebedarf');
  }

  const storage_utilization = Object.keys(currentStock).reduce((sum, key) => {
    return sum + (currentStock[key] / (recommended[key] || 1));
  }, 0) / linenTypes.length;

  insights.push(`Speicherauslastung: ${(storage_utilization * 100).toFixed(0)}%`);
  insights.push(`Konfidenzwert: ${(confidence * 100).toFixed(0)}%`);

  return {
    current_stock: currentStock,
    forecasted_demand: forecasted,
    recommended_stock: recommended,
    insights,
    confidence,
    storage_utilization
  };
}

function analyzeBookingPattern(bookings: any[]): number {
  if (bookings.length < 2) return 1.0;
  
  // Analyze gaps between bookings
  const gaps = [];
  for (let i = 1; i < bookings.length; i++) {
    const gap = new Date(bookings[i].check_in).getTime() - new Date(bookings[i-1].check_out).getTime();
    gaps.push(gap / (1000 * 60 * 60 * 24)); // days
  }
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  
  // Short gaps mean higher turnover, need more buffer
  if (avgGap < 1) return 1.2;
  if (avgGap < 2) return 1.1;
  return 1.0;
}

function generateOrderSuggestion(
  currentStock: LinenItem,
  recommendedStock: LinenItem,
  aiSettings: AISettings,
  preisJeSchluessel: Record<string, number>
) {
  const orderItems: any = {};
  let totalOrderValue = 0;
  const reorderThreshold = aiSettings.reorder_threshold || 0.8;

  // Für jeden Wäschetyp prüfen ob Nachbestellung nötig
  Object.keys(recommendedStock).forEach(itemType => {
    const current = currentStock[itemType as keyof LinenItem] || 0;
    const recommended = recommendedStock[itemType as keyof LinenItem];
    const threshold = recommended * reorderThreshold;

    if (current < threshold) {
      const orderQuantity = recommended - current;
      orderItems[itemType] = {
        current_stock: current,
        recommended: recommended,
        order_quantity: orderQuantity,
        urgency: current < (recommended * 0.5) ? 'high' : 'medium'
      };
      totalOrderValue += orderQuantity;
    }
  });

  /*
   * Kosten aus den Artikelpreisen.
   *
   * Kein Pauschalfallback mehr: Positionen ohne hinterlegten Preis gehen
   * NICHT mit einem geschaetzten Wert ein, sondern werden gemeldet. Greift
   * kein einziger Preis, bleibt estimated_cost leer — "nicht berechenbar"
   * statt "kostenlos".
   */
  let summe = 0;
  let mitPreis = 0;
  const ohnePreis: string[] = [];
  Object.entries(orderItems).forEach(([itemType, details]: [string, any]) => {
    const price = preisJeSchluessel[itemType];
    if (typeof price === 'number' && price > 0) {
      summe += details.order_quantity * price;
      mitPreis++;
    } else {
      ohnePreis.push(itemType);
    }
  });
  const estimatedCost = mitPreis > 0 ? Math.round(summe * 100) / 100 : undefined;

  return {
    items: orderItems,
    total_items: totalOrderValue,
    has_urgent_items: Object.values(orderItems).some((item: any) => item.urgency === 'high'),
    estimated_cost: estimatedCost,
    ohne_preis: ohnePreis,
    order_priority: totalOrderValue > 10 ? 'high' : totalOrderValue > 5 ? 'medium' : 'low'
  };
}

/*
 * Ersatzregeln, wenn ein Haus gar kein Waescheset hat.
 *
 * Vorher standen hier sechs erfundene Altspalten mit je 1 Stueck. Die
 * werden nirgends mehr gelesen — und ein erfundenes Set waere ohnehin
 * schlechter als gar keines: es liefert Zahlen, die niemand hinterfragt.
 * Ohne Set gibt es keine Positionen und damit keine Empfehlung.
 */
function getDefaultLinenRules() {
  return { custom_categories: {} };
}

function checkBufferStatus(
  house_id: string,
  currentStock: LinenItem
) {
  // Default buffer values
  const minBufferStock = {
    bedding: 5,
    large_towels: 5,
    small_towels: 5,
    sauna_towels: 5,
    bath_mats: 3,
    sink_towels: 3,
    kitchen_towels: 2
  };

  return checkBufferDeficit(currentStock, minBufferStock);
}

function checkBufferDeficit(currentStock: LinenItem, minBufferStock: any) {
  const bufferDeficit: any = {};
  let needsBufferRefill = false;

  Object.keys(minBufferStock).forEach(itemType => {
    const current = currentStock[itemType as keyof LinenItem] || 0;
    const minBuffer = minBufferStock[itemType];

    if (current < minBuffer) {
      bufferDeficit[itemType] = {
        current_buffer: current,
        min_buffer: minBuffer,
        refill_quantity: minBuffer - current
      };
      needsBufferRefill = true;
    }
  });

  return {
    needs_refill: needsBufferRefill,
    deficit: bufferDeficit,
    status: needsBufferRefill ? 'critical' : 'ok'
  };
}

function getDefaultAISettings(): AISettings {
  return {
    lookahead_bookings: 3,
    safety_buffer: 1.2,
    max_storage_ratio: 1.5,
    reorder_threshold: 0.8,
    seasonal_factor: false,
    prices: {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      bath_mats: 15,
      sink_towels: 8,
      sauna_towels: 20
    }
  };
}
