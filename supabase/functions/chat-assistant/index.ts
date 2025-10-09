import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with service role key for full access
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

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

    // System prompt - CRITICAL: Force tool usage
    const systemPrompt = `Du bist ein Datenbank-Assistent für eine Ferienhaus-Verwaltungssoftware.

🔴 ABSOLUTE REGEL: Du darfst NIEMALS ohne Tool-Call antworten! 🔴

WORKFLOW FÜR JEDE ANFRAGE:
1. Analysiere die User-Frage
2. Identifiziere das passende Tool
3. Rufe das Tool auf mit den richtigen Parametern
4. Warte auf das Ergebnis
5. Formuliere eine KLARE, STRUKTURIERTE Antwort basierend auf dem Tool-Ergebnis

WICHTIG: Zeige IMMER alle gefundenen Daten an, auch wenn der Status "cancelled" ist!

ANTWORT-FORMATE:

**Buchungen:**
- Beginne mit einer klaren Zusammenfassung (z.B. "Ich habe 1 Buchung gefunden:")
- Liste alle relevanten Details auf:
  • Gast: [Name]
  • Check-in: [Datum]
  • Check-out: [Datum]
  • Anzahl Gäste: [Zahl]
  • Status: [Status] ⚠️ (IMMER anzeigen, auch bei "storniert"!)
  • Haus: [Hausname]
  • Betrag: [Betrag]
- Wenn Status "cancelled": Weise explizit darauf hin!

**Reinigungsaufträge:**
"Ich habe [Anzahl] Reinigungsauftrag/-aufträge gefunden:

• Haus: [house_name]
• Datum: [scheduled_date] um [scheduled_time] Uhr
• Status: [status mit Icon: scheduled=📅, in_progress=🧹, completed=✅, cancelled=❌]
• Buchung: [guest_name] (falls vorhanden)
• Notizen: [notes]"

TOOLS - WANN VERWENDEN:
• "buchung" / "booking" / "reservierung" / Name eines Gastes → search_bookings
• "reinigung" / "cleaning" / "putzen" / Name eines Gastes → search_cleaning_tasks
• "haus" / "house" / "chalet" in der Frage → search_houses
• Spezifische ID genannt → get_booking_details / get_house_details / get_cleaning_task_details
• "erstelle reinigung" → create_cleaning_task
• "ändere status" → update_booking_status (ERST bestätigen lassen!)

BEISPIEL:
User: "Zeige mir die Buchung von Lukas Frankenhauser"
✅ Tool-Call: search_bookings({"guest_name": "Lukas Frankenhauser"})
✅ Antwort: "Ich habe 1 Buchung gefunden:
• Gast: Lukas Frankenhauser
• Check-in: 27.12.2025
• Check-out: 03.01.2026  
• Gäste: 6
• Status: ⚠️ STORNIERT
• Haus: Wald Chalet
• Betrag: 3.650,00 EUR

Hinweis: Diese Buchung wurde storniert."

Aktuelle Seite: ${context?.page || 'unknown'}
HEUTE ist: 2025-10-09

Du antwortest auf Deutsch. ABER: Du MUSST ZUERST die Tools aufrufen!`;

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
      },
      {
        type: "function",
        function: {
          name: "search_cleaning_tasks",
          description: "Sucht Reinigungsaufträge nach Kriterien wie Haus, Buchung, Status, Datum oder Personal",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              booking_id: { type: "string", description: "UUID der Buchung" },
              guest_name: { type: "string", description: "Name des Gastes (sucht über Buchung)" },
              status: { 
                type: "string", 
                enum: ["scheduled", "in_progress", "completed", "cancelled", "delayed"],
                description: "Status" 
              },
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_cleaning_task_details",
          description: "Details zu einem spezifischen Reinigungsauftrag",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID des Tasks" }
            },
            required: ["task_id"]
          }
        }
      }
    ];

    // Tool execution functions
    async function executeSearchBookings(params: any) {
      console.log('Executing search_bookings with params:', params);
      
      let query = supabase
        .from('bookings')
        .select('*, houses(name, address)');

      if (params.guest_name) {
        query = query.ilike('guest_name', `%${params.guest_name}%`);
      }
      if (params.status) {
        query = query.eq('status', params.status);
      }
      if (params.house_id) {
        query = query.eq('house_id', params.house_id);
      }
      if (params.date_from) {
        query = query.gte('check_in', params.date_from);
      }
      if (params.date_to) {
        query = query.lte('check_out', params.date_to);
      }

      const { data, error } = await query.order('check_in', { ascending: true });

      if (error) {
        console.error('Error searching bookings:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data.length} bookings`);
      return { success: true, bookings: data, count: data.length };
    }

    async function executeGetBookingDetails(booking_id: string) {
      console.log('Executing get_booking_details for:', booking_id);
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*, houses(name, address, max_guests)')
        .eq('id', booking_id)
        .single();

      if (error) {
        console.error('Error getting booking details:', error);
        return { success: false, error: error.message };
      }

      return { success: true, booking: data };
    }

    async function executeUpdateBookingStatus(booking_id: string, new_status: string, reason?: string) {
      console.log('Executing update_booking_status:', { booking_id, new_status, reason });
      
      const updateData: any = { status: new_status };
      if (reason) {
        updateData.notes = reason;
      }

      const { data, error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', booking_id)
        .select()
        .single();

      if (error) {
        console.error('Error updating booking status:', error);
        return { success: false, error: error.message };
      }

      return { success: true, booking: data, message: `Status erfolgreich auf '${new_status}' geändert` };
    }

    async function executeCreateCleaningTask(params: any) {
      console.log('Executing create_cleaning_task with params:', params);
      
      const taskData: any = {
        house_id: params.house_id,
        service_type: 'cleaning',
        scheduled_date: params.scheduled_date,
        scheduled_time: params.scheduled_time || '10:00',
        status: 'scheduled',
      };

      if (params.booking_id) {
        taskData.booking_id = params.booking_id;
      }
      if (params.notes) {
        taskData.notes = params.notes;
      }

      const { data, error } = await supabase
        .from('service_tasks')
        .insert([taskData])
        .select()
        .single();

      if (error) {
        console.error('Error creating cleaning task:', error);
        return { success: false, error: error.message };
      }

      return { success: true, task: data, message: 'Reinigungsauftrag erfolgreich erstellt' };
    }

    async function executeSearchHouses(search_term?: string) {
      console.log('Executing search_houses with term:', search_term);
      
      let query = supabase
        .from('houses')
        .select('*');

      if (search_term) {
        query = query.or(`name.ilike.%${search_term}%,address.ilike.%${search_term}%`);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        console.error('Error searching houses:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data.length} houses`);
      return { success: true, houses: data, count: data.length };
    }

    async function executeGetHouseDetails(house_id: string) {
      console.log('Executing get_house_details for:', house_id);
      
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('id', house_id)
        .single();

      if (error) {
        console.error('Error getting house details:', error);
        return { success: false, error: error.message };
      }

      return { success: true, house: data };
    }

    async function executeSearchCleaningTasks(params: any) {
      console.log('Executing search_cleaning_tasks with params:', params);
      
      let query = supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (name, address),
          bookings:booking_id (guest_name, check_in, check_out)
        `)
        .eq('service_type', 'cleaning');

      // Wenn nach guest_name gesucht wird, erst die Buchung finden
      if (params.guest_name) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .ilike('guest_name', `%${params.guest_name}%`);
        
        if (bookings && bookings.length > 0) {
          const bookingIds = bookings.map(b => b.id);
          query = query.in('booking_id', bookingIds);
        } else {
          return { success: true, tasks: [], count: 0, message: 'Keine Buchung für diesen Gast gefunden' };
        }
      }

      if (params.house_id) query = query.eq('house_id', params.house_id);
      if (params.booking_id) query = query.eq('booking_id', params.booking_id);
      if (params.status) query = query.eq('status', params.status);
      if (params.date_from) query = query.gte('scheduled_date', params.date_from);
      if (params.date_to) query = query.lte('scheduled_date', params.date_to);

      const { data, error } = await query.order('scheduled_date', { ascending: true });
      
      if (error) {
        console.error('Error searching cleaning tasks:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data.length} cleaning tasks`);
      return { success: true, tasks: data, count: data.length };
    }

    async function executeGetCleaningTaskDetails(task_id: string) {
      console.log('Executing get_cleaning_task_details for:', task_id);
      
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (*),
          bookings:booking_id (*)
        `)
        .eq('id', task_id)
        .single();

      if (error) {
        console.error('Error getting cleaning task details:', error);
        return { success: false, error: error.message };
      }

      return { success: true, task: data };
    }

    // Tool router
    async function executeTool(toolName: string, args: any) {
      try {
        switch (toolName) {
          case 'search_bookings':
            return await executeSearchBookings(args);
          case 'get_booking_details':
            return await executeGetBookingDetails(args.booking_id);
          case 'update_booking_status':
            return await executeUpdateBookingStatus(args.booking_id, args.new_status, args.reason);
          case 'create_cleaning_task':
            return await executeCreateCleaningTask(args);
          case 'search_houses':
            return await executeSearchHouses(args.search_term);
          case 'get_house_details':
            return await executeGetHouseDetails(args.house_id);
          case 'search_cleaning_tasks':
            return await executeSearchCleaningTasks(args);
          case 'get_cleaning_task_details':
            return await executeGetCleaningTaskDetails(args.task_id);
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }

    // Build conversation messages
    let conversationMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Tool-calling loop
    const MAX_ITERATIONS = 5;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`Tool-calling iteration ${iteration}`);

      // Call AI without streaming to check for tool calls
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: conversationMessages,
        tools,
        stream: false,
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

      const data = await response.json();
      const choice = data.choices[0];
      const assistantMessage = choice.message;

      console.log('AI response:', { 
        finish_reason: choice.finish_reason,
        has_tool_calls: !!assistantMessage.tool_calls,
        tool_count: assistantMessage.tool_calls?.length || 0
      });

      // Add assistant message to conversation
      conversationMessages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls || null
      });

      // Check if AI wants to use tools
      if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls) {
        console.log('Processing tool calls:', assistantMessage.tool_calls.map((tc: any) => tc.function.name));
        
        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`Executing tool: ${toolName}`, toolArgs);
          const result = await executeTool(toolName, toolArgs);
          console.log(`Tool result for ${toolName}:`, result);
          
          // Add tool result to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }
        
        // Continue loop to get AI's response to tool results
        continue;
      }

      // No more tool calls, break the loop
      console.log('No more tool calls, preparing final response');
      
      // Extrahiere Tool-Results und formatiere sie in einer User-Message
      const toolResults: any[] = [];
      const messagesForFinal = conversationMessages.filter(msg => {
        if (msg.role === 'tool') {
          try {
            toolResults.push(JSON.parse(msg.content));
          } catch (e) {
            console.error('Failed to parse tool result:', e);
          }
          return false; // Entferne tool messages
        }
        if (msg.role === 'assistant' && msg.tool_calls) {
          return false; // Entferne assistant messages mit tool_calls
        }
        return true;
      });
      
      // Formatiere Tool-Results als lesbaren Text + Entity-Links
      let resultsText = 'Hier sind die Ergebnisse der Suche:\n\n';
      const entityLinks: Array<{id: string, type: string, label: string}> = [];
      
      toolResults.forEach(result => {
        if (result.bookings && Array.isArray(result.bookings)) {
          resultsText += `Gefundene Buchungen (${result.count}):\n`;
          result.bookings.forEach((b: any, i: number) => {
            resultsText += `\nBuchung ${i + 1}:\n`;
            resultsText += `- Gast: ${b.guest_name}\n`;
            resultsText += `- Check-in: ${new Date(b.check_in).toLocaleString('de-DE')}\n`;
            resultsText += `- Check-out: ${new Date(b.check_out).toLocaleString('de-DE')}\n`;
            resultsText += `- Gäste: ${b.number_of_guests}\n`;
            resultsText += `- Status: ${b.status}\n`;
            if (b.houses?.name) resultsText += `- Haus: ${b.houses.name}\n`;
            if (b.booking_amount) resultsText += `- Betrag: ${b.booking_amount} ${b.currency || 'EUR'}\n`;
            
            // Entity-Link hinzufügen
            entityLinks.push({
              id: b.id,
              type: 'booking',
              label: `${b.guest_name} (${new Date(b.check_in).toLocaleDateString('de-DE')})`
            });
          });
        }
        
        if (result.houses && Array.isArray(result.houses)) {
          resultsText += `\n\nGefundene Häuser (${result.count}):\n`;
          result.houses.forEach((h: any, i: number) => {
            resultsText += `\nHaus ${i + 1}:\n`;
            resultsText += `- Name: ${h.name}\n`;
            resultsText += `- Adresse: ${h.address}\n`;
            resultsText += `- Max. Gäste: ${h.max_guests}\n`;
            
            entityLinks.push({
              id: h.id,
              type: 'house',
              label: h.name
            });
          });
        }

        if (result.tasks && Array.isArray(result.tasks)) {
          resultsText += `\n\nGefundene Reinigungsaufträge (${result.count}):\n`;
          result.tasks.forEach((t: any, i: number) => {
            resultsText += `\nReinigungsauftrag ${i + 1}:\n`;
            resultsText += `- Haus: ${t.houses?.name || 'Unbekannt'}\n`;
            resultsText += `- Datum: ${new Date(t.scheduled_date).toLocaleDateString('de-DE')}`;
            if (t.scheduled_time) resultsText += ` um ${t.scheduled_time}`;
            resultsText += `\n`;
            resultsText += `- Status: ${t.status}\n`;
            if (t.bookings?.guest_name) resultsText += `- Buchung: ${t.bookings.guest_name}\n`;
            if (t.notes) resultsText += `- Notizen: ${t.notes}\n`;
            
            entityLinks.push({
              id: t.id,
              type: 'cleaning_task',
              label: `${t.houses?.name || 'Reinigung'} (${new Date(t.scheduled_date).toLocaleDateString('de-DE')})`
            });
          });
        }

        if (result.message) {
          resultsText += `\n\n${result.message}\n`;
        }
      });
      
      resultsText += '\n\nBitte formatiere diese Informationen in einer klaren, strukturierten deutschen Antwort. Hebe den Status besonders hervor, wenn er "cancelled" ist!';
      
      // Füge Entity-Links als JSON-Marker am Ende hinzu
      if (entityLinks.length > 0) {
        resultsText += `\n\n___ENTITIES___\n${JSON.stringify(entityLinks)}`;
      }
      
      messagesForFinal.push({
        role: 'user',
        content: resultsText
      });
      
      conversationMessages = messagesForFinal;
      break;
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn('Max iterations reached in tool-calling loop');
    }

    // Now stream the final response
    console.log('Streaming final response to client');
    const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: conversationMessages,
        stream: true,
      }),
    });

    if (!finalResponse.ok) {
      throw new Error(`Final response error: ${finalResponse.status}`);
    }

    return new Response(finalResponse.body, {
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
