import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---- Portal-specific search logic ----

interface PortalSearchParams {
  location: string;
  checkInDE: string;
  checkOutDE: string;
  nightsCount: number;
  guests: number;
}

async function searchBookingCom(params: PortalSearchParams, perplexityKey: string) {
  const { location, checkInDE, checkOutDE, nightsCount, guests } = params;

  const prompt = `
Suche Ferienwohnungen und Ferienhaeuser auf booking.com in ${location}.

ZEITRAUM: ${checkInDE} bis ${checkOutDE} (${nightsCount} Naechte)
PERSONEN: ${guests}

AUFGABE:
- Finde konkrete Inserate auf booking.com fuer diesen Zeitraum und diese Personenzahl
- Suche NUR auf booking.com direkt
- Der Preis soll der ENDPREIS sein (inkl. Steuern, Gebuehren, Reinigung)
- Booking.com nutzt ein Bewertungssystem von 1-10 Punkten

ANTWORT NUR ALS JSON:
{
  "listings": [
    {
      "name": "Name der Unterkunft",
      "price_total": 1338,
      "price_per_night": 191,
      "price_info": "Endpreis inkl. Steuern und Gebuehren fuer ${nightsCount} Naechte",
      "description": "Kurzbeschreibung",
      "max_guests": 6,
      "bedrooms": 3,
      "bathrooms": 2,
      "size_sqm": 120,
      "rating": 8.9,
      "review_count": 48,
      "amenities": ["Sauna", "WLAN", "Parkplatz"],
      "address": "Ortsteil oder Adresse",
      "highlights": ["Panoramablick", "Ski-in/Ski-out"],
      "listing_url": "Direkte URL zum Inserat"
    }
  ]
}

REGELN:
- Gib ALLE gefundenen Angebote zurueck
- "rating" ist die Booking.com-Punktzahl (1-10), NICHT Sterne
- Wenn nur ein Nachtpreis bekannt ist: price_total = price_per_night * ${nightsCount}
- listing_url = direkte URL zum Inserat, KEINE Suchseiten
- Auch ungefaehre Preise oder Preisspannen sind OK
- Sortiere nach Preis aufsteigend
`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'Du bist ein Reise-Recherche-Experte spezialisiert auf Booking.com. Finde Ferienunterkuenfte mit Endpreisen inkl. aller Gebuehren. Antworte ausschliesslich mit validem JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0,
      max_tokens: 4000,
      return_images: false,
      return_related_questions: false,
      
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[booking.com] API error ${response.status}:`, errorBody);
    return { listings: [], citations: [], error: `API error ${response.status}` };
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const citations: string[] = data.citations || [];
  console.log(`[booking.com] Response received, ${citations.length} citations`);

  const parsed = parseJsonResponse(content);
  const listings = (parsed?.listings || []).map((l: any) => ({
    ...normalizeListingFields(l),
    platform: 'Booking.com',
    booking_rating_score: l.rating || null,
  }));

  return { listings: enrichListingsWithCitations(listings, citations, 'booking.com'), citations };
}

async function searchAirbnb(params: PortalSearchParams, perplexityKey: string) {
  const { location, checkInDE, checkOutDE, nightsCount, guests } = params;

  const prompt = `
Suche Ferienwohnungen und Ferienhaeuser auf Airbnb in ${location}.

ZEITRAUM: ${checkInDE} bis ${checkOutDE} (${nightsCount} Naechte)
GAESTE: ${guests}

AUFGABE:
- Finde konkrete Inserate auf airbnb.com oder airbnb.de fuer diesen Zeitraum
- Suche NUR auf airbnb.com bzw. airbnb.de direkt
- Der Preis soll der GESAMTPREIS sein (Basis + Service-Gebuehr + Reinigungsgebuehr)
- Airbnb nutzt Sterne-Bewertungen (1-5) und hat "Superhost"-Status

ANTWORT NUR ALS JSON:
{
  "listings": [
    {
      "name": "Name der Unterkunft",
      "price_total": 1200,
      "price_per_night": 171,
      "price_info": "Gesamtpreis inkl. Service- und Reinigungsgebuehr fuer ${nightsCount} Naechte",
      "description": "Kurzbeschreibung",
      "max_guests": 6,
      "bedrooms": 3,
      "bathrooms": 2,
      "size_sqm": 100,
      "rating": 4.8,
      "review_count": 32,
      "superhost": true,
      "cleaning_fee": 80,
      "service_fee": 120,
      "amenities": ["Pool", "WLAN", "Kueche"],
      "address": "Ortsteil oder Adresse",
      "highlights": ["Superhost", "Selbst-Check-in"],
      "listing_url": "Direkte URL zum Inserat"
    }
  ]
}

REGELN:
- Gib ALLE gefundenen Angebote zurueck
- "rating" ist die Airbnb-Sternebewertung (1-5), NICHT Booking-Punkte
- "superhost" = true wenn der Gastgeber Superhost ist
- Wenn nur ein Nachtpreis bekannt ist: price_total = price_per_night * ${nightsCount}
- listing_url = direkte URL zum Inserat, KEINE Suchseiten
- Auch ungefaehre Preise oder Preisspannen sind OK
- Sortiere nach Preis aufsteigend
`;

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: 'Du bist ein Reise-Recherche-Experte spezialisiert auf Airbnb. Finde Ferienunterkuenfte mit Gesamtpreisen inkl. Service- und Reinigungsgebuehren. Antworte ausschliesslich mit validem JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.0,
      max_tokens: 4000,
      return_images: false,
      return_related_questions: false,
      
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[airbnb] API error ${response.status}:`, errorBody);
    return { listings: [], citations: [], error: `API error ${response.status}` };
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const citations: string[] = data.citations || [];
  console.log(`[airbnb] Response received, ${citations.length} citations`);

  const parsed = parseJsonResponse(content);
  const listings = (parsed?.listings || []).map((l: any) => ({
    ...normalizeListingFields(l),
    platform: 'Airbnb',
    superhost: l.superhost || false,
    cleaning_fee: l.cleaning_fee || null,
    service_fee: l.service_fee || null,
  }));

  return { listings: enrichListingsWithCitations(listings, citations, 'airbnb'), citations };
}

// ---- Helpers ----

function parseJsonResponse(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    let cleaned = content.trim();
    const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlock) cleaned = codeBlock[1].trim();
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart >= 0) cleaned = cleaned.substring(jsonStart);
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd >= 0) cleaned = cleaned.substring(0, jsonEnd + 1);
    try {
      return JSON.parse(cleaned);
    } catch {
      console.error('[parse] JSON parse failed');
      return null;
    }
  }
}

function normalizeListingFields(l: any) {
  return {
    name: l.name || 'Unbekannte Unterkunft',
    price_total: l.price_total || null,
    price_per_night: l.price_per_night || null,
    price_info: l.price_info || null,
    platform: l.platform || null,
    description: l.description || null,
    max_guests: l.max_guests || null,
    bedrooms: l.bedrooms || null,
    bathrooms: l.bathrooms || null,
    size_sqm: l.size_sqm || null,
    rating: l.rating || null,
    review_count: l.review_count || null,
    amenities: l.amenities || [],
    address: l.address || null,
    highlights: l.highlights || [],
    listing_url: l.listing_url || null,
  };
}

function enrichListingsWithCitations(listings: any[], citations: string[], portalKey: string) {
  const portalDomains: Record<string, string[]> = {
    'booking.com': ['booking.com'],
    'airbnb': ['airbnb.com', 'airbnb.de'],
  };
  const domains = portalDomains[portalKey] || [];

  const relevantCitations = citations.filter((url: string) => {
    const lower = url.toLowerCase();
    return domains.some(d => lower.includes(d));
  });

  return listings.map((listing: any, idx: number) => {
    const aiUrl = listing.listing_url;
    const isValidUrl = aiUrl && aiUrl.startsWith('http') && aiUrl.length > 20 && !aiUrl.includes('...');
    if (!isValidUrl && relevantCitations.length > 0) {
      return { ...listing, listing_url: relevantCitations[idx] || relevantCitations[0] || null };
    }
    return listing;
  });
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[scrape-prices] Starting...');
    
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
            { role: 'system', content: 'Du durchsuchst Immobilienportale nach konkreten Mietinseraten. Antworte ausschliesslich mit validem JSON.' },
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
        throw new Error(`Perplexity API error ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const rentalCitations = data.citations || [];

      const rentalData = parseJsonResponse(content);
      if (!rentalData) throw new Error('JSON parse failed for rental analysis');

      if (houseId) {
        await supabase.from('rental_price_analysis').insert({
          house_id: houseId,
          avg_rent: rentalData.avg_rent || null,
          min_rent: rentalData.min_rent || null,
          max_rent: rentalData.max_rent || null,
          price_per_sqm: rentalData.price_per_sqm || null,
          comparable_count: rentalData.comparable_count || 0,
          sources: rentalData.sources || [],
          search_params: { address, sqm, rooms, platforms, current_rent: currentRent },
        });
      }

      const isListingUrl = (url: string): boolean => {
        const lower = url.toLowerCase();
        if (lower.match(/\/(mietspiegel|mietpreise|statistik|ratgeber|suche|search|ergebnisse|results|blog|magazin|news)\b/)) return false;
        try { const parsed = new URL(url); if (parsed.pathname === '/' || parsed.pathname === '') return false; } catch { return false; }
        if (lower.includes('/expose/') || lower.includes('/angebot/') || lower.includes('/wohnung/') || lower.includes('/objekt/') || lower.includes('/d/details/') || lower.includes('/anzeige/')) return true;
        if (lower.match(/\/\d{5,}/)) return true;
        return false;
      };

      const comparables = (rentalData.comparables || []).map((c: any, idx: number) => {
        const url = c.listing_url;
        const isPlaceholder = !url || url.includes('...') || url.includes('expose/1') || url.length < 20;
        if (isPlaceholder && rentalCitations.length > 0) {
          const listingCitations = rentalCitations.filter((cit: string) => isListingUrl(cit));
          const sourceLower = (c.source || '').toLowerCase();
          const matched = listingCitations.find((cit: string) => {
            const citLower = cit.toLowerCase();
            if (sourceLower.includes('immoscout')) return citLower.includes('immobilienscout24');
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
          success: true, manual, analysis_type: 'rental', citations: rentalCitations,
          results: [{
            success: true,
            property: body.house_name || address,
            avg_rent: rentalData.avg_rent, min_rent: rentalData.min_rent, max_rent: rentalData.max_rent,
            price_per_sqm: rentalData.price_per_sqm, comparable_count: rentalData.comparable_count,
            sources: rentalData.sources, comparables,
          }],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===================== TOURIST MODE =====================
    console.log('[scrape-prices] Running tourist search...');
    
    const location = body.location || '';
    const checkIn = body.check_in || '';
    const checkOut = body.check_out || '';
    const guests = body.guests ?? 6;
    const platforms: string[] = body.platforms ?? ['alle'];
    
    if (!location) throw new Error('Kein Ort angegeben');

    const formatDateDE = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
    };
    const checkInDE = checkIn ? formatDateDE(checkIn) : '';
    const checkOutDE = checkOut ? formatDateDE(checkOut) : '';
    const nightsCount = checkIn && checkOut ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)) : 7;

    const searchParams: PortalSearchParams = { location, checkInDE, checkOutDE, nightsCount, guests };

    // Determine which portals to search
    const searchBooking = platforms.includes('alle') || platforms.includes('booking.com');
    const searchAirbnbPortal = platforms.includes('alle') || platforms.includes('airbnb');

    console.log(`[scrape-prices] Searching: Booking=${searchBooking}, Airbnb=${searchAirbnbPortal}`);

    // Run portal searches in parallel
    const searchPromises: Promise<{ listings: any[]; citations: string[]; error?: string }>[] = [];
    const portalKeys: string[] = [];

    if (searchBooking) {
      searchPromises.push(searchBookingCom(searchParams, perplexityKey));
      portalKeys.push('booking.com');
    }
    if (searchAirbnbPortal) {
      searchPromises.push(searchAirbnb(searchParams, perplexityKey));
      portalKeys.push('airbnb');
    }

    const portalResults = await Promise.all(searchPromises);

    // Build results_by_platform
    const resultsByPlatform: Record<string, { listings: any[]; citations: string[] }> = {};
    const allListings: any[] = [];
    const allCitations: string[] = [];

    portalKeys.forEach((key, i) => {
      const result = portalResults[i];
      resultsByPlatform[key] = { listings: result.listings, citations: result.citations };
      allListings.push(...result.listings);
      allCitations.push(...result.citations);
    });

    // Sort all listings by price
    allListings.sort((a, b) => {
      const priceA = a.price_total || (a.price_per_night ? a.price_per_night * nightsCount : Infinity);
      const priceB = b.price_total || (b.price_per_night ? b.price_per_night * nightsCount : Infinity);
      return priceA - priceB;
    });

    console.log(`[scrape-prices] ✅ Total: ${allListings.length} listings from ${portalKeys.length} portals`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results: allListings,
        results_by_platform: resultsByPlatform,
        manual,
        analysis_type: 'tourist',
        search_params: { location, check_in: checkIn, check_out: checkOut, guests, platforms },
        total_listings: allListings.length,
        citations: allCitations,
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
