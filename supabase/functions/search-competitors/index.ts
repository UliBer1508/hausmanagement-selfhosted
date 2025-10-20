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
    const { house_id, search_radius_km = 10 } = await req.json();
    
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

    const searchQuery = `
Finde AUSSCHLIESSLICH PREMIUM-CHALETS und FERIENHÄUSER mit HOHEN BEWERTUNGEN in einem Umkreis von ${search_radius_km} km von "${house.address}".

🚫 AUSSCHLUSSKRITERIEN:
- Ferienwohnungen, Apartments, Studios
- Objekte unter 120€/Nacht
- Bewertungen unter 8.5/10 (Booking) bzw. 4.2/5 (Airbnb)
- Weniger als 10 Bewertungen
- Objekte ohne Sauna/Wellness
- Nur 1 Badezimmer

✅ PREMIUM-KRITERIEN (ALLE PFLICHT):
- Objekttyp: Freistehende Chalets oder Ferienhäuser
- Wohnfläche: ${house.living_area_sqm || 130} qm (±30 qm, mind. 100 qm)
- Mindestpreis: 120€/Nacht
- Badezimmer: Mind. ${house.bathrooms || 2}
- Schlafzimmer: ${house.bedrooms || 3} (±1)
- Gäste: ${house.max_guests} (±2)

🌟 BEWERTUNGS-ANFORDERUNGEN (SEHR WICHTIG):
- Booking.com: Mindestens 8.5/10 (ausgezeichnet)
- Airbnb: Mindestens 4.2/5 Sterne
- VRBO/FeWo-direkt: Mindestens 4.5/5
- Anzahl Bewertungen: Mindestens 10 Reviews
- Nur verifizierte Premium-Objekte mit konsistent hohen Bewertungen

PREMIUM-AUSSTATTUNG (mind. 3 PFLICHT):
${amenityFilters.join('\n')}
- Sauna oder Wellness-Bereich
- Kamin oder Ofen
- Hochwertige Küche
- Parkplatz/Garage
- Terrasse mit Bergblick

PLATTFORMEN (Priorisierung):
1. Booking.com → Filter: "Chalets", Bewertung ≥8.5, "Hervorragend"
2. Airbnb → Filter: "Entire home", Bewertung ≥4.2, "Superhost" bevorzugt
3. VRBO → Premium-Kategorie, Bewertung ≥4.5

PREISANGABEN:
- Basispreis pro Nacht (OHNE Zusatzkosten)
- Bei Preisspanne: Durchschnittspreis

JSON-Format (3-5 PREMIUM-Objekte):
[
  {
    "property_name": "Luxus Chalet Bergkristall",
    "competitor_name": "Alpin Lodges GmbH",
    "address": "Bergstraße 12, 5632 Neukirchen",
    "platform": "booking.com",
    "property_url": "https://...",
    "distance_km": 3.5,
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "property_type": "Chalet",
    "living_area_sqm": 140,
    "estimated_price": 180,
    "rating": 9.2,
    "review_count": 156,
    "amenities": ["Sauna", "Kamin", "Terrasse", "Gletscherblick", "Garage"]
  }
]

NUR Premium-Chalets mit HOHEN BEWERTUNGEN (≥8.5/10 bzw. ≥4.2/5) und mind. 10 Reviews!
    `;

    console.log('[search-competitors] Calling Perplexity API with model: sonar');

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
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
            content: 'Du bist ein Experte für Ferienhaus-Marktanalysen. Antworte NUR mit validen JSON-Arrays. Keine zusätzlichen Erklärungen.' 
          },
          { role: 'user', content: searchQuery }
        ],
        temperature: 0.2,
        max_tokens: 2000,
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

    // Qualitäts-Filter mit Bewertungen
    competitors = competitors
      .map(comp => ({
        ...comp,
        normalized_rating: normalizeRating(comp.rating, comp.platform || '')
      }))
      .filter(comp => {
        // 1. PREIS-FILTER: Mind. 120€
        if (comp.estimated_price && comp.estimated_price < 120) {
          console.log(`[filter] ❌ ${comp.property_name}: Preis zu niedrig (${comp.estimated_price}€)`);
          return false;
        }
        
        // 2. OBJEKTTYP-FILTER
        const allowedTypes = ['chalet', 'ferienhaus', 'berghütte', 'lodge'];
        const propertyType = (comp.property_type || '').toLowerCase();
        if (!allowedTypes.some(type => propertyType.includes(type))) {
          console.log(`[filter] ❌ ${comp.property_name}: Falscher Objekttyp (${comp.property_type})`);
          return false;
        }
        
        // 3. BEWERTUNGS-FILTER: Mind. 8.5/10 (normalisiert)
        if (!comp.rating || !comp.normalized_rating || comp.normalized_rating < 8.5) {
          console.log(`[filter] ❌ ${comp.property_name}: Bewertung zu niedrig (${comp.rating}, normalisiert: ${comp.normalized_rating})`);
          return false;
        }
        
        // 4. REVIEW-COUNT-FILTER: Mind. 10 Bewertungen
        if (!comp.review_count || comp.review_count < 10) {
          console.log(`[filter] ❌ ${comp.property_name}: Zu wenige Bewertungen (${comp.review_count})`);
          return false;
        }
        
        // 5. BADEZIMMER-FILTER: Mind. 2
        if (comp.bathrooms && comp.bathrooms < 2) {
          console.log(`[filter] ❌ ${comp.property_name}: Nur ${comp.bathrooms} Badezimmer`);
          return false;
        }
        
        // 6. WOHNFLÄCHE-FILTER: Mind. 100 qm (falls vorhanden)
        if (comp.living_area_sqm && comp.living_area_sqm < 100) {
          console.log(`[filter] ❌ ${comp.property_name}: Zu klein (${comp.living_area_sqm} qm)`);
          return false;
        }
        
        console.log(`[filter] ✅ ${comp.property_name}: Alle Kriterien erfüllt (Rating: ${comp.normalized_rating}/10, Reviews: ${comp.review_count})`);
        return true;
      });

    console.log(`[search-competitors] ${competitors.length} Premium-Chalets nach Qualitäts-Filter`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        house: house,
        competitors: competitors,
        search_params: { 
          radius_km: search_radius_km,
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
