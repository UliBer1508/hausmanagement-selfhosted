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

      // Helper: check if a URL looks like a specific listing
      const isListingUrl = (url: string): boolean => {
        const lower = url.toLowerCase();
        if (lower.match(/\/(mietspiegel|mietpreise|statistik|ratgeber|suche|search|ergebnisse|results|blog|magazin|news)\b/)) return false;
        try {
          const parsed = new URL(url);
          if (parsed.pathname === '/' || parsed.pathname === '') return false;
        } catch { return false; }
        if (lower.includes('/expose/') || lower.includes('/angebot/') || lower.includes('/wohnung/') || lower.includes('/objekt/') || lower.includes('/d/details/') || lower.includes('/anzeige/')) return true;
        if (lower.match(/\/\d{5,}/)) return true;
        return false;
      };

      // Enrich comparables with citation URLs as fallback
      const comparables = (rentalData.comparables || []).map((c: any, idx: number) => {
        const url = c.listing_url;
        const isPlaceholder = !url || url.includes('...') || url.includes('expose/1') || url.length < 20;
        if (isPlaceholder && rentalCitations.length > 0) {
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

    // ===================== TOURIST MODE (Location-based search) =====================
    console.log('[scrape-prices] Running tourist location-based search...');
    
    const location = body.location || '';
    const checkIn = body.check_in || '';
    const checkOut = body.check_out || '';
    const guests = body.guests ?? 6;
    const platforms: string[] = body.platforms ?? ['alle'];
    
    if (!location) {
      throw new Error('Kein Ort angegeben');
    }
    
    console.log(`[scrape-prices] Location search: "${location}", ${checkIn} - ${checkOut}, ${guests} guests, platforms: ${platforms.join(', ')}`);

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

    // Build domain filter for Perplexity search
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

    // Format dates for display in prompt
    const formatDateDE = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
    };
    const checkInDE = checkIn ? formatDateDE(checkIn) : '';
    const checkOutDE = checkOut ? formatDateDE(checkOut) : '';
    const nightsCount = checkIn && checkOut ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)) : 7;

    const searchPrompt = `
Suche verfuegbare Ferienwohnungen, Chalets und Ferienhaeuser in ${location} auf ${platformText} fuer folgenden Zeitraum:

CHECK-IN: ${checkInDE}
CHECK-OUT: ${checkOutDE} (${nightsCount} Naechte)
PERSONEN: ${guests}

AUFGABE:
1. Suche auf den genannten Portalen nach verfuegbaren Unterkuenften in ${location} fuer diesen Zeitraum und diese Personenanzahl
2. Fuer jedes gefundene Angebot lies den angezeigten Gesamtpreis ab
3. Sammle alle relevanten Details

ANTWORT NUR ALS JSON:
{
  "found": true,
  "listings": [
    {
      "name": "Name der Unterkunft",
      "price_total": 1338,
      "price_per_night": 191,
      "price_info": "Gesamtpreis fuer ${nightsCount} Naechte, ${guests} Personen, inkl. Steuern",
      "platform": "Booking.com",
      "description": "Kurzbeschreibung der Unterkunft",
      "max_guests": 6,
      "bedrooms": 3,
      "bathrooms": 2,
      "size_sqm": 120,
      "rating": 9.2,
      "review_count": 48,
      "amenities": ["Sauna", "WLAN", "Parkplatz"],
      "address": "Genaue Adresse oder Ortsteil",
      "highlights": ["Panoramablick", "Ski-in/Ski-out"],
      "listing_url": "Direkte URL zum Inserat auf dem Portal"
    }
  ],
  "search_summary": "Zusammenfassung der Suchergebnisse"
}

REGELN:
- Gib ALLE gefundenen Angebote zurueck, nicht nur die guenstigsten
- "price_total" = Gesamtpreis fuer den gesamten Zeitraum wie im Portal angezeigt
- "price_per_night" = Preis pro Nacht wenn separat angegeben
- "listing_url" = Die direkte URL zum Inserat auf dem Buchungsportal. KEINE Suchseiten oder Startseiten.
- Wenn du keinen Preis findest, setze price_total auf null
- Erfinde KEINE Preise! Nur was tatsaechlich auf den Portalen angezeigt wird
- Sortiere nach Preis aufsteigend
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
          { role: 'system', content: 'Du durchsuchst Buchungsportale nach verfuegbaren Ferienunterkuenften mit Preisen. Gib NUR Daten zurueck die du tatsaechlich auf den Portalen findest. Antworte ausschliesslich mit validem JSON.' },
          { role: 'user', content: searchPrompt }
        ],
        temperature: 0.0,
        max_tokens: 4000,
        return_images: false,
        return_related_questions: false,
        ...(searchDomainFilter.length > 0 ? { search_domain_filter: searchDomainFilter } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[scrape-prices] ❌ API error ${response.status}:`, errorBody);
      throw new Error(`Perplexity API error ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const citations: string[] = data.citations || [];
    
    console.log(`[scrape-prices] 📥 RAW RESPONSE:`);
    console.log(content);
    console.log(`[scrape-prices] 📎 Citations:`, JSON.stringify(citations));

    // Parse JSON response
    let searchData;
    try {
      searchData = JSON.parse(content);
    } catch {
      let cleaned = content.trim();
      const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlock) cleaned = codeBlock[1].trim();
      const jsonStart = cleaned.indexOf('{');
      if (jsonStart >= 0) cleaned = cleaned.substring(jsonStart);
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonEnd >= 0) cleaned = cleaned.substring(0, jsonEnd + 1);
      try {
        searchData = JSON.parse(cleaned);
      } catch {
        console.error(`[scrape-prices] ❌ JSON parse failed`);
        throw new Error('JSON parse failed');
      }
    }

    const listings = Array.isArray(searchData.listings) ? searchData.listings : [];
    console.log(`[scrape-prices] Found ${listings.length} listings`);

    // Map portal domains for citation matching
    const portalDomains = ['booking.com', 'airbnb.com', 'airbnb.de', 'vrbo.com', 'fewo-direkt.de', 'belvilla.de', 'holidu.com', 'traum-ferienwohnungen.de'];
    const relevantCitations = citations.filter((url: string) => {
      const lower = url.toLowerCase();
      return portalDomains.some(d => lower.includes(d));
    });
    console.log(`[scrape-prices] 🔗 Relevant citations: ${relevantCitations.length}`);

    // Enrich listings with citation URLs
    const enrichedListings = listings.map((listing: any, idx: number) => {
      const platformLower = (listing.platform || '').toLowerCase();
      
      // Try to match citation to platform
      let matchedCitation = relevantCitations.find((url: string) => {
        const urlLower = url.toLowerCase();
        if (platformLower.includes('booking')) return urlLower.includes('booking.com');
        if (platformLower.includes('airbnb')) return urlLower.includes('airbnb');
        if (platformLower.includes('vrbo')) return urlLower.includes('vrbo');
        if (platformLower.includes('fewo')) return urlLower.includes('fewo-direkt');
        if (platformLower.includes('belvilla')) return urlLower.includes('belvilla');
        if (platformLower.includes('holidu')) return urlLower.includes('holidu');
        return false;
      });

      // Validate the listing_url from AI response
      const aiUrl = listing.listing_url;
      const isValidUrl = aiUrl && aiUrl.startsWith('http') && aiUrl.length > 20 && !aiUrl.includes('...');
      
      const finalUrl = isValidUrl ? aiUrl : (matchedCitation || relevantCitations[idx] || null);

      return {
        name: listing.name || 'Unbekannte Unterkunft',
        price_total: listing.price_total || null,
        price_per_night: listing.price_per_night || null,
        price_info: listing.price_info || null,
        platform: listing.platform || null,
        description: listing.description || null,
        max_guests: listing.max_guests || null,
        bedrooms: listing.bedrooms || null,
        bathrooms: listing.bathrooms || null,
        size_sqm: listing.size_sqm || null,
        rating: listing.rating || null,
        review_count: listing.review_count || null,
        amenities: listing.amenities || [],
        address: listing.address || null,
        highlights: listing.highlights || [],
        listing_url: finalUrl,
      };
    });

    console.log('[scrape-prices] ✅ Search complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results: enrichedListings,
        manual,
        analysis_type: 'tourist',
        search_params: { location, check_in: checkIn, check_out: checkOut, guests, platforms },
        total_listings: enrichedListings.length,
        search_summary: searchData.search_summary || null,
        citations: relevantCitations,
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
