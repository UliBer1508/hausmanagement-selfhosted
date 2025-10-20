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
    const { 
      house_id, 
      search_radius_km = 10,
      min_rating = 7.5,
      platforms = ['booking.com', 'airbnb'],
      property_types = ['chalet', 'ferienhaus']
    } = await req.json();
    
    console.log(`[search-competitors] Searching for competitors: house_id=${house_id}, radius=${search_radius_km}km`);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Haus-Daten laden (inkl. neue Felder)
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('id, name, address, max_guests, bathrooms, bedrooms, living_area_sqm, amenities')
      .eq('id', house_id)
      .single();

    if (houseError) {
      console.error('[search-competitors] House not found:', houseError);
      throw new Error(`Haus nicht gefunden: ${houseError.message}`);
    }

    console.log(`[search-competitors] Found house: ${house.name}`);

    // Perplexity API für Wettbewerber-Suche
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');
    }
    
    // Ausstattungsmerkmale dynamisch aufbereiten
    const amenities = house.amenities || {};
    const amenityFilters: string[] = [];
    
    if (amenities.sauna) amenityFilters.push('- Sauna vorhanden (PFLICHT)');
    if (amenities.terrace) amenityFilters.push('- Terrasse oder Balkon');
    if (amenities.ski_cellar) amenityFilters.push('- Skikeller oder Skiaufbewahrung');
    if (amenities.garage_spaces) amenityFilters.push(`- Garage für mindestens ${amenities.garage_spaces} Fahrzeuge`);
    if (amenities.glacier_view) amenityFilters.push('- Panoramablick (Gletscher/Berge)');
    if (amenities.additional_toilet) amenityFilters.push('- Zusätzliche separate Toilette');

    console.log(`[search-competitors] Platforms: ${platforms.join(', ')}, Property Types: ${property_types.join(', ')}`);

    // Plattform-spezifische Suchanweisungen
    const platformInstructions = [];
    if (platforms.includes('booking.com')) {
      platformInstructions.push('1. Öffne Booking.com → Suche "Neukirchen am Großvenediger Chalet"');
    }
    if (platforms.includes('airbnb')) {
      platformInstructions.push(`${platformInstructions.length + 1}. Öffne Airbnb → Suche "Neukirchen Ferienhaus entire home"`);
    }

    // Objekttyp-String für Query
    const propertyTypeStr = property_types.map(t => {
      if (t === 'chalet') return 'Chalet';
      if (t === 'ferienhaus') return 'Ferienhaus';
      if (t === 'ferienwohnung') return 'Ferienwohnung';
      return t;
    }).join(' ODER ');

    // Plattform-spezifische Mindestbewertungen
    const ratingRequirements = [];
    if (platforms.includes('booking.com')) {
      ratingRequirements.push(`Booking.com: mindestens ${min_rating}/10`);
    }
    if (platforms.includes('airbnb')) {
      const airbnbRating = (min_rating / 2).toFixed(1); // 10-Punkte → 5-Sterne
      ratingRequirements.push(`Airbnb: mindestens ${airbnbRating}/5 Sterne`);
    }
    const ratingRequirementStr = ratingRequirements.join(' | ');

    const searchQuery = `
Suche auf ${platforms.map(p => p === 'booking.com' ? 'Booking.com' : 'Airbnb').join(' und ')} nach ECHTEN Ferienhäusern/Chalets in Neukirchen am Großvenediger, Österreich (Umkreis ${search_radius_km} km).

LOCATION: Neukirchen am Großvenediger, Bramberg, Krimml, Wald im Pinzgau (Nationalpark Hohe Tauern Region)
RADIUS: ${search_radius_km} km

SUCHAUFTRAG:
${platformInstructions.join('\n')}
${platformInstructions.length + 1}. Finde REALE, BUCHBARE Unterkünfte

KRITERIEN (FLEXIBEL - nicht alle müssen erfüllt sein):
- Objekttyp: ${propertyTypeStr} (auch ähnliche Typen OK)
- Ca. ${house.max_guests} Gäste (±3 akzeptabel)
- Ca. ${house.bedrooms || 3} Schlafzimmer (±2 OK)
- Bevorzugt ganze Unterkunft
- Mindestbewertung: ${ratingRequirementStr}
- Aktiv auf der Plattform

WICHTIG:
- Gib NUR ECHTE Objekte zurück, die du JETZT auf den Plattformen findest
- NUR Objekte mit den oben genannten Mindestbewertungen
- KEINE erfundenen oder Beispiel-Daten!
- KEINE erfundenen oder Beispiel-Daten!
- Falls KEINE Objekte gefunden: Gib leeres Array [] zurück

JSON-Format:
[
  {
    "property_name": "Echter Name von Booking.com",
    "competitor_name": "Vermieter-Name",
    "address": "Echte Adresse",
    "platform": "booking.com",
    "property_url": "https://www.booking.com/...",
    "distance_km": 2.5,
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "property_type": "Chalet",
    "estimated_price": 150,
    "rating": 8.9,
    "review_count": 45,
    "amenities": ["WiFi", "Sauna", "Parkplatz"]
  }
]

Falls KEINE Ergebnisse: []
    `;

    console.log('[search-competitors] Calling Perplexity API with model: sonar');

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { 
            role: 'system', 
            content: 'Du bist ein Experte für Ferienhaus-Marktanalysen. Durchsuche Booking.com und Airbnb nach verfügbaren Ferienhäusern und Chalets. Antworte mit einem JSON-Array. Gib mindestens 10-15 Objekte zurück wenn verfügbar.' 
          },
          { role: 'user', content: searchQuery }
        ],
        temperature: 0.3,
        max_tokens: 5000,
        search_domain_filter: platforms.flatMap(p => p === 'booking.com' ? ['booking.com'] : ['airbnb.com', 'airbnb.at']),
        return_images: false,
        return_related_questions: false
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('[search-competitors] Perplexity API error:', errorText);
      
      if (perplexityResponse.status === 429) {
        throw new Error('Perplexity API Rate-Limit erreicht. Bitte später erneut versuchen.');
      }
      if (perplexityResponse.status === 402) {
        throw new Error('Perplexity API: Keine Credits verfügbar. Bitte Lovable Workspace aufladen.');
      }
      if (perplexityResponse.status === 400) {
        throw new Error('Perplexity API: Ungültige Anfrage. Modell möglicherweise nicht verfügbar.');
      }
      throw new Error(`Perplexity API Fehler: ${perplexityResponse.status} - ${errorText}`);
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices[0].message.content;
    
    console.log('[search-competitors] Raw Perplexity response:', content);

    // Parse JSON (mit Fehlerbehandlung)
    let competitors = [];
    try {
      // Versuche direkt zu parsen
      competitors = JSON.parse(content);
    } catch (e) {
      // Falls Markdown-Code-Block, extrahiere JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        competitors = JSON.parse(jsonMatch[1]);
      } else {
        // Versuche nach [ oder { zu suchen
        const startIndex = content.indexOf('[') !== -1 ? content.indexOf('[') : content.indexOf('{');
        if (startIndex !== -1) {
          competitors = JSON.parse(content.substring(startIndex));
        } else {
          throw new Error('Konnte kein JSON in Perplexity-Antwort finden');
        }
      }
    }

    // Normalisiere das Array (falls einzelnes Objekt zurück kam)
    if (!Array.isArray(competitors)) {
      competitors = [competitors];
    }

    // Bewertungs-Normalisierung (plattformabhängig)
    function normalizeRating(rating: number | undefined, platform: string): number | null {
      if (!rating) return null;
      
      // Booking.com: 0-10 Skala (bereits normalisiert)
      if (platform.includes('booking')) return rating;
      
      // Airbnb, VRBO, FeWo: 0-5 Skala → 0-10 konvertieren
      if (platform.includes('airbnb') || platform.includes('vrbo') || platform.includes('fewo')) {
        return rating * 2;
      }
      
      // Default: Annahme 0-5 Skala
      return rating <= 5 ? rating * 2 : rating;
    }

    // Bewertungs-Normalisierung mit erweiterten Daten
    competitors = competitors.map(comp => ({
      ...comp,
      normalized_rating: normalizeRating(comp.rating, comp.platform || '')
    }));

    console.log(`[search-competitors] ${competitors.length} Wettbewerber von Perplexity erhalten`);
    console.log('[search-competitors] Objekte vor Filterung:', competitors.map(c => ({
      name: c.property_name,
      rating: c.rating,
      normalized: c.normalized_rating,
      type: c.property_type
    })));

    // Filter out obviously fake/example data, low ratings, and wrong property types
    const filteredCompetitors = competitors.filter(comp => {
      // Remove example entries
      if (comp.property_name?.toLowerCase().includes('beispiel')) {
        console.log(`[filter] ❌ ${comp.property_name}: Beispiel-Daten erkannt`);
        return false;
      }
      
      // Rating-Filter wird im Frontend gemacht - hier nur noch Logging
      if (comp.normalized_rating && comp.normalized_rating < min_rating) {
        console.log(`[filter] ⚠️ ${comp.property_name}: Bewertung ${comp.normalized_rating}/10 unter ${min_rating}/10, aber wird akzeptiert`);
      }
      
      // Lockererer Property-Type Filter mit Synonymen
      if (comp.property_type && property_types.length > 0) {
        const compType = comp.property_type.toLowerCase();
        const typeMatch = property_types.some(type => {
          const searchType = type.toLowerCase();
          
          // Lockerer Match: auch Teilstrings und Synonyme
          return compType.includes(searchType) || 
                 (searchType === 'ferienhaus' && (compType.includes('haus') || compType.includes('home'))) ||
                 (searchType === 'chalet' && compType.includes('lodge')) ||
                 (searchType === 'ferienwohnung' && (compType.includes('wohnung') || compType.includes('apartment')));
        });
        
        if (!typeMatch) {
          console.log(`[filter] ⚠️ ${comp.property_name}: Objekttyp "${comp.property_type}" nicht exakt in ${property_types.join(', ')}, aber wird akzeptiert`);
        }
      }
      
      console.log(`[filter] ✅ ${comp.property_name}: Akzeptiert (Bewertung: ${comp.normalized_rating}/10, Typ: ${comp.property_type})`);
      return true;
    });

    console.log(`[search-competitors] ${filteredCompetitors.length} Wettbewerber nach Filter`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        house: house,
        competitors: filteredCompetitors,
        search_params: { 
          radius_km: search_radius_km,
          min_rating: min_rating,
          platforms: platforms,
          property_types: property_types,
          location: house.address
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[search-competitors] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
