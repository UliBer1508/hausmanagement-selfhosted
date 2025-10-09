import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Chat request received:', { messageCount: messages.length, context });

    // System prompt with context about the application
    const systemPrompt = `Du bist ein hilfreicher AI-Assistent für eine Ferienhaus-Verwaltungssoftware. 
Du hilfst bei:
- Buchungsverwaltung (suchen, anzeigen, Status ändern)
- Reinigungsaufträgen (erstellen, planen)
- Hausverwaltung (Details anzeigen)

Aktuelle Seite: ${context?.page || 'unknown'}

Antworte immer auf Deutsch, sei präzise und freundlich. Wenn du Aktionen ausführst, erkläre was du tust.

Verfügbare Tools:
- search_bookings: Sucht Buchungen nach Kriterien
- get_booking_details: Zeigt Details einer Buchung
- update_booking_status: Ändert Buchungsstatus (cancelled, confirmed, checked_in, completed)
- create_cleaning_task: Erstellt Reinigungsauftrag
- search_houses: Sucht Häuser
- get_house_details: Zeigt Hausdetails`;

    // Define available tools
    const tools = [
      {
        type: "function",
        function: {
          name: "search_bookings",
          description: "Sucht Buchungen nach verschiedenen Kriterien wie Gastname, Status, Haus-ID oder Datumsbereich",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "Name des Gastes (Teilstring-Suche)" },
              status: { type: "string", enum: ["confirmed", "checked_in", "completed", "cancelled"], description: "Buchungsstatus" },
              house_id: { type: "string", description: "UUID des Hauses" },
              date_from: { type: "string", description: "Startdatum (ISO 8601)" },
              date_to: { type: "string", description: "Enddatum (ISO 8601)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_booking_details",
          description: "Ruft detaillierte Informationen zu einer spezifischen Buchung ab",
          parameters: {
            type: "object",
            properties: {
              booking_id: { type: "string", description: "UUID der Buchung" }
            },
            required: ["booking_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_booking_status",
          description: "Ändert den Status einer Buchung. WICHTIG: Frage immer nach Bestätigung bevor du diese Aktion ausführst!",
          parameters: {
            type: "object",
            properties: {
              booking_id: { type: "string", description: "UUID der Buchung" },
              new_status: { type: "string", enum: ["cancelled", "confirmed", "checked_in", "completed"], description: "Neuer Status" },
              reason: { type: "string", description: "Grund für Statusänderung (optional)" }
            },
            required: ["booking_id", "new_status"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_cleaning_task",
          description: "Erstellt einen neuen Reinigungsauftrag für ein Haus",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              booking_id: { type: "string", description: "UUID der zugehörigen Buchung (optional)" },
              scheduled_date: { type: "string", description: "Geplantes Datum (ISO 8601)" },
              scheduled_time: { type: "string", description: "Geplante Uhrzeit (HH:MM)" },
              notes: { type: "string", description: "Notizen für Reinigungskraft" }
            },
            required: ["house_id", "scheduled_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_houses",
          description: "Sucht Häuser nach Name oder Adresse",
          parameters: {
            type: "object",
            properties: {
              search_term: { type: "string", description: "Suchbegriff für Name oder Adresse" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_house_details",
          description: "Ruft detaillierte Informationen zu einem Haus ab",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" }
            },
            required: ["house_id"]
          }
        }
      }
    ];

    // Call Lovable AI Gateway
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Lovable AI Credits aufgebraucht. Bitte Credits aufladen.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    // Stream the response back to client
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat assistant error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
