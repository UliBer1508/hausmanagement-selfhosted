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
  bedding: number;
  large_towels: number;
  small_towels: number;
  bath_mats: number;
  sink_towels: number;
  sauna_towels: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { house_id, ai_settings } = await req.json();
    
    console.log('Optimizing linen inventory for house:', house_id);
    
    // 1. Hole die nächsten 3 Buchungen
    const { data: upcomingBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, number_of_guests, house_id')
      .eq('house_id', house_id)
      .gte('check_in', new Date().toISOString())
      .order('check_in', { ascending: true })
      .limit(ai_settings?.lookahead_bookings || 3);

    if (bookingsError) {
      throw new Error(`Error fetching bookings: ${bookingsError.message}`);
    }

    // 2. Hole aktuellen Lagerbestand
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('linen_stock, max_guests')
      .eq('id', house_id)
      .single();

    if (houseError) {
      throw new Error(`Error fetching house data: ${houseError.message}`);
    }

    // 3. Hole Wäsche-Regeln
    const { data: linenRules, error: rulesError } = await supabase
      .from('linen_set_definitions')
      .select('*')
      .eq('house_id', house_id)
      .single();

    if (rulesError) {
      console.log('No specific linen rules found, using defaults');
    }

    // 4. AI-Berechnung
    const optimization = calculateOptimalInventory(
      upcomingBookings || [],
      house.linen_stock || {},
      linenRules || getDefaultLinenRules(),
      ai_settings || getDefaultAISettings(),
      house.max_guests
    );

    // 5. Generiere Bestellvorschläge
    const orderSuggestion = generateOrderSuggestion(
      house.linen_stock || {},
      optimization.recommended_stock,
      ai_settings || getDefaultAISettings()
    );

    const result = {
      current_stock: house.linen_stock,
      upcoming_demand: optimization.demand_forecast,
      recommended_stock: optimization.recommended_stock,
      order_suggestion: orderSuggestion,
      ai_insights: optimization.insights,
      confidence_score: optimization.confidence,
      storage_utilization: optimization.storage_utilization
    };

    console.log('Optimization result:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in optimize-linen-inventory function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateOptimalInventory(
  bookings: any[],
  currentStock: LinenItem,
  rules: any,
  aiSettings: AISettings,
  maxGuests: number
) {
  const demandForecast: LinenItem = {
    bedding: 0,
    large_towels: 0,
    small_towels: 0,
    bath_mats: 0,
    sink_towels: 0,
    sauna_towels: 0
  };

  const insights = [];
  
  // Berechne Bedarf für die nächsten Buchungen
  let totalGuests = 0;
  let totalBookings = bookings.length;
  
  bookings.forEach(booking => {
    totalGuests += booking.number_of_guests;
    
    // Wäschebedarf pro Buchung basierend auf Regeln
    demandForecast.bedding += booking.number_of_guests * (rules.bedding_per_guest || 1);
    demandForecast.large_towels += booking.number_of_guests * (rules.large_towels_per_guest || 1);
    demandForecast.small_towels += booking.number_of_guests * (rules.small_towels_per_guest || 1);
    demandForecast.bath_mats += rules.bath_mats_per_booking || 1;
    demandForecast.sink_towels += rules.sink_towels_per_booking || 1;
    demandForecast.sauna_towels += booking.number_of_guests * (rules.sauna_towels_per_guest || 1);
  });

  // AI-Optimierung: Sicherheitspuffer und Lagerkapazität
  const safetyBuffer = aiSettings.safety_buffer || 1.2;
  const maxStorageRatio = aiSettings.max_storage_ratio || 1.5;
  
  const recommendedStock: LinenItem = {
    bedding: Math.min(Math.ceil(demandForecast.bedding * safetyBuffer), maxGuests * maxStorageRatio),
    large_towels: Math.min(Math.ceil(demandForecast.large_towels * safetyBuffer), maxGuests * maxStorageRatio),
    small_towels: Math.min(Math.ceil(demandForecast.small_towels * safetyBuffer), maxGuests * maxStorageRatio),
    bath_mats: Math.min(Math.ceil(demandForecast.bath_mats * safetyBuffer), totalBookings * 2),
    sink_towels: Math.min(Math.ceil(demandForecast.sink_towels * safetyBuffer), totalBookings * 2),
    sauna_towels: Math.min(Math.ceil(demandForecast.sauna_towels * safetyBuffer), maxGuests * maxStorageRatio)
  };

  // Insights generieren
  if (totalGuests > 0) {
    const avgGuestsPerBooking = totalGuests / totalBookings;
    insights.push(`Durchschnittlich ${avgGuestsPerBooking.toFixed(1)} Gäste pro Buchung`);
    
    if (avgGuestsPerBooking > maxGuests * 0.8) {
      insights.push("Hohe Auslastung erwartet - erhöhter Wäschebedarf");
    }
  }

  // Lagerauslastung berechnen
  const totalCurrentStock = Object.values(currentStock).reduce((sum, val) => sum + (val || 0), 0);
  const totalRecommendedStock = Object.values(recommendedStock).reduce((sum, val) => sum + val, 0);
  const storageUtilization = totalRecommendedStock / (maxGuests * 6); // 6 verschiedene Wäschetypen

  // Vertrauen basierend auf Datenverfügbarkeit
  const confidence = Math.min(0.95, 0.5 + (totalBookings * 0.15));

  return {
    demand_forecast: demandForecast,
    recommended_stock: recommendedStock,
    insights,
    confidence,
    storage_utilization: storageUtilization
  };
}

function generateOrderSuggestion(
  currentStock: LinenItem,
  recommendedStock: LinenItem,
  aiSettings: AISettings
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

  // Berechne realistische Kosten basierend auf Benutzerpreisen
  let estimatedCost = 0;
  Object.entries(orderItems).forEach(([itemType, details]: [string, any]) => {
    const price = aiSettings.prices[itemType as keyof typeof aiSettings.prices] || 15;
    estimatedCost += details.order_quantity * price;
  });

  return {
    items: orderItems,
    total_items: totalOrderValue,
    has_urgent_items: Object.values(orderItems).some((item: any) => item.urgency === 'high'),
    estimated_cost: estimatedCost,
    order_priority: totalOrderValue > 10 ? 'high' : totalOrderValue > 5 ? 'medium' : 'low'
  };
}

function getDefaultLinenRules() {
  return {
    bedding_per_guest: 1,
    large_towels_per_guest: 1,
    small_towels_per_guest: 1,
    bath_mats_per_booking: 1,
    sink_towels_per_booking: 1,
    sauna_towels_per_guest: 1
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