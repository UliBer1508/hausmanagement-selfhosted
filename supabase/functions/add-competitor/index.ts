import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Erlaubte Plattformen (müssen mit der DB-Constraint übereinstimmen)
const ALLOWED_PLATFORMS = ['booking.com', 'airbnb', 'vrbo', 'fewo-direkte', 'other'];

function normalizePlatform(platform: string | undefined): string {
  if (!platform) return 'other';
  
  const normalized = platform.toLowerCase().trim();
  
  // Direkter Match
  if (ALLOWED_PLATFORMS.includes(normalized)) {
    return normalized;
  }
  
  // Fuzzy-Match für bekannte Plattformen
  if (normalized.includes('booking')) return 'booking.com';
  if (normalized.includes('airbnb')) return 'airbnb';
  if (normalized.includes('vrbo')) return 'vrbo';
  if (normalized.includes('fewo') || normalized.includes('fewodirekt')) return 'fewo-direkte';
  
  // Alles andere ist "other"
  return 'other';
}

export default serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      house_id, 
      competitor_data,
      enable_scraping = true,
      scraping_frequency = 'daily'
    } = await req.json();
    
    console.log(`[add-competitor] Adding competitor for house ${house_id}`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validierung
    if (!house_id) {
      throw new Error('house_id ist erforderlich');
    }
    
    if (!competitor_data?.property_name || !competitor_data?.competitor_name) {
      throw new Error('property_name und competitor_name sind Pflichtfelder');
    }

    // Normalisiere die Plattform
    const normalizedPlatform = normalizePlatform(competitor_data.platform);
    console.log(`[add-competitor] Platform "${competitor_data.platform}" -> "${normalizedPlatform}"`);

    // Speichere Wettbewerber
    const { data: competitor, error: competitorError } = await supabase
      .from('competitor_properties')
      .insert({
        house_id: house_id,
        property_name: competitor_data.property_name,
        competitor_name: competitor_data.competitor_name,
        property_url: competitor_data.property_url || null,
        platform: normalizedPlatform,
        address: competitor_data.address || null,
        distance_km: competitor_data.distance || competitor_data.distance_km || null,
        max_guests: competitor_data.max_guests || null,
        bedrooms: competitor_data.bedrooms || null,
        bathrooms: competitor_data.bathrooms || null,
        amenities: competitor_data.amenities || [],
        notes: competitor_data.notes || null,
        is_active: true
      })
      .select()
      .single();

    if (competitorError) {
      console.error('[add-competitor] Insert error:', competitorError);
      throw new Error(`Fehler beim Speichern: ${competitorError.message}`);
    }

    console.log(`[add-competitor] Created competitor: ${competitor.id}`);

    // Erstelle Scraping-Config wenn gewünscht
    let scrapingConfig = null;
    if (enable_scraping && competitor_data.property_url) {
      const nextScrape = new Date();
      nextScrape.setHours(nextScrape.getHours() + 1); // Erste Scraping in 1 Stunde

      const { data: config, error: configError } = await supabase
        .from('price_scraping_config')
        .select('*')
        .eq('competitor_property_id', competitor.id)
        .maybeSingle();

      // Nur erstellen, wenn noch nicht vorhanden
      if (!config) {
        const { data: newConfig, error: createError } = await supabase
          .from('price_scraping_config')
          .insert({
            competitor_property_id: competitor.id,
            scraping_method: 'perplexity',
            scraping_frequency: scraping_frequency,
            next_scrape_at: nextScrape.toISOString(),
            is_active: true,
            scraping_params: {}
          })
          .select()
          .single();

        if (createError) {
          console.warn('[add-competitor] Config creation failed:', createError);
        } else {
          scrapingConfig = newConfig;
          console.log(`[add-competitor] Created scraping config: ${newConfig.id}`);
        }
      } else {
        scrapingConfig = config;
        console.log('[add-competitor] Scraping config already exists');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        competitor: competitor,
        scraping_config: scrapingConfig,
        message: `Wettbewerber "${competitor.property_name}" erfolgreich hinzugefügt`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[add-competitor] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
