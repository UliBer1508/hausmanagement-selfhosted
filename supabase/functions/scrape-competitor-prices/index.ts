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
    
    // Parse request body for manual flag
    const { manual = false } = await req.json().catch(() => ({ manual: false }));
    console.log(`[scrape-competitor-prices] Mode: ${manual ? 'MANUAL' : 'SCHEDULED'}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Hole alle aktiven Wettbewerber mit scraping_params
    let query = supabase
      .from('price_scraping_config')
      .select(`
        id,
        scraping_frequency,
        next_scrape_at,
        last_scraped_at,
        error_count,
        scraping_params,
        is_active,
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
      .eq('is_active', true);

    // Nur bei SCHEDULED Scraping das Datum-Filter anwenden
    if (!manual) {
      query = query.lte('next_scrape_at', new Date().toISOString());
    }

    const { data: configs, error: configError } = await query;

    if (configError) {
      console.error('[scrape-competitor-prices] Config load error:', configError);
      throw configError;
    }

    console.log(`[scrape-competitor-prices] ${manual ? 'Manual' : 'Scheduled'} scraping: Found ${configs?.length || 0} properties to scrape`);

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: manual 
            ? 'Keine aktiven Wettbewerber gefunden' 
            : 'Keine Wettbewerber zum geplanten Scrapen',
          results: [],
          manual
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
        // Scraping-Params aus Config holen
        const scrapingParams = config.scraping_params as { check_in?: string; check_out?: string } | null;
        const checkIn = scrapingParams?.check_in;
        const checkOut = scrapingParams?.check_out;

        if (!checkIn || !checkOut) {
          console.warn(`[scrape-competitor-prices] No scraping params for ${property.property_name}, skipping`);
          results.push({ 
            property: property.property_name, 
            success: false, 
            error: 'Keine Zeitraum-Parameter festgelegt' 
          });
          continue;
        }

        console.log(`[scrape-competitor-prices] Scraping period: ${checkIn} to ${checkOut}`);

        // Perplexity für Gesamtpreis-Extraktion
        const priceQuery = `
Suche nach Preisen für diese Unterkunft auf ${property.platform}:
${property.property_url || property.property_name}

Zeitraum: Irgendwann zwischen 1. November 2025 und 31. Januar 2026
Aufenthaltsdauer: 7 Nächte
Gäste: ${property.max_guests || 2}

WICHTIG: 
- Finde EINEN verfügbaren 7-Nächte-Aufenthalt in diesem Zeitraum
- Gib NUR den Gesamtpreis zurück, keine Einzelnächte

Gib die Daten in diesem JSON-Format zurück:
[
  {
    "check_in": "2025-11-15",
    "check_out": "2025-11-22",
    "nights": 7,
    "total_price": 1890,
    "available": true
  }
]

Falls kein Preis verfügbar: { "available": false, "total_price": null }
        `;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
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
          const errorBody = await response.text();
          console.error(`[scrape-competitor-prices] Perplexity API error ${response.status}:`, errorBody);
          throw new Error(`Perplexity API error: ${response.status} - ${errorBody}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Parse JSON (ultra-robust)
        let prices = [];
        try {
          // 1. Versuche direkt zu parsen
          prices = JSON.parse(content);
        } catch (e) {
          console.log('[scrape-competitor-prices] Direct JSON parse failed, trying extraction...');
          console.log('[scrape-competitor-prices] Raw content:', content.substring(0, 500));
          
          // 2. Entferne Markdown Code Blocks
          let cleanedContent = content.trim();
          const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            cleanedContent = codeBlockMatch[1].trim();
            console.log('[scrape-competitor-prices] Extracted from code block');
          }
          
          // 3. Entferne führenden Text vor JSON
          const jsonStartMatch = cleanedContent.match(/(\[|\{)/);
          if (jsonStartMatch) {
            const startIndex = cleanedContent.indexOf(jsonStartMatch[0]);
            cleanedContent = cleanedContent.substring(startIndex);
            console.log('[scrape-competitor-prices] Trimmed leading text');
          }
          
          // 4. Entferne trailing Text nach JSON
          let lastBrace = -1;
          let braceCount = 0;
          for (let i = 0; i < cleanedContent.length; i++) {
            if (cleanedContent[i] === '{' || cleanedContent[i] === '[') braceCount++;
            if (cleanedContent[i] === '}' || cleanedContent[i] === ']') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
          if (lastBrace !== -1) {
            cleanedContent = cleanedContent.substring(0, lastBrace + 1);
            console.log('[scrape-competitor-prices] Trimmed trailing text');
          }
          
          // 5. Parse gereinigtes JSON
          try {
            prices = JSON.parse(cleanedContent);
            console.log('[scrape-competitor-prices] Successfully parsed cleaned JSON');
          } catch (parseError) {
            console.error('[scrape-competitor-prices] Failed to parse cleaned content:', cleanedContent.substring(0, 200));
            throw new Error(`JSON parse failed: ${parseError.message}`);
          }
        }

        if (!Array.isArray(prices)) {
          prices = [prices];
        }

        console.log(`[scrape-competitor-prices] Extracted ${prices.length} price entries`);

        // Speichere nur den Gesamtpreis (keine Tagesberechnung)
        const priceRecords = [];
        
        for (const p of prices) {
          if (p.check_in && p.check_out && p.total_price && p.nights) {
            const totalPrice = parseFloat(p.total_price);
            const nights = parseInt(p.nights);
            
            console.log(`[scrape-competitor-prices] Saving total price: ${totalPrice} EUR for ${nights} nights (${p.check_in} to ${p.check_out})`);
            
            // NUR EIN EINTRAG mit Gesamtpreis
            priceRecords.push({
              competitor_property_id: property.id,
              date: p.check_in, // Check-in als Referenzdatum
              price: totalPrice, // GESAMTPREIS (nicht Tagespreis!)
              currency: 'EUR',
              is_available: p.available !== false,
              source: 'scraped',
              scraped_at: new Date().toISOString(),
              is_expanded: false, // NEU!
              
              // Period-Felder für spätere Tagesberechnung
              period_total_price: totalPrice,
              period_check_in: p.check_in,
              period_check_out: p.check_out,
              period_nights: nights,
            });
          } else {
            console.warn(`[scrape-competitor-prices] Invalid price entry:`, p);
          }
        }
        
        console.log(`[scrape-competitor-prices] Prepared ${priceRecords.length} total price records`);

        const { error: insertError } = await supabase
          .from('weekly_pricing')
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
        console.error('[scrape-competitor-prices] Error stack:', error.stack);
        console.error('[scrape-competitor-prices] Property data:', JSON.stringify(property, null, 2));
        
        // Log Fehler in Config mit Details
        await supabase
          .from('price_scraping_config')
          .update({
            error_count: (config.error_count || 0) + 1,
            last_error: error.message,
            last_error_details: error.stack || error.toString()
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
      JSON.stringify({ 
        success: true, 
        results,
        manual,
        total: configs.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }),
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