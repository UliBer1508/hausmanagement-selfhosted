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
    console.log('[scrape-monthly-prices] Starting monthly price scraping...');
    
    // Parse request body für manual flag und Jahr
    const body = await req.json().catch(() => ({}));
    const manual = body.manual ?? false;
    const targetYear = body.year ?? new Date().getFullYear();
    
    console.log(`[scrape-monthly-prices] Mode: ${manual ? 'MANUAL' : 'SCHEDULED'}, Year: ${targetYear}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Hole alle aktiven Wettbewerber
    const { data: competitors, error: competitorError } = await supabase
      .from('competitor_properties')
      .select('*')
      .eq('is_active', true);

    if (competitorError) {
      console.error('[scrape-monthly-prices] Competitor load error:', competitorError);
      throw competitorError;
    }

    console.log(`[scrape-monthly-prices] Found ${competitors?.length || 0} active competitors`);

    if (!competitors || competitors.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Keine aktiven Wettbewerber gefunden',
          results: [],
          manual
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generiere Monate für das Jahr (15. jeden Monats)
    const monthsToScrape = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const checkInDate = new Date(targetYear, i, 15); // 15. des Monats
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setDate(checkInDate.getDate() + 7); // 7 Nächte später

      return {
        month,
        year: targetYear,
        check_in: checkInDate.toISOString().split('T')[0],
        check_out: checkOutDate.toISOString().split('T')[0],
      };
    });

    console.log(`[scrape-monthly-prices] Scraping 12 months for year ${targetYear}`);

    const results = [];
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');
    }

    // Für jeden Wettbewerber: Scrape alle 12 Monate
    for (const property of competitors) {
      console.log(`[scrape-monthly-prices] Processing: ${property.property_name}`);
      
      const propertyResults = {
        property: property.property_name,
        months_scraped: 0,
        months_failed: 0,
        errors: [] as string[],
      };

      try {
        for (const period of monthsToScrape) {
          console.log(`[scrape-monthly-prices] Scraping ${property.property_name} for ${period.check_in} to ${period.check_out}`);

          // Perplexity für monatlichen Preis-Extraktion
          const priceQuery = `
Suche nach dem Preis für diese Unterkunft auf ${property.platform || 'der Plattform'}:
${property.property_url || property.property_name}

Check-in: ${period.check_in}
Check-out: ${period.check_out}
Aufenthaltsdauer: 7 Nächte
Gäste: ${property.max_guests || 2}

WICHTIG: 
- Gib den GESAMTPREIS für diesen EXAKTEN Zeitraum zurück
- Falls nicht verfügbar, gib available: false zurück

Antworte NUR mit diesem JSON-Format:
{
  "total_price": 1890,
  "available": true
}

Falls nicht verfügbar: { "available": false }
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
                  content: 'Du extrahierst Preisdaten von Ferienhaus-Plattformen. Antworte NUR mit validem JSON.' 
                },
                { role: 'user', content: priceQuery }
              ],
              temperature: 0.1,
              max_tokens: 500,
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[scrape-monthly-prices] Perplexity API error ${response.status}:`, errorBody);
            propertyResults.months_failed++;
            propertyResults.errors.push(`${period.month}: API error ${response.status}`);
            continue;
          }

          const data = await response.json();
          const content = data.choices[0].message.content;
          
          // Parse JSON
          let priceData;
          try {
            priceData = JSON.parse(content);
          } catch (e) {
            // Robuste Extraktion
            let cleanedContent = content.trim();
            const codeBlockMatch = cleanedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
              cleanedContent = codeBlockMatch[1].trim();
            }
            
            const jsonStartMatch = cleanedContent.match(/\{/);
            if (jsonStartMatch) {
              const startIndex = cleanedContent.indexOf(jsonStartMatch[0]);
              cleanedContent = cleanedContent.substring(startIndex);
            }
            
            try {
              priceData = JSON.parse(cleanedContent);
            } catch (parseError) {
              console.error(`[scrape-monthly-prices] JSON parse failed for ${period.month}:`, cleanedContent.substring(0, 200));
              propertyResults.months_failed++;
              propertyResults.errors.push(`${period.month}: Parse error`);
              continue;
            }
          }

          // Prüfe ob verfügbar und Preis vorhanden
          if (!priceData.available || !priceData.total_price) {
            console.log(`[scrape-monthly-prices] No price available for ${property.property_name} in ${period.month}/${period.year}`);
            propertyResults.months_failed++;
            continue;
          }

          const totalPrice = parseFloat(priceData.total_price);
          
          // Speichere in monthly_pricing
          const { error: insertError } = await supabase
            .from('monthly_pricing')
            .upsert({
              competitor_property_id: property.id,
              month: period.month,
              year: period.year,
              base_price_7nights: totalPrice,
              source: 'scraped',
            }, {
              onConflict: 'competitor_property_id,month,year',
            });

          if (insertError) {
            console.error(`[scrape-monthly-prices] Insert error for ${period.month}:`, insertError);
            propertyResults.months_failed++;
            propertyResults.errors.push(`${period.month}: Insert error`);
            continue;
          }

          propertyResults.months_scraped++;
          console.log(`[scrape-monthly-prices] ✓ ${property.property_name} ${period.month}/${period.year}: €${totalPrice}`);

          // Rate limiting zwischen Monaten
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        results.push({
          property: property.property_name,
          success: propertyResults.months_failed === 0,
          months_scraped: propertyResults.months_scraped,
          months_failed: propertyResults.months_failed,
          errors: propertyResults.errors,
        });

        console.log(`[scrape-monthly-prices] ✓ ${property.property_name}: ${propertyResults.months_scraped}/12 Monate erfolgreich`);

      } catch (error) {
        console.error(`[scrape-monthly-prices] Error scraping ${property.property_name}:`, error);
        
        results.push({ 
          property: property.property_name, 
          success: false, 
          error: error.message,
          months_scraped: 0,
          months_failed: 12,
        });
      }

      // Rate limiting zwischen Properties
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('[scrape-monthly-prices] Scraping complete');

    const totalMonthsScraped = results.reduce((sum, r) => sum + (r.months_scraped || 0), 0);
    const totalMonthsFailed = results.reduce((sum, r) => sum + (r.months_failed || 0), 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        manual,
        year: targetYear,
        total_properties: competitors.length,
        total_months_scraped: totalMonthsScraped,
        total_months_failed: totalMonthsFailed,
        successful_properties: results.filter(r => r.success).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[scrape-monthly-prices] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});