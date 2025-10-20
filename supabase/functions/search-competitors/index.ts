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

    // Haus-Daten laden
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('id, name, address, max_guests, bathrooms')
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
    
    const searchQuery = `
Finde Ferienhäuser und Ferienwohnungen in einem Umkreis von ${search_radius_km} km von "${house.address}".

Kriterien:
- Ähnliche Größe: ${house.max_guests} Gäste (±2 Gäste)
- Mit URLs zu Booking.com, Airbnb, VRBO oder FeWo-direkt
- Aktuelle Preise wenn möglich (pro Nacht)
- Entfernung vom Ausgangsort

Gib eine JSON-Array zurück mit folgendem Format:
[
  {
    "property_name": "Name des Objekts",
    "competitor_name": "Besitzer/Verwalter",
    "address": "Vollständige Adresse",
    "platform": "booking.com/airbnb/vrbo/fewo-direkt/other",
    "property_url": "https://...",
    "distance_km": 3.5,
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "estimated_price": 150,
    "amenities": ["WiFi", "Sauna", "Parkplatz"]
  }
]

Finde mindestens 3-5 vergleichbare Objekte.
    `;

    console.log('[search-competitors] Calling Perplexity API...');

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
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
      throw new Error(`Perplexity API Fehler: ${perplexityResponse.status}`);
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

    console.log(`[search-competitors] Found ${competitors.length} competitors`);

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
