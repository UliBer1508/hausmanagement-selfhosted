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
    console.log('[scrape-prices] Starting price analysis...');
    
    const body = await req.json().catch(() => ({}));
    const manual = body.manual ?? false;
    const analysisType = body.analysis_type || 'tourist';
    const houseId = body.house_id;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');

    // ===================== RENTAL MODE =====================
    if (analysisType === 'rental') {
      console.log('[scrape-prices] Running rental price analysis...');
      
      const address = body.address || '';
      const sqm = body.sqm || 60;
      const rooms = body.rooms || 2;
      const currentRent = body.current_rent || null;
      const platforms: string[] = body.platforms ?? ['alle'];

      const platformText = platforms.includes('alle')
        ? 'ImmoScout24, Immowelt, eBay Kleinanzeigen, WG-gesucht'
        : platforms.join(', ');

      const currentRentText = currentRent ? `Die aktuelle Miete beträgt ${currentRent} EUR/Monat.` : '';

      const rentalPrompt = `
AUFGABE: Finde aktuelle Mietpreise für eine vergleichbare Wohnung.

OBJEKTDATEN:
- Adresse/Region: ${address}
- Wohnfläche: ${sqm} qm
- Zimmer: ${rooms}
${currentRentText}

SUCHPARAMETER:
- Suche auf: ${platformText}
- Suche Kaltmieten für Wohnungen mit ähnlicher Größe (±15 qm) und Zimmeranzahl in der gleichen Region
- Berücksichtige Wohnungen im Umkreis von 10 km

ANTWORT-FORMAT (NUR JSON, keine Erklärungen):
{
  "avg_rent": 850,
  "min_rent": 700,
  "max_rent": 1100,
  "price_per_sqm": 12.50,
  "comparable_count": 8,
  "currency": "EUR",
  "sources": ["ImmoScout24", "Immowelt"],
  "comparables": [
    {"address": "Beispielstr. 1", "sqm": 65, "rooms": 2, "rent": 800, "source": "ImmoScout24"},
    {"address": "Musterweg 5", "sqm": 58, "rooms": 2, "rent": 750, "source": "Immowelt"}
  ]
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
            { role: 'system', content: 'Du bist ein Mietpreis-Analyse-Assistent. Recherchiere aktuelle Mietpreise auf Immobilienportalen und antworte AUSSCHLIESSLICH mit validem JSON. Keine zusätzlichen Erklärungen.' },
            { role: 'user', content: rentalPrompt }
          ],
          temperature: 0.0,
          max_tokens: 2000,
          return_images: false,
          return_related_questions: false,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[scrape-prices] ❌ API error ${response.status}:`, errorBody);
        throw new Error(`Perplexity API error ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      console.log('[scrape-prices] 📥 Rental analysis response:', content);

      // Parse JSON
      let rentalData;
      try {
        rentalData = JSON.parse(content);
      } catch {
        let cleaned = content.trim();
        const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlock) cleaned = codeBlock[1].trim();
        const jsonStart = cleaned.indexOf('{');
        if (jsonStart >= 0) cleaned = cleaned.substring(jsonStart);
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonEnd >= 0) cleaned = cleaned.substring(0, jsonEnd + 1);
        try {
          rentalData = JSON.parse(cleaned);
        } catch {
          throw new Error('JSON parse failed for rental analysis');
        }
      }

      // Save to rental_price_analysis
      if (houseId) {
        const { error: insertError } = await supabase
          .from('rental_price_analysis')
          .insert({
            house_id: houseId,
            avg_rent: rentalData.avg_rent || null,
            min_rent: rentalData.min_rent || null,
            max_rent: rentalData.max_rent || null,
            price_per_sqm: rentalData.price_per_sqm || null,
            comparable_count: rentalData.comparable_count || 0,
            sources: rentalData.sources || [],
            search_params: { address, sqm, rooms, platforms, current_rent: currentRent },
          });

        if (insertError) {
          console.error('[scrape-prices] ❌ Insert error:', insertError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          manual,
          analysis_type: 'rental',
          results: [{
            success: true,
            property: body.house_name || address,
            avg_rent: rentalData.avg_rent,
            min_rent: rentalData.min_rent,
            max_rent: rentalData.max_rent,
            price_per_sqm: rentalData.price_per_sqm,
            comparable_count: rentalData.comparable_count,
            sources: rentalData.sources,
          }],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===================== TOURIST MODE =====================
    console.log('[scrape-prices] Running tourist price scraping...');
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    const checkInFrom = body.check_in_from || now.toISOString().split('T')[0];
    const checkInTo = body.check_in_to || lastDayOfMonth.toISOString().split('T')[0];
    const minNights = body.min_nights ?? 7;
    const maxGuests = body.max_guests ?? 6;
    const platforms: string[] = body.platforms ?? ['alle'];
    
    console.log(`[scrape-prices] Params: ${checkInFrom} - ${checkInTo}, ${minNights} nights, ${maxGuests} guests, platforms: ${platforms.join(', ')}`);

    let competitorQuery = supabase
      .from('competitor_properties')
      .select('*')
      .eq('is_active', true);
    
    if (houseId) {
      competitorQuery = competitorQuery.eq('house_id', houseId);
    }

    const { data: competitors, error: competitorError } = await competitorQuery;

    if (competitorError) throw competitorError;

    console.log(`[scrape-prices] Found ${competitors?.length || 0} active competitors`);

    if (!competitors || competitors.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Keine aktiven Wettbewerber für dieses Haus', results: [], manual }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const platformText = platforms.includes('alle') 
      ? 'allen verfügbaren Buchungsportalen (Booking.com, Airbnb, VRBO, Belvilla, FeWo-direkt, Holidu, Traum-Ferienwohnungen)'
      : platforms.join(', ');

    const results = [];

    for (const property of competitors) {
      console.log(`[scrape-prices] Processing: ${property.property_name}`);

      const MAX_RETRIES = 2;
      let retryCount = 0;
      let resultFound = false;

      while (!resultFound && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[scrape-prices] 🔄 Attempt ${retryCount}/${MAX_RETRIES}`);

        try {
          const priceQuery = `
AUFGABE: Recherchiere ALLE verfügbaren Preise für diese Ferienunterkunft.

NAME: ${property.property_name}
URL: ${property.property_url || 'Keine URL vorhanden'}

SUCHPARAMETER:
- Zeitraum: ${checkInFrom} bis ${checkInTo}
- Personen: bis zu ${maxGuests}
- Mindestaufenthalt: ${minNights} Nächte
- Suche auf: ${platformText}

WICHTIG:
- Gib ALLE Preise zurück die du für diesen Zeitraum findest
- Auch Preise für kürzere oder längere Aufenthalte sind relevant
- Auch Preise für weniger Gäste
- Auch allgemeine Preislisten, Saisonpreise oder Preisbereiche
- Klassifiziere jeden gefundenen Preis nach Typ
- Falls die URL zu einem Portal gehört, suche dort zuerst
- Suche auch auf anderen Portalen nach Preisen

ANTWORT-FORMAT (NUR JSON, keine Erklärungen):
{
  "found": true,
  "prices": [
    {
      "total_price": 1890,
      "price_per_night": 270,
      "check_in": "2026-07-01",
      "check_out": "2026-07-08",
      "nights": 7,
      "guests": 6,
      "platform": "booking.com",
      "type": "exact",
      "notes": "Sommerpreis inkl. Endreinigung"
    }
  ],
  "general_info": "Preisbereich 200-350 EUR/Nacht je nach Saison"
}

type kann sein:
- "exact" = exakter buchbarer Preis für bestimmte Daten
- "seasonal" = Saisonpreis (z.B. Sommer/Winter)
- "range" = Preisspanne (min-max)
- "per_night" = nur Nachtpreis bekannt, kein Gesamtpreis

Falls KEINE Preise gefunden werden:
{
  "found": false,
  "prices": [],
  "general_info": "Grund warum keine Preise gefunden wurden"
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
                { role: 'system', content: 'Du bist ein Preis-Recherche-Assistent für Ferienwohnungen. Recherchiere alle verfügbaren Preise auf den angegebenen Portalen und antworte AUSSCHLIESSLICH mit validem JSON. Keine zusätzlichen Erklärungen.' },
                { role: 'user', content: priceQuery }
              ],
              temperature: 0.0,
              max_tokens: 2000,
              return_images: false,
              return_related_questions: false,
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[scrape-prices] ❌ API error ${response.status}:`, errorBody);
            if (response.status === 429) {
              throw new Error('Rate limit exceeded');
            }
            throw new Error(`Perplexity API error ${response.status}`);
          }

          const data = await response.json();
          const content = data.choices[0].message.content;
          
          console.log(`[scrape-prices] 📥 RAW RESPONSE for ${property.property_name}:`);
          console.log(content);
          
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
              throw new Error('JSON parse failed');
            }
          }

          const prices = Array.isArray(priceData.prices) ? priceData.prices : [];
          const found = priceData.found !== false && prices.length > 0;

          // Save best exact price to monthly_pricing
          if (found) {
            const exactPrices = prices.filter((p: any) => p.total_price && (p.type === 'exact' || !p.type));
            const bestPrice = exactPrices.length > 0
              ? exactPrices.reduce((min: any, p: any) => p.total_price < min.total_price ? p : min, exactPrices[0])
              : prices.find((p: any) => p.total_price);

            if (bestPrice) {
              const checkInDate = bestPrice.check_in || checkInFrom;
              const nights = bestPrice.nights || minNights;
              const checkOutDate = bestPrice.check_out || (() => {
                const d = new Date(checkInDate);
                d.setDate(d.getDate() + nights);
                return d.toISOString().split('T')[0];
              })();

              const { error: insertError } = await supabase
                .from('monthly_pricing')
                .upsert({
                  competitor_property_id: property.id,
                  check_in_date: checkInDate,
                  check_out_date: checkOutDate,
                  base_price_7nights: bestPrice.total_price,
                  currency: 'EUR',
                  source: 'scraped',
                  scraped_at: new Date().toISOString(),
                  nights: nights,
                  guests_adults: maxGuests,
                  platform_source: bestPrice.platform || null,
                }, {
                  onConflict: 'competitor_property_id,check_in_date',
                });

              if (insertError) {
                console.error(`[scrape-prices] ❌ Insert error:`, insertError);
              }
            }
          }

          console.log(`[scrape-prices] ✅ ${property.property_name}: ${prices.length} prices found`);
          resultFound = true;

          results.push({
            property: property.property_name,
            success: true,
            found,
            prices,
            general_info: priceData.general_info || null,
            best_price: prices.find((p: any) => p.total_price)?.total_price || null,
            attempts: retryCount,
          });

        } catch (error) {
          console.error(`[scrape-prices] ❌ Attempt ${retryCount} error:`, error.message);
          if (retryCount >= MAX_RETRIES) {
            results.push({ 
              property: property.property_name, 
              success: false, 
              found: false,
              prices: [],
              attempts: retryCount,
              error: error.message,
            });
          } else {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      if (competitors.indexOf(property) < competitors.length - 1) {
        console.log(`[scrape-prices] ⏳ Waiting 3s before next property...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('[scrape-prices] Scraping complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        manual,
        analysis_type: 'tourist',
        search_params: { check_in_from: checkInFrom, check_in_to: checkInTo, min_nights: minNights, max_guests: maxGuests, platforms },
        total_properties: competitors.length,
        successful_properties: results.filter(r => r.success && r.found).length,
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
