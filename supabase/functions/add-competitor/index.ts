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
    const { 
      house_id, 
      competitor_data,
      enable_scraping = true,
      scraping_frequency = 'daily'
    } = await req.json();
    
    console.log(`[add-competitor] Adding competitor for house ${house_id}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validiere Pflichtfelder
    if (!competitor_data.property_name || !competitor_data.competitor_name) {
      throw new Error('property_name und competitor_name sind Pflichtfelder');
    }

    // Erstelle Wettbewerber
    const { data: competitor, error: competitorError } = await supabase
      .from('competitor_properties')
      .insert({
        house_id: house_id,
        competitor_name: competitor_data.competitor_name,
        property_name: competitor_data.property_name,
        property_url: competitor_data.property_url || null,
        platform: competitor_data.platform || 'other',
        address: competitor_data.address || null,
        distance_km: competitor_data.distance_km || null,
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

      if (configError) {
        console.warn('[add-competitor] Config creation failed:', configError);
        // Nicht kritisch - fahre fort
      } else {
        scrapingConfig = config;
        console.log(`[add-competitor] Created scraping config: ${config.id}`);
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
