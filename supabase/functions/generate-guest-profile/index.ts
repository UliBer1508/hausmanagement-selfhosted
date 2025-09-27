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

interface BookingData {
  id: string;
  guest_name: string;
  guest_email: string;
  nationality: string;
  number_of_guests: number;
  check_in: string;
  check_out: string;
  house: {
    name: string;
    address: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id, generate_new = false } = await req.json();
    console.log('Generating guest profile for booking:', booking_id);

    // 1. Hole Buchungsdaten
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        houses (name, address)
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message}`);
    }

    // 2. Prüfe ob bereits Gästeprofil existiert
    if (!generate_new) {
      const { data: existingProfile } = await supabase
        .from('guest_preferences')
        .select('*')
        .eq('booking_id', booking_id)
        .eq('guest_email', booking.guest_email)
        .single();

      if (existingProfile) {
        return new Response(JSON.stringify({
          success: true,
          guest_profile: existingProfile,
          cached: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. Hole historische KI-Analysen für das Haus
    const { data: aiAnalyses } = await supabase
      .from('ai_optimization_results')
      .select('*')
      .eq('house_id', booking.house_id)
      .order('analysis_date', { ascending: false })
      .limit(10);

    // 4. Generiere Gäste-Präferenzen basierend auf Buchungsdaten
    const guestProfile = await generateGuestProfile(booking, aiAnalyses || []);

    // 5. Speichere Gäste-Präferenzen in der Datenbank
    const { data: savedProfile, error: prefError } = await supabase
      .from('guest_preferences')
      .upsert({
        guest_email: booking.guest_email,
        house_id: booking.house_id,
        booking_id: booking.id,
        ...guestProfile
      }, {
        onConflict: 'guest_email,booking_id'
      })
      .select()
      .single();

    if (prefError) {
      throw new Error(`Failed to save guest preferences: ${prefError.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      guest_profile: savedProfile,
      cached: false,
      message: 'Guest profile generated and saved for external usage'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating activity recommendations:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Hilfsfunktion zur Generierung von Gästeprofilen
async function generateGuestProfile(booking: any, aiAnalyses: any[]) {
  const checkInDate = new Date(booking.check_in);
  const checkOutDate = new Date(booking.check_out);
  const stayDuration = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Demografische Analyse
  const groupType = booking.number_of_guests === 1 ? 'solo' :
                   booking.number_of_guests === 2 ? 'couple' :
                   booking.number_of_guests > 4 ? 'group' : 'family';
  
  // Aktivitätslevel basierend auf Aufenthaltsdauer
  const activityLevel = stayDuration <= 2 ? 'high' : // Kurze Trips = aktiv
                       stayDuration <= 7 ? 'medium' : 'low'; // Längere Trips = entspannt
  
  // Budget-Schätzung basierend auf Buchungstyp
  const budgetRange = booking.booking_amount > 200 ? 'luxury' :
                     booking.booking_amount > 100 ? 'mid_range' : 'budget';

  // Analysiere historische KI-Daten für bessere Einschätzungen
  let preferredCategories = ['culture', 'food', 'nature']; // Default
  let confidenceScore = 0.75;
  
  if (aiAnalyses && aiAnalyses.length > 0) {
    // Extrahiere Muster aus historischen Analysen
    const recentAnalysis = aiAnalyses[0];
    if (recentAnalysis.guest_behavior_insights) {
      preferredCategories = recentAnalysis.guest_behavior_insights.popular_categories || preferredCategories;
      confidenceScore = Math.min(confidenceScore + 0.1, 0.95);
    }
  }

  return {
    age_group: 'middle_aged', // Standardwert - könnte durch weitere Analyse verfeinert werden
    group_type: groupType,
    group_size: booking.number_of_guests,
    nationality: booking.nationality || 'DE',
    preferred_categories: preferredCategories,
    activity_level: activityLevel,
    budget_range: budgetRange,
    weather_preference: 'flexible',
    time_preference: 'morning',
    predicted_interests: {
      outdoor_activities: 0.7,
      cultural_sites: 0.8,
      local_cuisine: 0.9,
      wellness: 0.6,
      shopping: 0.5,
      nightlife: groupType === 'couple' || groupType === 'group' ? 0.6 : 0.3
    },
    confidence_score: confidenceScore,
    // Zusätzliche Metadaten für externe Anwendungen
    stay_duration: stayDuration,
    check_in_date: booking.check_in,
    check_out_date: booking.check_out,
    house_location: booking.houses?.address || '',
    booking_source: booking.source || 'unknown'
  };
}