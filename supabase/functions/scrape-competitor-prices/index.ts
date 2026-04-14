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

      // Map UI IDs to readable labels for the prompt
      const rentalLabelMap: Record<string, string> = {
        'immoscout24': 'ImmoScout24',
        'immowelt': 'Immowelt',
        'ebay-kleinanzeigen': 'eBay Kleinanzeigen',
        'wg-gesucht': 'WG-gesucht',
        'wohnungsboerse': 'Wohnungsbörse',
      };
      const platformText = platforms.includes('alle')
        ? 'ImmoScout24, Immowelt, eBay Kleinanzeigen, WG-gesucht'
        : platforms.map(p => rentalLabelMap[p] || p).join(', ');

      // Build domain filter for rental search (keys = UI IDs)
      const rentalDomainMap: Record<string, string> = {
        'immoscout24': 'immobilienscout24.de',
        'immowelt': 'immowelt.de',
        'ebay-kleinanzeigen': 'kleinanzeigen.de',
        'wg-gesucht': 'wg-gesucht.de',
        'wohnungsboerse': 'wohnungsboerse.net',
      };
      const rentalDomainFilter: string[] = platforms.includes('alle')
        ? Object.values(rentalDomainMap)
        : platforms.map(p => rentalDomainMap[p]).filter(Boolean);
      console.log(`[scrape-prices] Rental domain filter: ${rentalDomainFilter.join(', ')}`);

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
- listing_url: Die direkte URL zum spezifischen Inserat (z.B. https://www.immobilienscout24.de/expose/12345678 oder https://www.immowelt.de/expose/abcde). KEINE Startseiten, KEINE Mietspiegel-Seiten, KEINE Suchergebnis-Seiten. NUR die URL die direkt zum einzelnen Wohnungsinserat fuehrt. Wenn du keine echte Inserat-URL hast, setze den Wert auf null.
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
            { role: 'system', content: 'Du durchsuchst Immobilienportale nach konkreten Mietinseraten. Gib NUR Daten zurueck die du in echten Inseraten auf den Portalen findest. Antworte ausschliesslich mit validem JSON. Keine Mietspiegel oder Statistikseiten.' },
            { role: 'user', content: rentalPrompt }
          ],
          temperature: 0.0,
          max_tokens: 2000,
          return_images: false,
          return_related_questions: false,
          ...(rentalDomainFilter.length > 0 ? { search_domain_filter: rentalDomainFilter } : {}),
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

      // Helper: check if a URL looks like a specific listing (not a homepage/search/mietspiegel)
      const isListingUrl = (url: string): boolean => {
        const lower = url.toLowerCase();
        // Reject generic pages
        if (lower.match(/\/(mietspiegel|mietpreise|statistik|ratgeber|suche|search|ergebnisse|results|blog|magazin|news)\b/)) return false;
        // Reject homepages (path is just / or empty after domain)
        try {
          const parsed = new URL(url);
          if (parsed.pathname === '/' || parsed.pathname === '') return false;
        } catch { return false; }
        // Accept known listing patterns
        if (lower.includes('/expose/') || lower.includes('/angebot/') || lower.includes('/wohnung/') || lower.includes('/objekt/') || lower.includes('/d/details/') || lower.includes('/anzeige/')) return true;
        // Accept if path has numeric ID segment (likely a listing)
        if (lower.match(/\/\d{5,}/)) return true;
        return false;
      };

      // Enrich comparables with citation URLs as fallback
      const comparables = (rentalData.comparables || []).map((c: any, idx: number) => {
        const url = c.listing_url;
        const isPlaceholder = !url || url.includes('...') || url.includes('expose/1') || url.length < 20;
        if (isPlaceholder && rentalCitations.length > 0) {
          // Only use citations that look like actual listings
          const listingCitations = rentalCitations.filter((cit: string) => isListingUrl(cit));
          
          const sourceLower = (c.source || '').toLowerCase();
          const matched = listingCitations.find((cit: string) => {
            const citLower = cit.toLowerCase();
            if (sourceLower.includes('immoscout') || sourceLower.includes('immobilienscout')) return citLower.includes('immobilienscout24');
            if (sourceLower.includes('immowelt')) return citLower.includes('immowelt');
            if (sourceLower.includes('ebay') || sourceLower.includes('kleinanzeigen')) return citLower.includes('kleinanzeigen');
            if (sourceLower.includes('wg-gesucht')) return citLower.includes('wg-gesucht');
            return false;
          });
          return { ...c, listing_url: matched || (listingCitations[idx] ?? null) };
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

    // Map UI IDs to readable labels for the prompt
    const touristLabelMap: Record<string, string> = {
      'booking.com': 'Booking.com',
      'airbnb': 'Airbnb',
      'vrbo': 'VRBO',
      'belvilla': 'Belvilla',
      'fewo-direkt': 'FeWo-direkt',
      'holidu': 'Holidu',
      'traum-ferienwohnungen': 'Traum-Ferienwohnungen',
    };
    const platformText = platforms.includes('alle') 
      ? 'Booking.com, Airbnb, VRBO, Belvilla, FeWo-direkt, Holidu, Traum-Ferienwohnungen'
      : platforms.map(p => touristLabelMap[p] || p).join(', ');

    // Build domain filter for Perplexity search (keys = UI IDs)
    const domainMap: Record<string, string> = {
      'booking.com': 'booking.com',
      'airbnb': 'airbnb.com',
      'vrbo': 'vrbo.com',
      'belvilla': 'belvilla.de',
      'fewo-direkt': 'fewo-direkt.de',
      'holidu': 'holidu.com',
      'traum-ferienwohnungen': 'traum-ferienwohnungen.de',
    };
    const searchDomainFilter: string[] = platforms.includes('alle')
      ? Object.values(domainMap)
      : platforms.map(p => domainMap[p]).filter(Boolean);
    console.log(`[scrape-prices] Domain filter: ${searchDomainFilter.join(', ')}`);

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
Finde das Inserat dieser Ferienunterkunft auf den genannten Buchungsportalen und lies den dort aktuell angezeigten Preis ab.

UNTERKUNFT: "${property.property_name}"
${property.property_url ? `BEKANNTE URL: ${property.property_url}` : ''}

SUCHE AUF: ${platformText}

AUFGABE:
1. Finde das Inserat dieser Unterkunft auf den Portalen
2. Lies den dort angezeigten Preis ab (egal fuer welchen Zeitraum)
3. Notiere fuer welchen Zeitraum/Personen der Preis gilt (wenn sichtbar)

ANTWORT NUR ALS JSON:
{
  "found": true/false,
  "property_details": {
    "description": "Kurzbeschreibung aus dem Inserat",
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "size_sqm": 120,
    "rating": 9.2,
    "review_count": 48,
    "amenities": ["Sauna", "WLAN"],
    "address": "Ort der Unterkunft",
    "highlights": ["Panoramablick"]
  },
  "prices": [
    {
      "price": 1338,
      "price_info": "1 Woche, 6 Erwachsene, inkl. Steuern und Gebuehren",
      "platform": "Booking.com"
    }
  ],
  "general_info": "Zusaetzliche Infos zum Inserat"
}

REGELN:
- "price" = der Preis wie er im Inserat angezeigt wird (Gesamtpreis oder Nachtpreis)
- "price_info" = Kontext zum Preis (Zeitraum, Personenzahl, was enthalten ist) -- genau so wie im Inserat steht
- Mehrere Eintraege wenn auf verschiedenen Portalen gefunden
- Wenn kein Inserat gefunden: found=false, prices=[]
- Erfinde KEINE Preise! Nur was tatsaechlich im Inserat steht
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
                { role: 'system', content: 'Du durchsuchst Buchungsportale nach aktuellen Mietpreisen fuer Ferienunterkuenfte. Gib NUR Preise zurueck die du tatsaechlich auf den Portalen findest. Antworte ausschliesslich mit validem JSON.' },
                { role: 'user', content: priceQuery }
              ],
              temperature: 0.0,
              max_tokens: 2000,
              return_images: false,
              return_related_questions: false,
              ...(searchDomainFilter.length > 0 ? { search_domain_filter: searchDomainFilter } : {}),
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
          
          // Extract citations from Perplexity response
          const citations: string[] = data.citations || [];
          console.log(`[scrape-prices] 📎 Citations for ${property.property_name}:`, JSON.stringify(citations));

          // Find best citation URL matching the portal domains
          const portalDomains = ['booking.com', 'airbnb.com', 'airbnb.de', 'vrbo.com', 'fewo-direkt.de', 'belvilla.de', 'holidu.com', 'traum-ferienwohnungen.de'];
          const relevantCitations = citations.filter((url: string) => {
            const lower = url.toLowerCase();
            return portalDomains.some(d => lower.includes(d));
          });
          const bestCitationUrl = relevantCitations[0] || null;
          console.log(`[scrape-prices] 🔗 Best citation URL: ${bestCitationUrl}`);

          // Assign listing_url to each price entry from citations
          prices = prices.map((p: any) => {
            const platformLower = (p.platform || '').toLowerCase();
            const matchedCitation = relevantCitations.find((url: string) => {
              const urlLower = url.toLowerCase();
              if (platformLower.includes('booking')) return urlLower.includes('booking.com');
              if (platformLower.includes('airbnb')) return urlLower.includes('airbnb');
              if (platformLower.includes('vrbo')) return urlLower.includes('vrbo');
              if (platformLower.includes('fewo')) return urlLower.includes('fewo-direkt');
              if (platformLower.includes('belvilla')) return urlLower.includes('belvilla');
              if (platformLower.includes('holidu')) return urlLower.includes('holidu');
              return false;
            });
            return { ...p, listing_url: matchedCitation || bestCitationUrl || null };
          });

          const found = priceData.found !== false || prices.length > 0;

          // Update competitor_properties.property_url if missing and we found a citation
          if (bestCitationUrl && !property.property_url) {
            const { error: urlUpdateError } = await supabase
              .from('competitor_properties')
              .update({ property_url: bestCitationUrl, updated_at: new Date().toISOString() })
              .eq('id', property.id);
            if (urlUpdateError) console.error(`[scrape-prices] ❌ URL update error:`, urlUpdateError);
            else console.log(`[scrape-prices] ✅ Saved property_url: ${bestCitationUrl}`);
          }

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
            listing_url: bestCitationUrl || property.property_url || null,
            citations: relevantCitations,
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
