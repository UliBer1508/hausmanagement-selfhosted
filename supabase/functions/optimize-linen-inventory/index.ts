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
  learning_rate?: number;
  seasonal_weights?: Record<string, number>;
  guest_type_multipliers?: Record<string, number>;
  booking_pattern_influence?: number;
  weather_impact_factor?: number;
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

    console.log('Starting ML-enhanced optimization for house:', house_id);

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

    // Fetch historical usage data for ML learning
    const { data: historicalUsage } = await supabase
      .from('linen_usage_history')
      .select('*')
      .eq('house_id', house_id)
      .order('date', { ascending: false })
      .limit(50);

    // Fetch seasonal adjustments
    const currentMonth = new Date().getMonth() + 1;
    const { data: seasonalData } = await supabase
      .from('seasonal_adjustments')
      .select('*')
      .eq('house_id', house_id)
      .eq('month', currentMonth)
      .maybeSingle();

    // Fetch guest behavior patterns
    const { data: guestPatterns } = await supabase
      .from('guest_behavior_patterns')
      .select('*');

    // Fetch active model parameters
    const { data: modelParams } = await supabase
      .from('model_parameters')
      .select('*')
      .eq('house_id', house_id)
      .eq('is_active', true)
      .maybeSingle();

    const settings = ai_settings || getDefaultAISettings();
    
    // Merge with learned parameters
    if (modelParams) {
      settings.learning_rate = modelParams.learning_rate;
      settings.seasonal_weights = modelParams.seasonal_weights;
      settings.guest_type_multipliers = modelParams.guest_type_multipliers;
      settings.booking_pattern_influence = modelParams.booking_pattern_influence;
      settings.weather_impact_factor = modelParams.weather_impact_factor;
    }

    const rules = linenRules || getDefaultLinenRules();

    const optimization = calculateOptimalInventory(
      house.linen_stock || {},
      bookings || [],
      rules,
      settings,
      historicalUsage || [],
      seasonalData,
      guestPatterns || [],
      house.max_guests
    );

    const orderSuggestion = generateOrderSuggestion(
      optimization.current_stock,
      optimization.recommended_stock,
      settings
    );

    const result = {
      current_stock: optimization.current_stock,
      upcoming_demand: optimization.forecasted_demand,
      recommended_stock: optimization.recommended_stock,
      order_suggestion: orderSuggestion,
      ai_insights: optimization.insights,
      confidence_score: optimization.confidence,
      storage_utilization: optimization.storage_utilization,
      ml_metadata: {
        historical_samples: historicalUsage?.length || 0,
        seasonal_adjustment_applied: !!seasonalData,
        guest_patterns_used: guestPatterns?.length || 0,
        model_version: modelParams?.parameter_set_name || 'default'
      }
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

    // Calculate and save prediction accuracy if we have historical data
    if (historicalUsage && historicalUsage.length > 0) {
      await updatePredictionAccuracy(supabase, house_id, optimization, historicalUsage);
    }

    console.log('ML-enhanced optimization completed successfully');

    return new Response(JSON.stringify(result), {
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
  historicalUsage: any[],
  seasonalData: any,
  guestPatterns: any[],
  maxGuests: number
) {
  const linenTypes = ['bedding', 'large_towels', 'small_towels', 'bath_mats', 'sink_towels', 'sauna_towels'];
  
  const forecasted: LinenItem = {};
  const recommended: LinenItem = {};
  const insights: string[] = [];

  // Calculate base demand from bookings
  let totalGuests = 0;
  let totalBookings = bookings.length;

  bookings.forEach(booking => {
    totalGuests += booking.number_of_guests || 0;
  });

  // Apply machine learning adjustments
  let demandMultiplier = 1.0;
  
  // 1. Historical pattern learning
  if (historicalUsage.length > 5) {
    const avgActualUsage = calculateAverageUsage(historicalUsage);
    const avgPredictedUsage = calculateAveragePredictedUsage(historicalUsage);
    
    if (avgPredictedUsage > 0) {
      const historicalAccuracy = avgActualUsage / avgPredictedUsage;
      demandMultiplier *= historicalAccuracy;
      insights.push(`Historische Lernrate angewendet: ${(historicalAccuracy * 100).toFixed(1)}%`);
    }
  }

  // 2. Seasonal adjustments
  if (seasonalData && settings.seasonal_factor) {
    const seasonalFactor = seasonalData.adjustment_factors?.average || 1.0;
    demandMultiplier *= seasonalFactor;
    insights.push(`Saisonaler Faktor: ${(seasonalFactor * 100).toFixed(1)}% (${seasonalData.season})`);
  }

  // 3. Guest behavior patterns
  if (guestPatterns.length > 0 && bookings.length > 0) {
    const avgGuestMultiplier = calculateGuestTypeMultiplier(bookings, guestPatterns);
    if (avgGuestMultiplier !== 1.0) {
      demandMultiplier *= avgGuestMultiplier;
      insights.push(`Gästetyp-Anpassung: ${(avgGuestMultiplier * 100).toFixed(1)}%`);
    }
  }

  // 4. Booking pattern influence
  if (settings.booking_pattern_influence && bookings.length > 0) {
    const patternFactor = analyzeBookingPattern(bookings);
    demandMultiplier *= (1 + (patternFactor - 1) * settings.booking_pattern_influence);
    insights.push(`Buchungsmuster-Einfluss: ${(patternFactor * 100).toFixed(1)}%`);
  }

  // Calculate demand for each linen type with ML adjustments
  linenTypes.forEach(type => {
    const perGuest = rules[`${type}_per_guest`] || 0;
    const perBooking = rules[`${type}_per_booking`] || 0;
    
    const baseDemand = (totalGuests * perGuest) + (totalBookings * perBooking);
    forecasted[type] = Math.ceil(baseDemand * demandMultiplier);
    
    // Apply safety buffer
    recommended[type] = Math.ceil(forecasted[type] * settings.safety_buffer);
    
    // Apply max storage ratio
    const maxStorage = Math.ceil(recommended[type] * settings.max_storage_ratio);
    recommended[type] = Math.min(recommended[type], maxStorage);
  });

  // Calculate confidence score based on data availability
  let confidence = 0.5; // Base confidence
  if (historicalUsage.length > 10) confidence += 0.2;
  if (historicalUsage.length > 30) confidence += 0.1;
  if (seasonalData) confidence += 0.1;
  if (guestPatterns.length > 0) confidence += 0.1;
  confidence = Math.min(confidence, 0.99);

  // Generate insights
  if (bookings.length > 3) {
    insights.push(`Hohe Buchungsdichte in den nächsten ${settings.lookahead_bookings} Buchungen erkannt`);
  }

  if (totalGuests / bookings.length > 4) {
    insights.push('Große Gruppen erwartet - erhöhter Wäschebedarf');
  }

  const storage_utilization = Object.keys(currentStock).reduce((sum, key) => {
    return sum + (currentStock[key] / (recommended[key] || 1));
  }, 0) / linenTypes.length;

  insights.push(`Speicherauslastung: ${(storage_utilization * 100).toFixed(0)}%`);
  insights.push(`Konfidenzwert: ${(confidence * 100).toFixed(0)}% basierend auf ${historicalUsage.length} historischen Datenpunkten`);

  return {
    current_stock: currentStock,
    forecasted_demand: forecasted,
    recommended_stock: recommended,
    insights,
    confidence,
    storage_utilization
  };
}

function calculateAverageUsage(history: any[]): number {
  if (history.length === 0) return 0;
  const total = history.reduce((sum, record) => {
    const usage = record.actual_usage || {};
    return sum + Object.values(usage).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  }, 0);
  return total / history.length;
}

function calculateAveragePredictedUsage(history: any[]): number {
  if (history.length === 0) return 0;
  const total = history.reduce((sum, record) => {
    const predicted = record.predicted_usage || {};
    return sum + Object.values(predicted).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  }, 0);
  return total / history.length;
}

function calculateGuestTypeMultiplier(bookings: any[], patterns: any[]): number {
  if (patterns.length === 0) return 1.0;
  
  let totalMultiplier = 0;
  let count = 0;

  bookings.forEach(booking => {
    const nationality = booking.nationality;
    const pattern = patterns.find(p => p.nationality === nationality);
    if (pattern) {
      totalMultiplier += pattern.usage_multiplier || 1.0;
      count++;
    }
  });

  return count > 0 ? totalMultiplier / count : 1.0;
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

async function updatePredictionAccuracy(
  supabaseClient: any,
  houseId: string,
  optimization: any,
  historicalUsage: any[]
) {
  // Compare latest predictions with actual usage
  const latest = historicalUsage[0];
  if (!latest || !latest.predicted_usage || !latest.actual_usage) return;

  const predicted = latest.predicted_usage;
  const actual = latest.actual_usage;

  // Calculate MAE and RMSE
  let totalError = 0;
  let totalSquaredError = 0;
  let count = 0;

  Object.keys(predicted).forEach(key => {
    if (actual[key] !== undefined) {
      const error = Math.abs(predicted[key] - actual[key]);
      totalError += error;
      totalSquaredError += error * error;
      count++;
    }
  });

  if (count > 0) {
    const mae = totalError / count;
    const rmse = Math.sqrt(totalSquaredError / count);
    const accuracyScore = Math.max(0, 1 - (mae / 10)); // Normalize to 0-1

    await supabaseClient
      .from('prediction_accuracy')
      .insert({
        house_id: houseId,
        prediction_date: latest.date,
        actual_date: new Date().toISOString(),
        predicted_values: predicted,
        actual_values: actual,
        accuracy_score: accuracyScore,
        mae: mae,
        rmse: rmse,
        model_version: 'v2_ml_enhanced'
      });
  }
}

function getDefaultAISettings(): AISettings {
  return {
    lookahead_bookings: 3,
    safety_buffer: 1.2,
    max_storage_ratio: 1.5,
    reorder_threshold: 0.8,
    seasonal_factor: false,
    learning_rate: 0.01,
    seasonal_weights: {},
    guest_type_multipliers: {},
    booking_pattern_influence: 1.0,
    weather_impact_factor: 1.0,
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