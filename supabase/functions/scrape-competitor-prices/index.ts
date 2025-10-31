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

    // Nur aktueller Monat (flexibler Check-in)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    const monthToScrape = {
      month: currentMonth + 1, // 1-12 für Anzeige
      year: currentYear,
      month_start: firstDay.toISOString().split('T')[0],
      month_end: lastDay.toISOString().split('T')[0],
    };

    console.log(`[scrape-monthly-prices] Scraping current month: ${monthToScrape.month_start} to ${monthToScrape.month_end}`);

    const results = [];
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');
    }

    // Für jeden Wettbewerber: Scrape aktuellen Monat
    for (const property of competitors) {
      console.log(`[scrape-monthly-prices] Processing: ${property.property_name}`);
      
      const propertyResults = {
        property: property.property_name,
        scraped: false,
        price: null as number | null,
        check_in: null as string | null,
        check_out: null as string | null,
        errors: [] as string[],
      };

      try {
        const period = monthToScrape;
        console.log(`[scrape-monthly-prices] Scraping ${property.property_name} for ${period.month}/${period.year}`);

        // Perplexity mit flexiblem Check-in
        const priceQuery = `
Suche nach dem Preis für diese Unterkunft auf ${property.platform || 'der Plattform'}:
${property.property_url || property.property_name}

ZEITRAUM: ${period.month_start} bis ${period.month_end} (${period.month}/${period.year})
Aufenthaltsdauer: 7 Nächte (beliebiger Check-in im Monat)
Gäste: ${property.max_guests || 2}

WICHTIG: 
- Suche nach einem verfügbaren 7-Nächte-Zeitraum IRGENDWANN im Monat
- Check-in-Datum ist flexibel (kann jeder Tag im Monat sein)
- Gib den GESAMTPREIS für 7 Nächte zurück
- Falls nicht verfügbar, gib available: false zurück

Antworte NUR mit diesem JSON-Format:
{
  "total_price": 1890,
  "check_in": "2025-10-18",
  "check_out": "2025-10-25",
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
          propertyResults.errors.push(`API error ${response.status}`);
          throw new Error(`Perplexity API error ${response.status}`);
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
            console.error(`[scrape-monthly-prices] JSON parse failed:`, cleanedContent.substring(0, 200));
            propertyResults.errors.push('JSON parse error');
            throw new Error('JSON parse failed');
          }
        }

        // Prüfe ob verfügbar und Preis vorhanden
        if (!priceData.available || !priceData.total_price) {
          console.log(`[scrape-monthly-prices] No price available for ${property.property_name} in ${period.month}/${period.year}`);
          propertyResults.errors.push('Not available');
          throw new Error('Price not available');
        }

        const totalPrice = parseFloat(priceData.total_price);
        const checkInDate = priceData.check_in || `${period.year}-${String(period.month).padStart(2, '0')}-15`;
        const checkOutDate = priceData.check_out || (() => {
          const d = new Date(checkInDate);
          d.setDate(d.getDate() + 7);
          return d.toISOString().split('T')[0];
        })();

        propertyResults.scraped = true;
        propertyResults.price = totalPrice;
        propertyResults.check_in = checkInDate;
        propertyResults.check_out = checkOutDate;
        
        // Speichere in monthly_pricing
        const { error: insertError } = await supabase
          .from('monthly_pricing')
          .upsert({
            competitor_property_id: property.id,
            check_in_date: checkInDate,
            check_out_date: checkOutDate,
            base_price_7nights: totalPrice,
            currency: 'EUR',
            source: 'scraped',
            scraped_at: new Date().toISOString(),
          }, {
            onConflict: 'competitor_property_id,check_in_date',
          });

        if (insertError) {
          console.error(`[scrape-monthly-prices] Insert error:`, insertError);
          propertyResults.errors.push('DB insert error');
          throw new Error('Database insert failed');
        }

        console.log(`[scrape-monthly-prices] ✓ ${property.property_name}: €${totalPrice} (${checkInDate})`);

        results.push({
          property: property.property_name,
          month: period.month,
          year: period.year,
          success: true,
          price: totalPrice,
          check_in: checkInDate,
          check_out: checkOutDate,
          errors: propertyResults.errors,
        });

        console.log(`[scrape-monthly-prices] ✓ ${property.property_name}: Success`);

      } catch (error) {
        console.error(`[scrape-monthly-prices] Error scraping ${property.property_name}:`, error);
        
        results.push({ 
          property: property.property_name, 
          month: monthToScrape.month,
          year: monthToScrape.year,
          success: false, 
          error: error.message,
          errors: propertyResults.errors,
        });
      }

      // Rate limiting zwischen Properties
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('[scrape-monthly-prices] Scraping complete');

    const successfulProperties = results.filter(r => r.success).length;
    const failedProperties = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        manual,
        month: monthToScrape.month,
        year: monthToScrape.year,
        check_in_start: monthToScrape.month_start,
        check_in_end: monthToScrape.month_end,
        total_properties: competitors.length,
        successful_properties: successfulProperties,
        failed_properties: failedProperties,
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