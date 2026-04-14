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
      const radiusKm = body.radius_km || 10;
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
- Berücksichtige Wohnungen im Umkreis von ${radiusKm} km

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
    {
      "address": "Beispielstr. 1, 14612 Falkensee",
      "sqm": 65,
      "rooms": 2,
      "rent": 800,
      "source": "ImmoScout24",
      "description": "Helle 2-Zimmer-Wohnung mit Balkon und Einbauküche...",
      "floor": "2. OG",
      "year_built": 2005,
      "features": ["Balkon", "Einbauküche", "Keller", "Aufzug"],
      "available_from": "01.07.2026",
      "listing_url": "https://www.immobilienscout24.de/expose/12345678"
    }
  ]

WICHTIG für comparables:
- Gib so viele Details wie möglich pro Objekt an
- description: Kurzbeschreibung aus dem Inserat (1-2 Sätze)
- floor: Etage/Stockwerk wenn bekannt
- year_built: Baujahr wenn bekannt
- features: Array mit Ausstattungsmerkmalen (Balkon, Einbauküche, Keller, Aufzug, Garten, Stellplatz, etc.)
- available_from: Verfügbar ab Datum wenn bekannt
- listing_url: Die EXAKTE URL zum Originalinserat aus deinen Suchergebnissen. KEINE Platzhalter-URLs wie "expose/..." -- nur echte, funktionierende Links. Wenn du keine echte URL hast, setze den Wert auf null.
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
      const rentalCitations = data.citations || [];
      console.log('[scrape-prices] 📥 Rental analysis response:', content);
      console.log('[scrape-prices] 📎 Citations:', JSON.stringify(rentalCitations));

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

      // Enrich comparables with citation URLs as fallback
      const comparables = (rentalData.comparables || []).map((c: any, idx: number) => {
        const url = c.listing_url;
        const isPlaceholder = !url || url.includes('...') || url.includes('expose/1') || url.length < 20;
        if (isPlaceholder && rentalCitations.length > 0) {
          // Try to match citation by source platform name
          const sourceLower = (c.source || '').toLowerCase();
          const matched = rentalCitations.find((cit: string) => {
            const citLower = cit.toLowerCase();
            if (sourceLower.includes('immoscout') || sourceLower.includes('immobilienscout')) return citLower.includes('immobilienscout24');
            if (sourceLower.includes('immowelt')) return citLower.includes('immowelt');
            if (sourceLower.includes('ebay')) return citLower.includes('ebay');
            if (sourceLower.includes('wg-gesucht')) return citLower.includes('wg-gesucht');
            return false;
          });
          return { ...c, listing_url: matched || (rentalCitations[idx] ?? null) };
        }
        return c;
      });

      return new Response(
        JSON.stringify({
          success: true,
          manual,
          analysis_type: 'rental',
          citations: rentalCitations,
          results: [{
            success: true,
            property: body.house_name || address,
            avg_rent: rentalData.avg_rent,
            min_rent: rentalData.min_rent,
            max_rent: rentalData.max_rent,
            price_per_sqm: rentalData.price_per_sqm,
            comparable_count: rentalData.comparable_count,
            sources: rentalData.sources,
            comparables,
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
AUFGABE: Finde den ENDPREIS fuer diese Ferienunterkunft -- so wie er auf einem Buchungsportal angezeigt wird.

NAME: ${property.property_name}
URL: ${property.property_url || 'Keine URL vorhanden'}

SUCHPARAMETER:
- Reisezeitraum: ${checkInFrom} bis ${checkInTo}
- Personen: bis zu ${maxGuests}
- Aufenthalt: ${minNights} Naechte
- Suche auf: ${platformText}

WAS ICH BRAUCHE:
- Den ENDPREIS den ein Gast auf dem Buchungsportal sieht (inkl. aller Steuern, Gebuehren, Endreinigung etc.)
- Entweder als Preis pro Nacht ODER als Gesamtpreis fuer den Aufenthalt
- Wenn du den Gesamtpreis kennst, berechne auch den Nachtpreis (Gesamtpreis / Naechte)
- Wenn du nur den Nachtpreis kennst, gib nur diesen an
- Was im Preis enthalten ist als kurzen Text (z.B. "inkl. Steuern, Endreinigung, Bettwaesche")
- KEINE kuenstliche Aufschluesselung von Nebenkosten -- einfach was auf dem Portal steht

ANTWORT-FORMAT (NUR JSON, keine Erklaerungen):
{
  "found": true,
  "property_details": {
    "description": "Kurze Beschreibung der Unterkunft",
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "size_sqm": 120,
    "rating": 9.2,
    "review_count": 48,
    "amenities": ["Sauna", "Whirlpool", "WLAN", "Parkplatz"],
    "address": "Ort/Region der Unterkunft",
    "highlights": ["Panoramablick", "Ski-in/Ski-out"]
  },
  "prices": [
    {
      "price_per_night": 270,
      "price_total": 1890,
      "nights": 7,
      "guests": 6,
      "check_in": "2026-07-01",
      "platform": "booking.com",
      "includes": "inkl. Steuern, Endreinigung, Bettwaesche"
    }
  ],
  "general_info": "Weitere Preis-Hinweise falls vorhanden"
}

REGELN:
- price_per_night und/oder price_total angeben -- mindestens eines davon
- Wenn nur Gesamtpreis bekannt: price_per_night = price_total / nights
- Wenn nur Nachtpreis bekannt: price_total = null
- "includes" = was im Preis enthalten ist (kurzer Text)
- Mehrere Preis-Eintraege erlaubt wenn verschiedene Portale/Zeitraeume gefunden
- Auch Preise aus Preislisten oder Saisontabellen sind willkommen

Falls GAR KEINE Preisinformationen gefunden werden:
{
  "found": false,
  "property_details": { ... trotzdem ausfuellen wenn moeglich ... },
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

          let prices = Array.isArray(priceData.prices) ? priceData.prices : [];
          
          // If no prices but general_info contains price hints, create synthetic entry
          if (prices.length === 0 && priceData.general_info) {
            const info = priceData.general_info;
            // Try to extract price ranges like "236-456€" or "200€/Nacht"
            const rangeMatch = info.match(/(\d+)\s*[-–]\s*(\d+)\s*€/);
            const singleMatch = info.match(/(\d+)\s*€\s*\/\s*Nacht/i);
            if (rangeMatch) {
              const min = parseInt(rangeMatch[1]);
              const max = parseInt(rangeMatch[2]);
              prices.push({
                price_per_night: Math.round((min + max) / 2),
                includes: `Spanne: ${min}-${max}€/Nacht`,
                platform: 'diverse',
              });
            } else if (singleMatch) {
              prices.push({
                price_per_night: parseInt(singleMatch[1]),
                includes: `Richtwert`,
                platform: 'diverse',
              });
            }
          }
          
          const found = priceData.found !== false || prices.length > 0;

          // Save best price to monthly_pricing
          if (found) {
            // Support both new (price_total) and legacy (total_price) field names
            const getTotal = (p: any) => p.price_total || p.total_price || (p.price_per_night && p.nights ? p.price_per_night * p.nights : null);
            const pricesWithTotal = prices.filter((p: any) => getTotal(p));
            const bestPrice = pricesWithTotal.length > 0
              ? pricesWithTotal.reduce((min: any, p: any) => (getTotal(p) < getTotal(min)) ? p : min, pricesWithTotal[0])
              : prices[0];

            const bestTotal = bestPrice ? getTotal(bestPrice) : null;

            if (bestPrice && bestTotal) {
              const checkInDate = bestPrice.check_in || checkInFrom;
              const nights = bestPrice.nights || minNights;
              const checkOutDate = (() => {
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
                  base_price_7nights: bestTotal,
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

          // Update competitor_properties with newly found details
          const details = priceData.property_details;
          if (details && typeof details === 'object') {
            const updates: Record<string, any> = {};
            if (details.max_guests && !property.max_guests) updates.max_guests = details.max_guests;
            if (details.bedrooms && !property.bedrooms) updates.bedrooms = details.bedrooms;
            if (details.bathrooms && !property.bathrooms) updates.bathrooms = details.bathrooms;
            if (details.address && !property.address) updates.address = details.address;
            if (details.rating && !property.rating) updates.rating = details.rating;
            if (details.review_count && !property.review_count) updates.review_count = details.review_count;
            if (details.amenities?.length && (!property.amenities || (Array.isArray(property.amenities) && property.amenities.length === 0))) {
              updates.amenities = details.amenities;
            }

            if (Object.keys(updates).length > 0) {
              updates.updated_at = new Date().toISOString();
              const { error: updateError } = await supabase
                .from('competitor_properties')
                .update(updates)
                .eq('id', property.id);
              if (updateError) console.error(`[scrape-prices] ❌ Update competitor error:`, updateError);
              else console.log(`[scrape-prices] ✅ Updated competitor with ${Object.keys(updates).length} fields`);
            }
          }

          console.log(`[scrape-prices] ✅ ${property.property_name}: ${prices.length} prices found`);
          resultFound = true;

          results.push({
            property: property.property_name,
            success: true,
            found,
            prices,
            property_details: details || null,
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
