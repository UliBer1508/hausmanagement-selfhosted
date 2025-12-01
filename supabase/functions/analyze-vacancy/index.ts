import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vacancy, houseId } = await req.json();
    
    if (!vacancy || !houseId) {
      throw new Error('vacancy and houseId are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load house information
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('name, address')
      .eq('id', houseId)
      .single();

    if (houseError) throw houseError;

    // Load historical bookings for this house
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('house_id', houseId)
      .eq('status', 'confirmed')
      .order('check_in', { ascending: false })
      .limit(50);

    if (bookingsError) throw bookingsError;

    // Calculate monthly statistics
    const monthlyStats = bookings.reduce((acc, booking) => {
      const month = new Date(booking.check_in).getMonth();
      if (!acc[month]) {
        acc[month] = { count: 0, totalRevenue: 0, nationalities: {} };
      }
      acc[month].count++;
      acc[month].totalRevenue += booking.booking_amount || 0;
      
      const nat = booking.nationality || 'unknown';
      acc[month].nationalities[nat] = (acc[month].nationalities[nat] || 0) + 1;
      
      return acc;
    }, {} as Record<number, any>);

    // Get current date
    const currentDate = new Date().toISOString().split('T')[0];
    const vacancyMonth = new Date(vacancy.start).getMonth();
    const monthName = new Date(vacancy.start).toLocaleString('de-DE', { month: 'long' });

    // Prepare context for AI
    const context = {
      house: {
        name: house.name,
        address: house.address,
      },
      vacancy: {
        start: vacancy.start,
        end: vacancy.end,
        days: vacancy.days,
        month: monthName,
      },
      currentDate,
      leadTimeDays: Math.floor((new Date(vacancy.start).getTime() - new Date(currentDate).getTime()) / (1000 * 60 * 60 * 24)),
      historicalData: {
        totalBookings: bookings.length,
        monthlyStats: monthlyStats[vacancyMonth] || { count: 0, totalRevenue: 0, nationalities: {} },
        recentBookings: bookings.slice(0, 5).map(b => ({
          checkIn: b.check_in,
          checkOut: b.check_out,
          guests: b.number_of_guests,
          amount: b.booking_amount,
          nationality: b.nationality,
          platform: b.platform,
        })),
      },
    };

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Du bist ein KI-Assistent für Ferienhaus-Vermietung in der österreichischen Ski-Region. 
            
Deine Aufgabe: Analysiere freie Zeiträume (Lücken) und gib konkrete, priorisierte Handlungsempfehlungen.

KONTEXT:
- Region: Österreichische Alpen (Ski-Resort)
- Hauptgäste: Niederländer und Belgier
- Hochsaison: Dezember-März (Ski), Juli-August (Sommer)
- Nebensaison: April-Juni, September-November

ANALYSE-KRITERIEN:
1. Lead-Time: Je näher der Termin, desto dringender
2. Saisonalität: Hochsaison = höhere Wahrscheinlichkeit
3. Historische Daten: Monatliche Buchungsraten und Preise
4. Aktuelle Trends: Letzte Buchungen als Indikator

AUSGABE: Nutze das bereitgestellte Tool für strukturierte Antworten mit:
- Buchungswahrscheinlichkeit (0-100%)
- Empfohlener Preisspanne
- Natürlichsprachliche Begründung
- 3-5 konkrete, priorisierte Maßnahmen
- Dringlichkeitsstufe (niedrig/mittel/hoch/kritisch)
- Deadline bis wann gehandelt werden sollte`
          },
          {
            role: 'user',
            content: `Analysiere diese Buchungslücke:\n\n${JSON.stringify(context, null, 2)}\n\nGib eine fundierte Empfehlung basierend auf den historischen Daten.`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'provide_vacancy_analysis',
              description: 'Liefert eine strukturierte Analyse der Buchungslücke mit Wahrscheinlichkeit, Preisempfehlung und konkreten Maßnahmen',
              parameters: {
                type: 'object',
                properties: {
                  bookingProbability: {
                    type: 'number',
                    description: 'Wahrscheinlichkeit einer Buchung in Prozent (0-100)',
                  },
                  suggestedPriceMin: {
                    type: 'number',
                    description: 'Empfohlener Mindestpreis in EUR',
                  },
                  suggestedPriceMax: {
                    type: 'number',
                    description: 'Empfohlener Maximalpreis in EUR',
                  },
                  reasoning: {
                    type: 'string',
                    description: 'Ausführliche natürlichsprachliche Begründung der Analyse (2-4 Sätze)',
                  },
                  actions: {
                    type: 'array',
                    description: 'Liste von 3-5 konkreten, priorisierten Maßnahmen',
                    items: {
                      type: 'object',
                      properties: {
                        priority: {
                          type: 'number',
                          description: 'Priorität (1 = höchste)',
                        },
                        action: {
                          type: 'string',
                          description: 'Konkrete Handlungsempfehlung',
                        },
                        reason: {
                          type: 'string',
                          description: 'Kurze Begründung warum diese Maßnahme wichtig ist',
                        },
                      },
                      required: ['priority', 'action', 'reason'],
                    },
                  },
                  urgency: {
                    type: 'string',
                    enum: ['niedrig', 'mittel', 'hoch', 'kritisch'],
                    description: 'Dringlichkeitsstufe',
                  },
                  deadline: {
                    type: 'string',
                    description: 'Empfohlene Deadline im Format YYYY-MM-DD',
                  },
                },
                required: ['bookingProbability', 'suggestedPriceMin', 'suggestedPriceMax', 'reasoning', 'actions', 'urgency', 'deadline'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'provide_vacancy_analysis' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Insufficient credits. Please add funds to your Lovable AI workspace.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));

    // Extract tool call result
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      success: true,
      analysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-vacancy:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
