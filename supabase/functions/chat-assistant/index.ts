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

⛔ KRITISCHE REGEL ⛔
Du MUSST für JEDE Anfrage ein Tool verwenden! 
Du darfst NIEMALS direkt antworten ohne Tool-Call!
Antworte NIEMALS mit Text wie "ABSOLUTE REGEL" - nutze stattdessen die Tools!

WORKFLOW (ZWINGEND!):
1. User stellt Frage → DU MUSST SOFORT EIN TOOL AUFRUFEN
2. Du erhältst Tool-Ergebnis → DU DARFST JETZT antworten
3. Formatiere die Antwort basierend auf dem Tool-Ergebnis

🔍 TOOL-AUSWAHL (Wähle SOFORT das richtige Tool!):
- "buchung" / Gastname / "buchen" → search_bookings
- "reinigung" / "putzen" / "cleaning" → search_cleaning_tasks  
- "haus" / "chalet" / "objekt" → search_houses
- "gast" / "gäste" / "kunde" → search_guests
- "wäsche" / "bettwäsche" / "linen" / "bestellung" → search_linen_orders
- "wäschestatus" / "linen status" → get_linen_overview
- "wieviel wäsche" / "wäsche für [Hausname]" → ERST search_houses, DANN get_house_linen_status
- Bei get_house_linen_status: Priorisiere KI-Daten (confidence >= 60%, <7 Tage alt), sonst Fallback-Berechnung
- "übersicht" / "dashboard" / "statistik" → get_dashboard_stats
- "kalender" / "termine" / "events" → get_calendar_events
- UUID erwähnt → get_*_details Tools

BEISPIELE:
❌ FALSCH: "ABSOLUTE REGEL: Du darfst nicht..."
✅ RICHTIG: [Tool-Call: search_linen_orders mit house_id]

WICHTIG: Zeige ALLE gefundenen Daten, auch mit Status "cancelled"!

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

**Gäste:**
"Ich habe [Anzahl] Gast/Gäste gefunden:
• Name: [guest_name]
• Email: [guest_email]
• Telefon: [guest_phone]
• Nationalität: [nationality]
• Anzahl Buchungen: [booking_count]
• Letzte Buchung: [last_booking_date]"

**Wäschestatus für Haus:**
[Falls source === 'ai_optimization']
"🧺 Wäsche-Status für [Hausname]:
🤖 KI-ANALYSE (Konfidenz: [confidence_score]%)
Letzte Analyse: [last_analysis]

📦 AKTUELLER BESTAND:
• Bettbezüge: [stock] Stück (+ [ordered] bestellt)
• Große Handtücher: [stock] Stück (+ [ordered] bestellt)
... (für alle Wäsche-Typen)

📊 KI-EMPFOHLENER BESTAND:
• Bettbezüge: [recommended] Stück [✅ Erfüllt / ⚠️ [X] Stück unter Empfehlung]
• Große Handtücher: [recommended] Stück [Status]
... (für alle Wäsche-Typen)

📅 PROGNOSTIZIERTER BEDARF (KI-berechnet):
• Bettbezüge: [demand] Stück
• Große Handtücher: [demand] Stück
... (für alle Wäsche-Typen)

⚖️ BILANZ:
[Für jeden Item: ✅ Surplus / ⚠️ Knapp / ❌ Shortage anzeigen]

💡 KI-INSIGHTS:
[ai_insights als Bullet Points, falls vorhanden]

🛒 BESTELLVORSCHLAG:
[order_suggestion.items mit Mengen und Preisen]
Gesamt: [order_suggestion.total_cost] EUR
Priorität: [order_suggestion.priority]"

[Falls source === 'simple_calculation']
"🧺 Wäsche-Status für [Hausname]:
📊 EINFACHE BERECHNUNG
(Keine aktuellen KI-Daten verfügbar - Basierend auf kommenden Buchungen)

📦 AKTUELLER BESTAND:
• Bettbezüge: [stock] Stück (+ [ordered] bestellt)
• Große Handtücher: [stock] Stück (+ [ordered] bestellt)
... (für alle Wäsche-Typen)

📅 BEDARF (nächste 30 Tage):
[X] Buchungen geplant
• Bettbezüge benötigt: [demand] Stück
• Große Handtücher benötigt: [demand] Stück
... (für alle Wäsche-Typen)

⚖️ BILANZ:
✅ Ausreichend: [items mit surplus > 3]
⚠️ Knapp: [items mit surplus 0-3]
❌ KRITISCH: [items mit shortage] → [X] Stück fehlen!

💡 HINWEIS:
Für genauere Empfehlungen mit KI-Analyse führe eine Optimierung im Wäscheverwaltungs-Modul durch."

**Wäschestatus-Übersicht:**
"Wäsche-Übersicht:
🟢 [X] Häuser: Optimal versorgt
🟡 [Y] Häuser: Niedrige Bestände
🔴 [Z] Häuser: Kritische Bestände

Kritische Häuser:
• [Haus 1]: [kritische Items]
• [Haus 2]: [kritische Items]"

**Dashboard:**
"Übersicht:
🏠 Häuser: [Anzahl]
📅 Aktive Buchungen: [Anzahl]
🧹 Offene Aufgaben: [Anzahl]
💰 Umsatz: [Betrag]"

**Kalender:**
"Termine vom [von] bis [bis]:
📅 Check-ins: [Anzahl]
🧹 Reinigungen: [Anzahl]
🧺 Wäsche-Lieferungen: [Anzahl]

Details:
• [Datum] [Zeit]: [Event-Typ] - [Details]"

TOOLS - KRITISCHE REGELN:
1. Bei "reinigung von [Name]" → IMMER search_cleaning_tasks mit guest_name Parameter!
2. Bei nur einem Namen → ERST search_bookings, DANN bei Bedarf search_cleaning_tasks
3. Bei "haus" / "chalet" → search_houses
4. Bei "gast" / "gäste" → search_guests
5. Bei "wäsche" / "linen" → get_linen_overview
6. Bei "statistik" / "übersicht" → get_dashboard_stats
7. Bei "kalender" / "termine" → get_calendar_events
8. Bei UUID → entsprechendes get_*_details Tool

📋 BEISPIELE FÜR TOOL-CALLS:

Beispiel 1:
User: "Zeige mir die Reinigung von Lukas"
✅ Tool: search_cleaning_tasks({"guest_name": "Lukas"})
✅ Zeigt: Alle Reinigungsaufträge für Buchungen von Gästen mit "Lukas" im Namen

Beispiel 2:
User: "Zeige mir die Buchung von Lukas Frankenhauser"
✅ Tool: search_bookings({"guest_name": "Lukas Frankenhauser"})
✅ Zeigt: Buchungsdetails mit Status (auch wenn storniert!)

Beispiel 3:
User: "Welche Reinigungen sind heute geplant?"
✅ Tool: search_cleaning_tasks({"status": "scheduled", "date_from": "2025-10-09", "date_to": "2025-10-09"})

Beispiel 4:
User: "Zeige mir alle Gäste aus Deutschland"
✅ Tool: search_guests({"nationality": "Deutschland"})

Beispiel 5:
User: "Wie ist der Wäschestatus?"
✅ Tool: get_linen_overview()

Beispiel 6:
User: "Was passiert nächste Woche?"
✅ Tool: get_calendar_events({"date_from": "2025-10-13", "date_to": "2025-10-20"})

Beispiel 7:
User: "Welche Buchungen wurden heute geändert?"
✅ Tool: search_bookings({"updated_from": "2025-10-09T00:00:00Z", "updated_to": "2025-10-09T23:59:59Z"})

HEUTE ist: 2025-10-09
ZEITZONE: Europe/Berlin (UTC+2 Sommerzeit, UTC+1 Winterzeit)

WICHTIG für Datumsberechnungen:
- Wenn der User "heute", "gestern", "diese Woche" sagt, meint er IMMER deutsche Zeit (Europe/Berlin)
- Konvertiere relative Zeitangaben IMMER in UTC für Datenbankabfragen
- Berücksichtige die Zeitverschiebung: Im Oktober (Sommerzeit) ist Berlin UTC+2

Beispiel 8 (KORREKTE Zeitzone-Konvertierung):
User: "Welche Buchungen wurden gestern geändert?" (Heute ist 09.10.2025 in Deutschland)
"Gestern" = 08.10.2025 in deutscher Zeit
✅ Tool: search_bookings({
  "updated_from": "2025-10-07T22:00:00Z",  // 08.10. 00:00 Uhr Berlin = 07.10. 22:00 Uhr UTC
  "updated_to": "2025-10-08T21:59:59Z"     // 08.10. 23:59 Uhr Berlin = 08.10. 21:59 Uhr UTC
})

Beispiel 9 (Reinigungen nach Änderungsdatum):
User: "Welche Reinigungen wurden gestern geändert?" (Heute ist 09.10.2025 in Deutschland)
"Gestern" = 08.10.2025 in deutscher Zeit
✅ Tool: search_cleaning_tasks({
  "updated_from": "2025-10-07T22:00:00Z",  // 08.10. 00:00 Uhr Berlin = 07.10. 22:00 Uhr UTC
  "updated_to": "2025-10-08T21:59:59Z"     // 08.10. 23:59 Uhr Berlin = 08.10. 21:59 Uhr UTC
})

Beispiel 10 (Gäste nach Änderungsdatum):
User: "Welche Gäste wurden gestern geändert?" (Heute ist 09.10.2025 in Deutschland)
✅ Tool: search_guests({
  "updated_from": "2025-10-07T22:00:00Z",  // 08.10. 00:00 Uhr Berlin = 07.10. 22:00 Uhr UTC
  "updated_to": "2025-10-08T21:59:59Z"     // 08.10. 23:59 Uhr Berlin = 08.10. 21:59 Uhr UTC
})

Beispiel 11 (Wäschebestellungen nach Änderungsdatum):
User: "Welche Wäschebestellungen wurden gestern geändert?" (Heute ist 09.10.2025 in Deutschland)
✅ Tool: search_linen_orders({
  "updated_from": "2025-10-07T22:00:00Z",
  "updated_to": "2025-10-08T21:59:59Z"
})

Du antwortest auf Deutsch. WICHTIG: ERST Tools aufrufen, DANN antworten!`;

    // Define available tools
    const tools = [
      {
        type: "function",
        function: {
          name: "search_bookings",
          description: "Sucht Buchungen nach verschiedenen Kriterien wie Gastname, Status, Haus-ID, Datumsbereich oder Änderungsdatum",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "Name des Gastes (Teilstring-Suche)" },
              status: { type: "string", enum: ["confirmed", "checked_in", "completed", "cancelled"], description: "Buchungsstatus" },
              house_id: { type: "string", description: "UUID des Hauses" },
              date_from: { type: "string", description: "Startdatum für Check-in (ISO 8601)" },
              date_to: { type: "string", description: "Enddatum für Check-out (ISO 8601)" },
              updated_from: { type: "string", description: "Buchungen geändert ab diesem Zeitpunkt (ISO 8601)" },
              updated_to: { type: "string", description: "Buchungen geändert bis zu diesem Zeitpunkt (ISO 8601)" }
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
              date_from: { type: "string", description: "Von-Datum für geplantes Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum für geplantes Datum (ISO 8601)" },
              updated_from: { type: "string", description: "Von-Datum für Änderungsdatum (ISO 8601, UTC)" },
              updated_to: { type: "string", description: "Bis-Datum für Änderungsdatum (ISO 8601, UTC)" }
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
      },
      {
        type: "function",
        function: {
          name: "get_dashboard_stats",
          description: "Zeigt Übersichts-Statistiken: Anzahl Häuser, Buchungen, Tasks, Umsatz",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_guests",
          description: "Sucht Gäste nach Name, Email, Nationalität oder Buchungshistorie",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "Name des Gastes (Teilstring-Suche)" },
              guest_email: { type: "string", description: "Email des Gastes (Teilstring-Suche)" },
              nationality: { type: "string", description: "Nationalität (Teilstring-Suche)" },
              min_bookings: { type: "number", description: "Mindestanzahl Buchungen" },
              updated_from: { type: "string", description: "Gäste mit Buchungen geändert ab diesem Zeitpunkt (ISO 8601, UTC)" },
              updated_to: { type: "string", description: "Gäste mit Buchungen geändert bis zu diesem Zeitpunkt (ISO 8601, UTC)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_linen_overview",
          description: "Übersicht aller Häuser mit Wäschestatus (kritisch/niedrig/gut)",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_house_linen_status",
          description: "Zeigt intelligenten Wäschestatus inkl. KI-Empfehlungen (falls vorhanden) oder Echtzeit-Bedarfsberechnung für kommende Buchungen",
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
          name: "search_linen_orders",
          description: "Sucht Wäschebestellungen nach Kriterien",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "Name des Gastes (sucht in verknüpften Buchungen)" },
              house_id: { type: "string", description: "UUID des Hauses" },
              status: { type: "string", enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"], description: "Status" },
              date_from: { type: "string", description: "Von-Datum für Lieferdatum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum für Lieferdatum (ISO 8601)" },
              updated_from: { type: "string", description: "Von-Datum für Änderungsdatum (ISO 8601, UTC)" },
              updated_to: { type: "string", description: "Bis-Datum für Änderungsdatum (ISO 8601, UTC)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_calendar_events",
          description: "Zeigt alle Termine (Buchungen, Reinigungen) für einen Zeitraum",
          parameters: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" },
              event_types: { 
                type: "array", 
                items: { type: "string", enum: ["booking", "cleaning", "laundry"] },
                description: "Event-Typen (optional, default: alle)" 
              }
            },
            required: ["date_from", "date_to"]
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
      if (params.updated_from) {
        query = query.gte('updated_at', params.updated_from);
      }
      if (params.updated_to) {
        query = query.lte('updated_at', params.updated_to);
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
      if (params.updated_from) query = query.gte('updated_at', params.updated_from);
      if (params.updated_to) query = query.lte('updated_at', params.updated_to);

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

    async function executeGetDashboardStats() {
      console.log('Executing get_dashboard_stats');
      
      const [housesRes, bookingsRes, tasksRes] = await Promise.all([
        supabase.from('houses').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('service_tasks').select('*')
      ]);

      const stats = {
        totalHouses: housesRes.data?.length || 0,
        activeBookings: bookingsRes.data?.filter((b: any) => b.status === 'confirmed').length || 0,
        pendingTasks: tasksRes.data?.filter((t: any) => t.status === 'scheduled').length || 0,
        totalRevenue: bookingsRes.data?.reduce((sum: number, b: any) => sum + (b.booking_amount || 0), 0) || 0
      };

      console.log('Dashboard stats:', stats);
      return { success: true, stats };
    }

    async function executeSearchGuests(params: any) {
      console.log('Executing search_guests with params:', params);
      
      let query = supabase
        .from('bookings')
        .select('guest_name, guest_email, guest_phone, nationality, check_in, check_out, id')
        .not('guest_name', 'is', null);

      if (params.guest_name) {
        query = query.ilike('guest_name', `%${params.guest_name}%`);
      }
      if (params.guest_email) {
        query = query.ilike('guest_email', `%${params.guest_email}%`);
      }
      if (params.nationality) {
        query = query.ilike('nationality', `%${params.nationality}%`);
      }
      if (params.updated_from) {
        query = query.gte('updated_at', params.updated_from);
      }
      if (params.updated_to) {
        query = query.lte('updated_at', params.updated_to);
      }

      const { data, error } = await query.order('check_in', { ascending: false });
      
      if (error) {
        console.error('Error searching guests:', error);
        return { success: false, error: error.message };
      }

      // Gruppiere nach Gast (Name + Email)
      const guestMap = new Map();
      data?.forEach((booking: any) => {
        const key = `${booking.guest_name}-${booking.guest_email || 'no-email'}`;
        if (!guestMap.has(key)) {
          guestMap.set(key, {
            name: booking.guest_name,
            email: booking.guest_email,
            phone: booking.guest_phone,
            nationality: booking.nationality,
            bookings: [],
            lastBooking: booking.check_in
          });
        }
        guestMap.get(key).bookings.push({
          id: booking.id,
          check_in: booking.check_in,
          check_out: booking.check_out
        });
      });

      const guests = Array.from(guestMap.values())
        .map((g: any) => ({ 
          ...g, 
          bookingCount: g.bookings.length 
        }))
        .filter((g: any) => !params.min_bookings || g.bookingCount >= params.min_bookings);

      console.log(`Found ${guests.length} guests`);
      return { success: true, guests, count: guests.length };
    }

    async function executeGetLinenOverview() {
      console.log('Executing get_linen_overview');
      
      const { data: houses, error } = await supabase
        .from('houses')
        .select('id, name, address, linen_stock, linen_in_use, linen_dirty')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error getting linen overview:', error);
        return { success: false, error: error.message };
      }

      const overview = houses?.map((house: any) => {
        const stock = house.linen_stock || {};
        const inUse = house.linen_in_use || {};
        const dirty = house.linen_dirty || {};
        
        // Berechne verfügbaren Bestand
        const available: any = {};
        Object.keys(stock).forEach(key => {
          available[key] = (stock[key] || 0) - (inUse[key] || 0) - (dirty[key] || 0);
        });
        
        // Kritische Items identifizieren (< 5 verfügbar)
        const criticalItems = Object.keys(available).filter(key => available[key] < 5);
        
        const status = criticalItems.length > 2 ? 'critical' : 
                       criticalItems.length > 0 ? 'warning' : 'good';

        return {
          house_id: house.id,
          house_name: house.name,
          status,
          critical_items: criticalItems,
          available_stock: available,
          total_stock: Object.values(stock).reduce((sum: number, val: any) => sum + (val || 0), 0)
        };
      });

      const summary = {
        critical: overview?.filter((h: any) => h.status === 'critical').length || 0,
        warning: overview?.filter((h: any) => h.status === 'warning').length || 0,
        good: overview?.filter((h: any) => h.status === 'good').length || 0
      };

      console.log('Linen overview:', { summary, totalHouses: overview?.length });
      return { success: true, houses: overview, summary };
    }

    async function executeGetHouseLinenStatus(house_id: string) {
      console.log('Executing get_house_linen_status for:', house_id);
      
      // 1. Hausdaten laden
      const { data: house, error: houseError } = await supabase
        .from('houses')
        .select('id, name, address, linen_stock, linen_in_use, linen_dirty, linen_reserved, linen_in_cleaning, ordered_linen, max_guests')
        .eq('id', house_id)
        .single();

      if (houseError) {
        console.error('Error getting house linen status:', houseError);
        return { success: false, error: houseError.message };
      }

      // 2. KI-Optimierungsergebnisse abfragen (neueste innerhalb der letzten 7 Tage)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: aiOptimization } = await supabase
        .from('ai_optimization_results')
        .select('optimization_result, confidence_score, analysis_date, recommendations')
        .eq('house_id', house_id)
        .gte('analysis_date', sevenDaysAgo)
        .order('analysis_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('AI Optimization data:', { 
        found: !!aiOptimization, 
        confidence: aiOptimization?.confidence_score,
        date: aiOptimization?.analysis_date 
      });

      // 3. Entscheidung: KI-Daten oder Fallback?
      if (aiOptimization && aiOptimization.confidence_score >= 0.6) {
        // === OPTION A: KI-basierte Antwort ===
        return buildAIBasedResponse(house, aiOptimization);
      } else {
        // === OPTION B: Fallback auf einfache Berechnung ===
        return buildSimpleCalculationResponse(house, house_id);
      }
    }

    function buildAIBasedResponse(house: any, aiOptimization: any) {
      console.log('Building AI-based response');
      
      const result = aiOptimization.optimization_result;
      
      // Extrahiere Daten aus KI-Ergebnis
      const currentStock = result.current_stock || {};
      const upcomingDemand = result.upcoming_demand || {};
      const recommendedStock = result.recommended_stock || {};
      const orderSuggestion = result.order_suggestion || {};
      const aiInsights = result.ai_insights || [];
      const confidenceScore = aiOptimization.confidence_score;
      
      // Berechne Verfügbarkeit und Mangel
      const linenTypes = ['bedding', 'large_towels', 'small_towels', 'sauna_towels', 'bath_mats', 'sink_towels'];
      const availability: any = {};
      
      linenTypes.forEach(item => {
        const stock = currentStock[item] || 0;
        const ordered = (house.ordered_linen?.[item] || 0);
        const demand = upcomingDemand[item] || 0;
        const recommended = recommendedStock[item] || 0;
        const totalAvailable = stock + ordered;
        const shortage = Math.max(0, demand - totalAvailable);
        
        availability[item] = {
          stock,
          ordered,
          demand,
          recommended,
          total_available: totalAvailable,
          shortage,
          surplus: totalAvailable - demand,
          meets_recommendation: totalAvailable >= recommended
        };
      });
      
      return {
        success: true,
        source: 'ai_optimization',
        house: {
          id: house.id,
          name: house.name,
          address: house.address
        },
        availability: availability,
        order_suggestion: orderSuggestion,
        ai_insights: aiInsights,
        confidence_score: confidenceScore,
        last_analysis: aiOptimization.analysis_date,
        summary: `KI-basierte Analyse (Konfidenz: ${(confidenceScore * 100).toFixed(0)}%)`
      };
    }

    async function buildSimpleCalculationResponse(house: any, house_id: string) {
      console.log('Building simple calculation response (fallback)');
      
      // Wäsche-Definitionen laden
      const { data: definitions } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house_id)
        .maybeSingle();

      // Kommende Buchungen (nächste 30 Tage)
      const today = new Date().toISOString();
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, number_of_guests, status')
        .eq('house_id', house_id)
        .gte('check_in', today)
        .lte('check_in', in30Days)
        .neq('status', 'cancelled')
        .order('check_in', { ascending: true });

      // Bedarfsberechnung
      const linenTypes = ['bedding', 'large_towels', 'small_towels', 'sauna_towels', 'bath_mats', 'sink_towels'];
      const totalDemand: any = {};
      linenTypes.forEach(type => totalDemand[type] = 0);
      
      if (definitions && bookings && bookings.length > 0) {
        bookings.forEach(booking => {
          totalDemand.bedding += booking.number_of_guests * (definitions.bedding_per_guest || 0);
          totalDemand.large_towels += booking.number_of_guests * (definitions.large_towels_per_guest || 0);
          totalDemand.small_towels += booking.number_of_guests * (definitions.small_towels_per_guest || 0);
          totalDemand.sauna_towels += booking.number_of_guests * (definitions.sauna_towels_per_guest || 0);
          totalDemand.bath_mats += (definitions.bath_mats_per_booking || 0);
          totalDemand.sink_towels += (definitions.sink_towels_per_booking || 0);
        });
      }

      // Verfügbarkeit berechnen
      const availability: any = {};
      linenTypes.forEach(item => {
        const stock = (house.linen_stock?.[item] || 0);
        const ordered = (house.ordered_linen?.[item] || 0);
        const demand = totalDemand[item];
        const totalAvailable = stock + ordered;
        const shortage = Math.max(0, demand - totalAvailable);
        
        availability[item] = {
          stock,
          ordered,
          demand,
          total_available: totalAvailable,
          shortage,
          surplus: totalAvailable - demand
        };
      });

      return {
        success: true,
        source: 'simple_calculation',
        house: {
          id: house.id,
          name: house.name,
          address: house.address
        },
        definitions: definitions,
        upcoming_bookings: bookings || [],
        availability: availability,
        summary: `${bookings?.length || 0} Buchungen in den nächsten 30 Tagen (Einfache Berechnung)`
      };
    }

    async function executeSearchLinenOrders(params: any) {
      console.log('Executing search_linen_orders with params:', params);
      
      let query = supabase
        .from('linen_orders')
        .select('*, houses(name, address), service_providers:provider_id(name, service_type), bookings:booking_id(guest_name, check_in, check_out)');

      // Wenn nach guest_name gesucht wird, erst die Buchungen finden
      if (params.guest_name) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id')
          .ilike('guest_name', `%${params.guest_name}%`);
        
        if (bookings && bookings.length > 0) {
          const bookingIds = bookings.map(b => b.id);
          query = query.in('booking_id', bookingIds);
        } else {
          return { success: true, orders: [], count: 0, message: 'Keine Buchung für diesen Gast gefunden' };
        }
      }

      if (params.house_id) query = query.eq('house_id', params.house_id);
      if (params.status) query = query.eq('status', params.status);
      if (params.date_from) query = query.gte('delivery_date', params.date_from);
      if (params.date_to) query = query.lte('delivery_date', params.date_to);
      if (params.updated_from) query = query.gte('updated_at', params.updated_from);
      if (params.updated_to) query = query.lte('updated_at', params.updated_to);

      const { data, error } = await query.order('order_date', { ascending: false });

      if (error) {
        console.error('Error searching linen orders:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data?.length || 0} linen orders`);
      return { success: true, orders: data || [], count: data?.length || 0 };
    }

    async function executeGetCalendarEvents(params: any) {
      console.log('Executing get_calendar_events with params:', params);
      
      const eventTypes = params.event_types || ['booking', 'cleaning'];
      const events: any[] = [];

      if (eventTypes.includes('booking')) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('*, houses(name)')
          .gte('check_in', params.date_from)
          .lte('check_out', params.date_to)
          .order('check_in', { ascending: true });

        bookings?.forEach((b: any) => {
          events.push({
            type: 'booking',
            id: b.id,
            title: `Check-in: ${b.guest_name}`,
            date: b.check_in,
            house: b.houses?.name || 'Unbekannt',
            status: b.status,
            guest_name: b.guest_name
          });
        });
      }

      if (eventTypes.includes('cleaning')) {
        const { data: tasks } = await supabase
          .from('service_tasks')
          .select('*, houses(name)')
          .eq('service_type', 'cleaning')
          .gte('scheduled_date', params.date_from)
          .lte('scheduled_date', params.date_to)
          .order('scheduled_date', { ascending: true });

        tasks?.forEach((t: any) => {
          events.push({
            type: 'cleaning',
            id: t.id,
            title: `Reinigung: ${t.houses?.name || 'Unbekannt'}`,
            date: t.scheduled_date,
            time: t.scheduled_time,
            house: t.houses?.name || 'Unbekannt',
            status: t.status
          });
        });
      }

      if (eventTypes.includes('laundry')) {
        const { data: orders } = await supabase
          .from('linen_orders')
          .select('*, houses(name)')
          .gte('delivery_date', params.date_from)
          .lte('delivery_date', params.date_to)
          .order('delivery_date', { ascending: true });

        orders?.forEach((o: any) => {
          events.push({
            type: 'laundry',
            id: o.id,
            title: `Wäsche-Lieferung: ${o.houses?.name || 'Unbekannt'}`,
            date: o.delivery_date,
            house: o.houses?.name || 'Unbekannt',
            status: o.status
          });
        });
      }

      // Sortiere Events nach Datum
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log(`Found ${events.length} calendar events`);
      return { 
        success: true, 
        events,
        count: events.length,
        summary: {
          bookings: events.filter(e => e.type === 'booking').length,
          cleanings: events.filter(e => e.type === 'cleaning').length,
          laundry: events.filter(e => e.type === 'laundry').length
        }
      };
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
          case 'get_dashboard_stats':
            return await executeGetDashboardStats();
          case 'search_guests':
            return await executeSearchGuests(args);
          case 'get_linen_overview':
            return await executeGetLinenOverview();
          case 'get_house_linen_status':
            return await executeGetHouseLinenStatus(args.house_id);
          case 'search_linen_orders':
            return await executeSearchLinenOrders(args);
          case 'get_calendar_events':
            return await executeGetCalendarEvents(args);
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
    let entityLinks: Array<{id: string, type: string, label: string}> = []; // Entity-Links außerhalb der Schleife

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
        model: 'google/gemini-2.5-flash', // Flash statt Pro - viel schneller
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

      // CRITICAL: If AI tries to answer without using tools in first iteration, force tool usage
      if (iteration === 1 && choice.finish_reason === 'stop') {
        console.warn('AI tried to answer without tool call in first iteration - forcing tool usage');
        
        // Add a strong reminder to use tools
        conversationMessages.push({
          role: 'user',
          content: '⚠️ FEHLER: Du MUSST ein Tool verwenden! Analysiere die Frage erneut und rufe das passende Tool auf. Antworte NICHT direkt!'
        });
        
        // Continue to next iteration
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
      entityLinks = []; // Reset für neue Tool-Results
      
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

        if (result.stats) {
          resultsText += `\n\nDashboard-Statistiken:\n`;
          resultsText += `- Häuser: ${result.stats.totalHouses}\n`;
          resultsText += `- Aktive Buchungen: ${result.stats.activeBookings}\n`;
          resultsText += `- Offene Aufgaben: ${result.stats.pendingTasks}\n`;
          resultsText += `- Gesamtumsatz: ${result.stats.totalRevenue} EUR\n`;
        }

        if (result.guests && Array.isArray(result.guests)) {
          resultsText += `\n\nGefundene Gäste (${result.count}):\n`;
          result.guests.forEach((g: any, i: number) => {
            resultsText += `\nGast ${i + 1}:\n`;
            resultsText += `- Name: ${g.name}\n`;
            if (g.email) resultsText += `- Email: ${g.email}\n`;
            if (g.phone) resultsText += `- Telefon: ${g.phone}\n`;
            if (g.nationality) resultsText += `- Nationalität: ${g.nationality}\n`;
            resultsText += `- Anzahl Buchungen: ${g.bookingCount}\n`;
            if (g.lastBooking) resultsText += `- Letzte Buchung: ${new Date(g.lastBooking).toLocaleDateString('de-DE')}\n`;
            
            // Link zur Gäste-Seite mit Email-Filter
            if (g.email) {
              entityLinks.push({
                id: g.email,
                type: 'guest',
                label: g.name
              });
            }
          });
        }

        if (result.summary) {
          resultsText += `\n\nWäsche-Übersicht:\n`;
          resultsText += `🟢 ${result.summary.good} Häuser: Optimal versorgt\n`;
          resultsText += `🟡 ${result.summary.warning} Häuser: Niedrige Bestände\n`;
          resultsText += `🔴 ${result.summary.critical} Häuser: Kritische Bestände\n\n`;
          
          if (result.houses && Array.isArray(result.houses)) {
            const criticalHouses = result.houses.filter((h: any) => h.status === 'critical');
            if (criticalHouses.length > 0) {
              resultsText += `Kritische Häuser:\n`;
              criticalHouses.forEach((h: any) => {
                resultsText += `• ${h.house_name}: ${h.critical_items.join(', ')}\n`;
                entityLinks.push({
                  id: h.house_id,
                  type: 'house',
                  label: `${h.house_name} (Wäsche kritisch)`
                });
              });
            }
          }
        }

        if (result.orders && Array.isArray(result.orders)) {
          resultsText += `\n\nGefundene Wäschebestellungen (${result.count}):\n`;
          result.orders.forEach((o: any, i: number) => {
            resultsText += `\nBestellung ${i + 1}:\n`;
            resultsText += `- Haus: ${o.houses?.name || 'Unbekannt'}\n`;
            if (o.bookings?.guest_name) resultsText += `- Gast: ${o.bookings.guest_name}\n`;
            resultsText += `- Bestelldatum: ${new Date(o.order_date).toLocaleDateString('de-DE')}\n`;
            if (o.delivery_date) {
              resultsText += `- Lieferdatum: ${new Date(o.delivery_date).toLocaleDateString('de-DE')}`;
              if (o.delivery_time) resultsText += ` um ${o.delivery_time}`;
              resultsText += `\n`;
            } else {
              resultsText += `- Lieferdatum: Noch nicht festgelegt\n`;
            }
            resultsText += `- Status: ${o.status}\n`;
            resultsText += `- Artikel: ${o.total_items}\n`;
            resultsText += `- Typ: ${o.delivery_type === 'delivery' ? 'Lieferung' : 'Abholung'}\n`;
            if (o.service_providers?.name) resultsText += `- Anbieter: ${o.service_providers.name}\n`;
            if (o.notes) resultsText += `- Notizen: ${o.notes}\n`;
            
            // Formatiere Label mit verfügbaren Daten
            const dateStr = o.delivery_date 
              ? new Date(o.delivery_date).toLocaleDateString('de-DE')
              : new Date(o.order_date).toLocaleDateString('de-DE');
            
            const guestStr = o.bookings?.guest_name ? ` - ${o.bookings.guest_name}` : '';
            
            entityLinks.push({
              id: o.id,
              type: 'laundry_order',
              label: `${o.houses?.name || 'Bestellung'} - ${dateStr}${guestStr}`
            });
          });
        }

        if (result.events && Array.isArray(result.events)) {
          resultsText += `\n\nKalender-Termine (${result.count}):\n`;
          if (result.summary) {
            resultsText += `📅 Check-ins: ${result.summary.bookings}\n`;
            resultsText += `🧹 Reinigungen: ${result.summary.cleanings}\n`;
            resultsText += `🧺 Wäsche-Lieferungen: ${result.summary.laundry}\n\n`;
          }
          
          resultsText += `Details:\n`;
          result.events.forEach((e: any) => {
            const dateStr = new Date(e.date).toLocaleDateString('de-DE');
            const timeStr = e.time ? ` ${e.time}` : '';
            const icon = e.type === 'booking' ? '📅' : e.type === 'cleaning' ? '🧹' : '🧺';
            resultsText += `• ${icon} ${dateStr}${timeStr}: ${e.title} (${e.status})\n`;
            
            // Link zum jeweiligen Event-Typ
            entityLinks.push({
              id: e.id,
              type: e.type === 'booking' ? 'booking' : e.type === 'cleaning' ? 'cleaning_task' : 'laundry_order',
              label: `${e.title}`
            });
          });
        }

        if (result.message) {
          resultsText += `\n\n${result.message}\n`;
        }
      });
      
      resultsText += '\n\nBitte formatiere diese Informationen in einer klaren, strukturierten deutschen Antwort. Hebe den Status besonders hervor, wenn er "cancelled" ist!';
      
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

    // Get final response WITHOUT streaming, then manually stream it
    console.log('Getting final response from AI');
    const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: conversationMessages,
        stream: false, // Get complete response first
      }),
    });

    if (!finalResponse.ok) {
      throw new Error(`Final response error: ${finalResponse.status}`);
    }

    const finalData = await finalResponse.json();
    const finalText = finalData.choices[0].message.content || 'Keine Antwort erhalten.';
    
    console.log('Final response received:', { textLength: finalText.length });

    // Create manual SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream the AI response word by word for progressive display
          const words = finalText.split(' ');
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? '' : ' ') + words[i];
            const sseData = `data: ${JSON.stringify({
              choices: [{
                delta: { content: chunk },
                finish_reason: null
              }]
            })}\n\n`;
            controller.enqueue(encoder.encode(sseData));
            
            // Small delay for streaming effect
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Append entity links if any
          if (entityLinks.length > 0) {
            const entityText = `\n\n___ENTITIES___\n${JSON.stringify(entityLinks)}`;
            const entityChunk = `data: ${JSON.stringify({
              choices: [{
                delta: { content: entityText },
                finish_reason: null
              }]
            })}\n\n`;
            controller.enqueue(encoder.encode(entityChunk));
            
            console.log('Appended entity links to stream:', { 
              entityCount: entityLinks.length,
              links: entityLinks
            });
          }

          // Send [DONE] marker
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
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
