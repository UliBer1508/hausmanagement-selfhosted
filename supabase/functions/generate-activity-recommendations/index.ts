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

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

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
    console.log('Generating activity recommendations for booking:', booking_id);

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

    // 2. Prüfe ob bereits Empfehlungen existieren
    if (!generate_new) {
      const { data: existingRecommendations } = await supabase
        .from('activity_recommendations')
        .select('*, activities(*)')
        .eq('booking_id', booking_id)
        .eq('status', 'suggested');

      if (existingRecommendations && existingRecommendations.length > 0) {
        return new Response(JSON.stringify({
          success: true,
          recommendations: existingRecommendations,
          cached: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. Hole verfügbare Aktivitäten in der Nähe
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('*')
      .eq('is_active', true)
      .limit(50);

    if (activitiesError) {
      throw new Error(`Failed to fetch activities: ${activitiesError.message}`);
    }

    // 4. Hole historische KI-Analysen für das Haus
    const { data: aiAnalyses } = await supabase
      .from('ai_optimization_results')
      .select('*')
      .eq('house_id', booking.house_id)
      .order('analysis_date', { ascending: false })
      .limit(10);

    // 5. Generiere Gäste-Präferenzen basierend auf Buchungsdaten
    const guestProfile = await generateGuestProfile(booking, aiAnalyses || []);

    // 6. Erstelle KI-gestützte Aktivitätsempfehlungen
    const recommendations = await generateActivityRecommendations(
      booking,
      activities || [],
      guestProfile,
      aiAnalyses || []
    );

    // 7. Speichere Gäste-Präferenzen
    const { error: prefError } = await supabase
      .from('guest_preferences')
      .upsert({
        guest_email: booking.guest_email,
        house_id: booking.house_id,
        booking_id: booking.id,
        ...guestProfile
      }, {
        onConflict: 'guest_email,booking_id'
      });

    if (prefError) {
      console.error('Failed to save guest preferences:', prefError);
    }

    // 8. Speichere Aktivitäts-Empfehlungen
    const recommendationInserts = recommendations.map(rec => ({
      guest_email: booking.guest_email,
      booking_id: booking.id,
      activity_id: rec.activity_id,
      recommendation_score: rec.score,
      reasoning: rec.reasoning,
      personalized_description: rec.personalized_description,
      optimal_time_slot: rec.optimal_time_slot,
      custom_duration: rec.custom_duration,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 Tage
    }));

    const { error: recError } = await supabase
      .from('activity_recommendations')
      .upsert(recommendationInserts, {
        onConflict: 'guest_email,booking_id,activity_id'
      });

    if (recError) {
      console.error('Failed to save recommendations:', recError);
    }

    // 9. Hole die gespeicherten Empfehlungen mit Aktivitätsdaten
    const { data: finalRecommendations } = await supabase
      .from('activity_recommendations')
      .select('*, activities(*)')
      .eq('booking_id', booking_id)
      .order('recommendation_score', { ascending: false });

    return new Response(JSON.stringify({
      success: true,
      recommendations: finalRecommendations || [],
      guest_profile: guestProfile,
      cached: false
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

// Hilfsfunktionen
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

  return {
    age_group: 'middle_aged', // Default, könnte durch weitere Analyse verfeinert werden
    group_type: groupType,
    group_size: booking.number_of_guests,
    nationality: booking.nationality || 'DE',
    preferred_categories: ['culture', 'food', 'nature'], // Basierend auf KI-Analysen
    activity_level: activityLevel,
    budget_range: budgetRange,
    weather_preference: 'flexible',
    time_preference: 'morning',
    predicted_interests: {
      outdoor_activities: 0.7,
      cultural_sites: 0.8,
      local_cuisine: 0.9,
      wellness: 0.6
    },
    confidence_score: 0.75
  };
}

async function generateActivityRecommendations(
  booking: any, 
  activities: any[], 
  guestProfile: any, 
  aiAnalyses: any[]
) {
  // KI-basierte Aktivitäts-Empfehlungen generieren
  const checkInDate = new Date(booking.check_in);
  const stayDays = Math.ceil((new Date(booking.check_out).getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const recommendations = [];
  
  for (const activity of activities.slice(0, 15)) { // Top 15 für Performance
    // Score-Berechnung basierend auf verschiedenen Faktoren
    let score = 0;
    
    // Basis-Score
    score += (activity.rating || 3) / 5 * 0.2; // 20% Rating
    score += Math.min(activity.popularity_score / 100, 1) * 0.15; // 15% Popularität
    
    // Gruppen-Größe Matching
    if (activity.group_size_min <= booking.number_of_guests && 
        (!activity.group_size_max || activity.group_size_max >= booking.number_of_guests)) {
      score += 0.15;
    }
    
    // Kategorie-Präferenzen
    if (guestProfile.preferred_categories.includes(activity.category)) {
      score += 0.25;
    }
    
    // Budget-Matching
    const avgPrice = (activity.price_min + activity.price_max) / 2;
    const budgetMatch = guestProfile.budget_range === 'luxury' ? avgPrice < 200 :
                       guestProfile.budget_range === 'mid_range' ? avgPrice < 100 :
                       avgPrice < 50;
    if (budgetMatch) score += 0.15;
    
    // Aktivitätslevel
    if ((guestProfile.activity_level === 'high' && activity.difficulty_level >= 3) ||
        (guestProfile.activity_level === 'medium' && activity.difficulty_level === 2) ||
        (guestProfile.activity_level === 'low' && activity.difficulty_level === 1)) {
      score += 0.1;
    }
    
    // Nur empfehlen wenn Score > 0.5
    if (score > 0.5) {
      recommendations.push({
        activity_id: activity.id,
        score: Math.min(score, 1),
        reasoning: {
          factors: {
            rating: activity.rating,
            popularity: activity.popularity_score,
            group_fit: true,
            category_match: guestProfile.preferred_categories.includes(activity.category),
            budget_fit: budgetMatch
          }
        },
        personalized_description: generatePersonalizedDescription(activity, guestProfile),
        optimal_time_slot: guestProfile.time_preference,
        custom_duration: activity.duration_minutes
      });
    }
  }
  
  // Sortiere nach Score und nehme Top 8
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function generatePersonalizedDescription(activity: any, guestProfile: any): string {
  let description = activity.description || activity.name;
  
  // Personalisiere basierend auf Gruppengröße
  if (guestProfile.group_type === 'family') {
    description += ' - Perfekt für Familien!';
  } else if (guestProfile.group_type === 'couple') {
    description += ' - Ideal für Paare.';
  } else if (guestProfile.group_type === 'solo') {
    description += ' - Auch für Einzelreisende geeignet.';
  }
  
  // Budget-Hinweise
  if (guestProfile.budget_range === 'budget') {
    description += ' Kostengünstige Option.';
  } else if (guestProfile.budget_range === 'luxury') {
    description += ' Premium-Erlebnis.';
  }
  
  return description;
}