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
    console.log('[scrape-competitor-prices] Starting price scraping...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Hole alle aktiven Wettbewerber die gescraped werden müssen
    const { data: configs, error: configError } = await supabase
      .from('price_scraping_config')
      .select(`
        *,
        competitor_properties (
          id,
          property_name,
          competitor_name,
          property_url,
          platform,
          address,
          max_guests
        )
      `)
      .eq('is_active', true)
      .lte('next_scrape_at', new Date().toISOString());

    if (configError) {
      console.error('[scrape-competitor-prices] Config load error:', configError);
      throw configError;
    }

    console.log(`[scrape-competitor-prices] Found ${configs?.length || 0} properties to scrape`);

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Keine Wettbewerber zu scrapen',
          results: [] 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');
    }

    for (const config of configs) {
      const property = config.competitor_properties;
      
      if (!property) {
        console.warn(`[scrape-competitor-prices] Skipping config ${config.id}: No property data`);
        continue;
      }

      console.log(`[scrape-competitor-prices] Scraping: ${property.property_name}`);

      try {
        // Perplexity für Preis-Extraktion
        const priceQuery = `
Welche Preise hat "${property.property_name}" (${property.address}) 
auf ${property.platform} für die nächsten 30 Tage?

Gib ein JSON-Array zurück mit diesem Format:
[
  { "date": "2025-01-15", "price": 120, "available": true, "min_stay": 2 },
  { "date": "2025-01-16", "price": 130, "available": true, "min_stay": 2 }
]

Falls Preise nicht verfügbar: Gib einen geschätzten Durchschnittspreis für die Saison zurück.
        `;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
              { 
                role: 'system', 
                content: 'Du extrahierst Preisdaten von Ferienhaus-Plattformen. Antworte NUR mit validen JSON-Arrays.' 
              },
              { role: 'user', content: priceQuery }
            ],
            temperature: 0.1,
            max_tokens: 1500,
          }),
        });

        if (!response.ok) {
          throw new Error(`Perplexity API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Parse JSON (mit Fehlerbehandlung wie in search-competitors)
        let prices = [];
        try {
          prices = JSON.parse(content);
        } catch (e) {
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            prices = JSON.parse(jsonMatch[1]);
          } else {
            const startIndex = content.indexOf('[') !== -1 ? content.indexOf('[') : content.indexOf('{');
            if (startIndex !== -1) {
              prices = JSON.parse(content.substring(startIndex));
            } else {
              throw new Error('Konnte kein JSON in Perplexity-Antwort finden');
            }
          }
        }

        if (!Array.isArray(prices)) {
          prices = [prices];
        }

        console.log(`[scrape-competitor-prices] Extracted ${prices.length} price entries`);

        // Speichere Preise in DB
        const priceRecords = prices.map((p: any) => ({
          competitor_property_id: property.id,
          date: p.date,
          price: parseFloat(p.price) || 0,
          currency: 'EUR',
          min_stay: p.min_stay || null,
          is_available: p.available !== false,
          source: 'scraped',
          scraped_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('daily_pricing')
          .upsert(priceRecords, {
            onConflict: 'competitor_property_id,date',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.error('[scrape-competitor-prices] Insert error:', insertError);
          throw insertError;
        }

        // Update Scraping-Config
        const nextScrape = new Date();
        if (config.scraping_frequency === 'daily') {
          nextScrape.setDate(nextScrape.getDate() + 1);
        } else if (config.scraping_frequency === 'weekly') {
          nextScrape.setDate(nextScrape.getDate() + 7);
        } else if (config.scraping_frequency === 'monthly') {
          nextScrape.setMonth(nextScrape.getMonth() + 1);
        }

        await supabase
          .from('price_scraping_config')
          .update({
            last_scraped_at: new Date().toISOString(),
            next_scrape_at: nextScrape.toISOString(),
            error_count: 0,
            last_error: null
          })
          .eq('id', config.id);

        results.push({ 
          property: property.property_name, 
          success: true, 
          prices_scraped: prices.length 
        });

        console.log(`[scrape-competitor-prices] ✓ ${property.property_name}: ${prices.length} Preise gespeichert`);

      } catch (error) {
        console.error(`[scrape-competitor-prices] Error scraping ${property.property_name}:`, error);
        
        // Log Fehler in Config
        await supabase
          .from('price_scraping_config')
          .update({
            error_count: (config.error_count || 0) + 1,
            last_error: error.message
          })
          .eq('id', config.id);

        results.push({ 
          property: property.property_name, 
          success: false, 
          error: error.message 
        });
      }

      // Rate limiting: 1 Sekunde zwischen Requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[scrape-competitor-prices] Scraping complete');

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[scrape-competitor-prices] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
