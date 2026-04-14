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

    // Für jeden Wettbewerber: Scrape aktuellen Monat mit Retry-Mechanismus
    for (const property of competitors) {
      console.log(`[scrape-monthly-prices] ========================================`);
      console.log(`[scrape-monthly-prices] Processing: ${property.property_name}`);
      
      const propertyResults = {
        property: property.property_name,
        scraped: false,
        price: null as number | null,
        check_in: null as string | null,
        check_out: null as string | null,
        errors: [] as string[],
      };

      const MAX_RETRIES = 3;
      let retryCount = 0;
      let priceFound = false;

      while (!priceFound && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[scrape-monthly-prices] 🔄 Attempt ${retryCount}/${MAX_RETRIES} for ${property.property_name}`);

        try {
          const period = monthToScrape;

          // Prüfe ob URL bereits Suchparameter enthält
          const hasSearchParams = property.property_url.includes('checkin=') && property.property_url.includes('checkout=');
          
          // Verbesserter Perplexity-Prompt (unterscheidet zwischen Landing-Page und Such-URL)
          const priceQuery = hasSearchParams ? `
AUFGABE: Lies den Preis für diese Booking.com-Suche aus:

URL: ${property.property_url}

WICHTIG:
- Die URL enthält bereits Check-in/Check-out-Daten und Gästeanzahl
- Besuche die URL und lies den angezeigten Gesamtpreis aus
- Der Preis sollte direkt sichtbar sein
- Falls die Daten außerhalb des Zeitraums ${period.month_start} bis ${period.month_end} liegen, suche nach einem 7-Nächte-Zeitraum in diesem Monat

ANTWORT-FORMAT (NUR JSON):
Falls Preis gefunden:
{
  "total_price": 1890,
  "check_in": "2025-10-18",
  "check_out": "2025-10-25",
  "available": true,
  "currency": "EUR"
}

Falls nicht verfügbar:
{
  "available": false,
  "reason": "Genauer Grund"
}
          ` : `
AUFGABE: Finde einen 7-Nächte-Preis für diese Booking.com-Unterkunft:

URL: ${property.property_url}

ZEITRAUM: Beliebiger Check-in zwischen ${period.month_start} und ${period.month_end}
GÄSTE: ${property.max_guests || 2} Erwachsene
AUFENTHALT: 7 Nächte

WICHTIG:
- Die URL ist eine Landing-Page OHNE Suchparameter
- Du musst auf der Seite nach verfügbaren Zeiträumen suchen
- Suche nach IRGENDEINEM verfügbaren 7-Nächte-Zeitraum im angegebenen Monat
- Falls nichts verfügbar: Gib spezifischen Grund zurück

ANTWORT-FORMAT (NUR JSON):
Falls verfügbar:
{
  "total_price": 1890,
  "check_in": "2025-10-18",
  "check_out": "2025-10-25",
  "available": true,
  "currency": "EUR"
}

Falls NICHT verfügbar:
{
  "available": false,
  "reason": "Genauer Grund (z.B. 'Monat ausgebucht', 'URL nicht erreichbar', 'Booking.com blockiert')"
}
          `;

          console.log(`[scrape-monthly-prices] URL type: ${hasSearchParams ? 'SEARCH URL (with params)' : 'LANDING PAGE (without params)'}`);

          console.log(`[scrape-monthly-prices] Sending query to Perplexity (attempt ${retryCount})...`);
          
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
                  content: 'Du bist ein Preis-Extraktions-Assistent für Booking.com. Besuche die URL, finde verfügbare Preise und antworte AUSSCHLIESSLICH mit validem JSON. Keine zusätzlichen Erklärungen.' 
                },
                { role: 'user', content: priceQuery }
              ],
              temperature: 0.0,
              max_tokens: 1000,
              return_images: false,
              return_related_questions: false,
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[scrape-monthly-prices] ❌ Perplexity API error ${response.status}:`, errorBody);
            
            if (response.status === 429) {
              console.log(`[scrape-monthly-prices] ⏳ Rate limit hit, waiting before retry...`);
              propertyResults.errors.push(`Rate limit (${response.status})`);
              throw new Error(`Rate limit exceeded`);
            }
            
            propertyResults.errors.push(`API error ${response.status}`);
            throw new Error(`Perplexity API error ${response.status}`);
          }

          const data = await response.json();
          const content = data.choices[0].message.content;
          
          // VOLLSTÄNDIGE Antwort loggen (nicht nur 500 Zeichen)
          console.log(`[scrape-monthly-prices] ========================================`);
          console.log(`[scrape-monthly-prices] 📥 PERPLEXITY RAW RESPONSE for ${property.property_name}:`);
          console.log(content);
          console.log(`[scrape-monthly-prices] ========================================`);
          
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
              console.error(`[scrape-monthly-prices] ❌ JSON parse failed:`, cleanedContent.substring(0, 200));
              propertyResults.errors.push(`JSON parse error (attempt ${retryCount})`);
              throw new Error('JSON parse failed');
            }
          }

          // Prüfe ob verfügbar und Preis vorhanden
          if (!priceData.available) {
            const reason = priceData.reason || 'Keine Verfügbarkeit';
            console.log(`[scrape-monthly-prices] ⚠️ Not available (attempt ${retryCount}): ${reason}`);
            propertyResults.errors.push(`Not available: ${reason}`);
            
            // Unterscheidung: Access-Problem vs. temporäre Unavailability
            if (reason.toLowerCase().includes('blockiert') || 
                reason.toLowerCase().includes('nicht erreichbar') ||
                reason.toLowerCase().includes('blocked') ||
                reason.toLowerCase().includes('unreachable')) {
              console.log(`[scrape-monthly-prices] 🚫 Access issue detected - stopping retries for ${property.property_name}`);
              priceFound = false; // Stoppe Retries
              break; // Verlasse while-loop
            } else {
              console.log(`[scrape-monthly-prices] 🔄 Temporary issue - will retry if attempts left`);
              throw new Error(`Temporary unavailability: ${reason}`);
            }
          }
          
          if (!priceData.total_price) {
            console.log(`[scrape-monthly-prices] ⚠️ Price field missing in response (attempt ${retryCount})`);
            propertyResults.errors.push(`Price field missing (attempt ${retryCount})`);
            throw new Error('Price field missing in response');
          }

          // period already declared at line 100
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
            console.error(`[scrape-monthly-prices] ❌ Insert error:`, insertError);
            propertyResults.errors.push('DB insert error');
            throw new Error('Database insert failed');
          }

          console.log(`[scrape-monthly-prices] ✅ ${property.property_name}: €${totalPrice} (${checkInDate})`);
          priceFound = true; // Erfolg - stoppe Retries

          results.push({
            property: property.property_name,
            month: period.month,
            year: period.year,
            success: true,
            price: totalPrice,
            check_in: checkInDate,
            check_out: checkOutDate,
            attempts: retryCount,
            errors: propertyResults.errors,
          });

        } catch (error) {
          console.error(`[scrape-monthly-prices] ❌ Error on attempt ${retryCount} for ${property.property_name}:`, error.message);
          
          // Wenn noch Retries übrig sind, warte und versuche erneut
          if (retryCount < MAX_RETRIES) {
            console.log(`[scrape-monthly-prices] ⏳ Waiting 3 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      // Falls nach allen Retries kein Erfolg
      if (!priceFound) {
        console.log(`[scrape-monthly-prices] ❌ Failed to find price for ${property.property_name} after ${MAX_RETRIES} attempts`);
        results.push({ 
          property: property.property_name, 
          month: monthToScrape.month,
          year: monthToScrape.year,
          success: false, 
          attempts: retryCount,
          error: `Failed after ${retryCount} attempts`,
          errors: propertyResults.errors,
        });
      }

      // Längeres Rate limiting zwischen Properties (5 Sekunden)
      console.log(`[scrape-monthly-prices] ⏳ Waiting 5 seconds before next property...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log(`[scrape-monthly-prices] ========================================`);
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