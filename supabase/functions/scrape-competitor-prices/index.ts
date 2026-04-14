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
    console.log('[scrape-prices] Starting price scraping...');
    
    const body = await req.json().catch(() => ({}));
    const manual = body.manual ?? false;
    
    // Configurable search parameters with defaults
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    const checkInFrom = body.check_in_from || now.toISOString().split('T')[0];
    const checkInTo = body.check_in_to || lastDayOfMonth.toISOString().split('T')[0];
    const minNights = body.min_nights ?? 7;
    const guestsAdults = body.guests_adults ?? 2;
    const guestsChildren = body.guests_children ?? 0;
    const platforms: string[] = body.platforms ?? ['alle'];
    
    console.log(`[scrape-prices] Params: ${checkInFrom} - ${checkInTo}, ${minNights} nights, ${guestsAdults} adults + ${guestsChildren} children, platforms: ${platforms.join(', ')}`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: competitors, error: competitorError } = await supabase
      .from('competitor_properties')
      .select('*')
      .eq('is_active', true);

    if (competitorError) throw competitorError;

    console.log(`[scrape-prices] Found ${competitors?.length || 0} active competitors`);

    if (!competitors || competitors.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Keine aktiven Wettbewerber', results: [], manual }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');

    const platformText = platforms.includes('alle') 
      ? 'allen verfügbaren Buchungsportalen (Booking.com, Airbnb, VRBO, Belvilla, FeWo-direkt, Holidu, Traum-Ferienwohnungen)'
      : platforms.join(', ');

    const guestText = guestsChildren > 0
      ? `${guestsAdults} Erwachsene und ${guestsChildren} Kinder`
      : `${guestsAdults} Erwachsene`;

    const results = [];

    for (const property of competitors) {
      console.log(`[scrape-prices] ========================================`);
      console.log(`[scrape-prices] Processing: ${property.property_name}`);
      
      const propertyResults = {
        property: property.property_name,
        scraped: false,
        price: null as number | null,
        check_in: null as string | null,
        check_out: null as string | null,
        platform_source: null as string | null,
        nights: null as number | null,
        errors: [] as string[],
      };

      const MAX_RETRIES = 3;
      let retryCount = 0;
      let priceFound = false;

      while (!priceFound && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[scrape-prices] 🔄 Attempt ${retryCount}/${MAX_RETRIES}`);

        try {
          const hasSearchParams = property.property_url?.includes('checkin=') && property.property_url?.includes('checkout=');
          
          const priceQuery = hasSearchParams ? `
AUFGABE: Lies den Preis für diese Ferienunterkunft aus:

URL: ${property.property_url}
NAME: ${property.property_name}

SUCHPARAMETER:
- Die URL enthält bereits Check-in/Check-out-Daten
- Falls die Daten außerhalb von ${checkInFrom} bis ${checkInTo} liegen, suche nach einem ${minNights}-Nächte-Zeitraum in diesem Zeitraum
- Gäste: ${guestText}
- Suche auf: ${platformText}

ANTWORT-FORMAT (NUR JSON, keine Erklärungen):
Falls Preis gefunden:
{
  "total_price": 1890,
  "check_in": "2026-06-15",
  "check_out": "2026-06-22",
  "nights": 7,
  "platform": "booking.com",
  "available": true,
  "currency": "EUR"
}

Falls nicht verfügbar:
{
  "available": false,
  "reason": "Genauer Grund"
}
          ` : `
AUFGABE: Finde einen Preis für diese Ferienunterkunft:

NAME: ${property.property_name}
URL: ${property.property_url || 'Keine URL vorhanden'}

SUCHPARAMETER:
- Check-in: Beliebiger Tag zwischen ${checkInFrom} und ${checkInTo}
- Aufenthalt: Mindestens ${minNights} Nächte
- Gäste: ${guestText}
- Suche auf: ${platformText}

WICHTIG:
- Falls die URL zu einem bestimmten Portal gehört, suche dort zuerst
- Suche zusätzlich auf den anderen angegebenen Portalen nach dem besten Preis
- Gib den günstigsten gefundenen Preis zurück
- Gib an, auf welchem Portal der Preis gefunden wurde

ANTWORT-FORMAT (NUR JSON, keine Erklärungen):
Falls verfügbar:
{
  "total_price": 1890,
  "check_in": "2026-06-15",
  "check_out": "2026-06-22",
  "nights": 7,
  "platform": "booking.com",
  "available": true,
  "currency": "EUR"
}

Falls NICHT verfügbar:
{
  "available": false,
  "reason": "Genauer Grund (z.B. 'ausgebucht', 'URL nicht erreichbar')"
}
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
                  content: 'Du bist ein Preis-Extraktions-Assistent für Ferienwohnungen. Besuche URLs, finde verfügbare Preise auf den angegebenen Portalen und antworte AUSSCHLIESSLICH mit validem JSON. Keine zusätzlichen Erklärungen.' 
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
            console.error(`[scrape-prices] ❌ API error ${response.status}:`, errorBody);
            if (response.status === 429) {
              propertyResults.errors.push(`Rate limit (${response.status})`);
              throw new Error('Rate limit exceeded');
            }
            propertyResults.errors.push(`API error ${response.status}`);
            throw new Error(`Perplexity API error ${response.status}`);
          }

          const data = await response.json();
          const content = data.choices[0].message.content;
          
          console.log(`[scrape-prices] 📥 RAW RESPONSE for ${property.property_name}:`);
          console.log(content);
          
          // Parse JSON robustly
          let priceData;
          try {
            priceData = JSON.parse(content);
          } catch {
            let cleaned = content.trim();
            const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlock) cleaned = codeBlock[1].trim();
            const jsonStart = cleaned.indexOf('{');
            if (jsonStart >= 0) cleaned = cleaned.substring(jsonStart);
            const jsonEnd = cleaned.lastIndexOf('}');
            if (jsonEnd >= 0) cleaned = cleaned.substring(0, jsonEnd + 1);
            try {
              priceData = JSON.parse(cleaned);
            } catch {
              console.error(`[scrape-prices] ❌ JSON parse failed`);
              propertyResults.errors.push(`JSON parse error (attempt ${retryCount})`);
              throw new Error('JSON parse failed');
            }
          }

          if (!priceData.available) {
            const reason = priceData.reason || 'Keine Verfügbarkeit';
            console.log(`[scrape-prices] ⚠️ Not available: ${reason}`);
            propertyResults.errors.push(`Not available: ${reason}`);
            
            if (reason.toLowerCase().includes('blockiert') || reason.toLowerCase().includes('blocked') || reason.toLowerCase().includes('nicht erreichbar')) {
              break;
            }
            throw new Error(`Temporary: ${reason}`);
          }
          
          if (!priceData.total_price) {
            propertyResults.errors.push(`Price field missing (attempt ${retryCount})`);
            throw new Error('Price field missing');
          }

          const totalPrice = parseFloat(priceData.total_price);
          const nights = priceData.nights || minNights;
          const checkInDate = priceData.check_in || checkInFrom;
          const checkOutDate = priceData.check_out || (() => {
            const d = new Date(checkInDate);
            d.setDate(d.getDate() + nights);
            return d.toISOString().split('T')[0];
          })();
          const platformSource = priceData.platform || null;

          propertyResults.scraped = true;
          propertyResults.price = totalPrice;
          propertyResults.check_in = checkInDate;
          propertyResults.check_out = checkOutDate;
          propertyResults.platform_source = platformSource;
          propertyResults.nights = nights;
          
          // Save to monthly_pricing
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
              nights: nights,
              guests_adults: guestsAdults,
              guests_children: guestsChildren > 0 ? guestsChildren : null,
              platform_source: platformSource,
            }, {
              onConflict: 'competitor_property_id,check_in_date',
            });

          if (insertError) {
            console.error(`[scrape-prices] ❌ Insert error:`, insertError);
            propertyResults.errors.push('DB insert error');
            throw new Error('Database insert failed');
          }

          console.log(`[scrape-prices] ✅ ${property.property_name}: €${totalPrice} via ${platformSource} (${checkInDate}, ${nights}N)`);
          priceFound = true;

          results.push({
            property: property.property_name,
            success: true,
            price: totalPrice,
            check_in: checkInDate,
            check_out: checkOutDate,
            nights,
            platform_source: platformSource,
            attempts: retryCount,
            errors: propertyResults.errors,
          });

        } catch (error) {
          console.error(`[scrape-prices] ❌ Attempt ${retryCount} error:`, error.message);
          if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      if (!priceFound) {
        results.push({ 
          property: property.property_name, 
          success: false, 
          attempts: retryCount,
          error: `Failed after ${retryCount} attempts`,
          errors: propertyResults.errors,
        });
      }

      // Rate limiting between properties
      console.log(`[scrape-prices] ⏳ Waiting 5s before next property...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('[scrape-prices] Scraping complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        manual,
        search_params: { check_in_from: checkInFrom, check_in_to: checkInTo, min_nights: minNights, guests_adults: guestsAdults, guests_children: guestsChildren, platforms },
        total_properties: competitors.length,
        successful_properties: results.filter(r => r.success).length,
        failed_properties: results.filter(r => !r.success).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[scrape-prices] Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
