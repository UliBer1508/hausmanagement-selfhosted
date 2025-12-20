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

    // Aktuelles Datum für zeitbasierte Anfragen
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentDateTime = now.toISOString(); // Full ISO timestamp
    const berlinTime = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(now);

    // System prompt - CRITICAL: Force tool usage
    const systemPrompt = `Du bist ein Datenbank-Assistent für eine Ferienhaus-Verwaltungssoftware.

📅 AKTUELLES DATUM:
Heute ist: ${berlinTime}
ISO-Datum: ${currentDate}

Nutze dieses Datum für alle zeitbasierten Anfragen:
- "heute" → ${currentDate}
- "morgen" → berechne +1 Tag von ${currentDate}
- "nächste Woche" → berechne +7 Tage von ${currentDate}
- "letzte Woche" → berechne -7 Tage von ${currentDate}
- Relative Begriffe wie "nächste Buchung", "kommende Events" beziehen sich auf Daten >= ${currentDate}

🏠 WICHTIG - OBJEKTTYPEN:
- Es gibt ZWEI Arten von Objekten: "Touristische Vermietungen" (rental_type = 'tourist') und "Festvermietungen" (rental_type = 'long_term')
- **Touristische Objekte**: Kurzzeitmiete mit wechselnden Gästen → Buchungen, Reinigung, Wäsche, Umsatz
- **Festvermietungen**: Langzeitmiete mit festem Mieter → Mietvertrag, monatliche Zahlungen

ALLE Tools (außer Mieter-Management) berücksichtigen NUR touristische Vermietungen!
Bei Fragen zu "Häusern", "Buchungen", "Reinigung", "Wäsche" oder "Umsatz" werden automatisch nur touristische Objekte einbezogen.

Für Festvermietungen verwende AUSSCHLIESSLICH diese Tools:
- search_tenant_payments
- get_tenant_info
- get_tenant_analytics

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
  - "lücken" / "freie zeiträume" / "vacancies" / "frei" / "noch verfügbar" / "wann ist frei" / "freie Termine" → get_vacancies
    ⚠️ WICHTIG - ZEITANGABEN UMWANDELN:
    • "nächster Monat" / "1 Monat" / "im nächsten Monat" → months_ahead: 1
    • "nächste 2 Monate" / "2 Monate" → months_ahead: 2
    • "nächste 3 Monate" / "3 Monate" / "Quartal" → months_ahead: 3
    • "nächstes halbes Jahr" / "6 Monate" → months_ahead: 6 (default)
    • "nächstes Jahr" / "12 Monate" → months_ahead: 12
    • Keine Zeitangabe → months_ahead: 6 (default)
    📝 BEISPIELE:
    • "Zeige Lücken für nächsten Monat" → get_vacancies({ months_ahead: 1 })
    • "Welche Lücken gibt es in den nächsten 3 Monaten?" → get_vacancies({ months_ahead: 3 })
    • "Lücken fürs Wald Chalet im nächsten Monat" → get_vacancies({ house_id: "...", months_ahead: 1 })
    • "Wo ist im Quartal noch Platz?" → get_vacancies({ months_ahead: 3 })
- "analysiere lücke" / "ki analyse" / "lücke analysieren" / "buchungswahrscheinlichkeit" → analyze_vacancy_with_ai
- "übersicht" / "dashboard" / "statistik" → get_dashboard_stats
- "kalender" / "termine" / "events" → get_calendar_events
- UUID erwähnt → get_*_details Tools
- "dienstleister" / "anbieter" / "service provider" → search_service_providers
- "reinigungskraft" / "putzkraft" / "personal" / "wer ist [Name]" → search_cleaning_staff
- "was ist los in [Haus]?" / "wer kommt als nächstes?" / "ist [Haus] belegt?" → get_house_bookings_summary
- "nächste buchung" / "kommende buchung" → search_bookings mit date_from=${currentDate}, sortiert nach check_in ASC, limit 1
- "heute eingecheckt" / "wer ist da" → search_bookings mit check_in=${currentDate}
- "wer checkt heute aus" → search_bookings mit check_out=${currentDate}
- "aktuell eingecheckt" / "wer ist gerade da" / "heute belegt" → search_bookings mit date_from=heute, date_to=heute (nutzt Overlap-Detection!)
- "kommende buchungen" / "nächste woche" / "ab morgen" → search_bookings mit date_from=ab_datum
- "vergangene buchungen" / "letzte woche" / "bis gestern" → search_bookings mit date_to=bis_datum
- "umsatz" / "revenue" / "einnahmen" → get_revenue_stats
- "auslastung" / "occupancy" / "belegung" → get_occupancy_stats
- "gast statistik" / "stammkunden" / "gäste analyse" → get_guest_statistics
- "mietzahlungen" / "miete" / "tenant payment" → search_tenant_payments
- "mieter info" / "mieter von [Haus]" → get_tenant_info
- "mieter statistik" / "mieteinnahmen" → get_tenant_analytics
- "bestellung erstellen" / "wäsche bestellen" → create_linen_order (mit Bestätigung!)
- "bestellung bestätigen" / "status ändern" → update_linen_order_status (mit Bestätigung!)
- "reinigung ändern" / "reinigung verschieben" → update_cleaning_task (mit Bestätigung!)
- "personal zuweisen" / "reinigungskraft zuweisen" → assign_cleaning_staff (mit Bestätigung!)
- "marketing" / "aktion" / "kindergeschenk" / "welche aktionen" / "was muss ich vorbereiten" → get_marketing_reminders
- "bewertungen" / "rating" / "bewertung fehlt" / "bewertungen nachtragen" / "bewertung eintragen" / "marketing auswertung" → get_rating_reminders

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
  • Anzahl Gäste: [Zahl] - WENN Kinder dabei: "👨‍👩‍👧‍👦 Familie! ([X] Erwachsene, [Y] Kinder)"
  • Status: [Status] ⚠️ (IMMER anzeigen, auch bei "storniert"!)
  • Haus: [Hausname]
  • Betrag: [Betrag]
- Wenn Status "cancelled": Weise explizit darauf hin!
- 💡 WENN number_of_children > 0: Füge am Ende IMMER diesen Hinweis hinzu:
  "💡 HINWEIS: Familie mit [X] Kind(ern) - Spielzeug/Kinderbett bereitstellen!"

**Reinigungsaufträge:**
"Ich habe [Anzahl] Reinigungsauftrag/-aufträge gefunden:

• Haus: [house_name]
• Datum: [scheduled_date] um [scheduled_time] Uhr
• Status: [status mit Icon: scheduled=📅, in_progress=🧹, completed=✅, cancelled=❌]
• Reinigungskraft: [staff_name] (falls zugewiesen)
• Buchung: [guest_name] (falls vorhanden)
• Zahlungsstatus: [payment_status mit Icon: paid=✅, unpaid=❌, pending=⏳] (falls vorhanden)
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

**Offene Bestellungen:**
"🔔 Ich habe [X] offene Bestellung(en) gefunden, die noch bestätigt werden müssen:

• Haus: [house_name]
• Gast: [guest_name] (falls vorhanden)
• Lieferdatum: [delivery_date]
• Bestelldatum: [order_date]
• Menge: [Anzahl Items]
• Status: Offen 📝

💡 HINWEIS:
Diese Bestellungen wurden automatisch erstellt und müssen noch bestätigt werden, bevor sie an die Wäscherei gesendet werden."

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

**Lücken (Freie Zeiträume):**
"🔍 Lücken-Übersicht für [Hausname / Alle Häuser]:

📅 LÜCKE 1 ([Hausname]):
• Zeitraum: [start] - [end] ([X] Tage)
• Dringlichkeit: [🔴 HOCH / 🟡 MITTEL / 🟢 NIEDRIG]
• Saison: [🔥 Hochsaison / 📅 Übergangssaison / 🌿 Nebensaison]
• Status: In [X] Tagen - [Sofort handeln! / Zeitnah planen / Planbar]

📅 LÜCKE 2 ([Hausname]):
...

💡 Tipp: Sage 'Analysiere Lücke 1' für detaillierte KI-Empfehlungen mit Preisvorschlag und Maßnahmenplan."

**KI-Lücken-Analyse:**
"🤖 KI-ANALYSE für [Hausname] ([start] - [end], [X] Tage):

📊 BUCHUNGSWAHRSCHEINLICHKEIT: [X]%
[████░░░░░░] [Hoch/Mittel/Niedrig]

💰 PREISEMPFEHLUNG: 
   • Pro Nacht: €[min] - €[max]
   • Pro Woche (7 Nächte): €[min*7] - €[max*7]

🎯 DRINGLICHKEIT: [HOCH/MITTEL/NIEDRIG]
⏰ DEADLINE: Bis spätestens [deadline]

💭 BEGRÜNDUNG:
[AI reasoning text with seasonal patterns, lead time, nationality trends]

📋 EMPFOHLENE MAßNAHMEN:
1️⃣ [Prio 1] [action]
   → [reason]

2️⃣ [Prio 2] [action]
   → [reason]

3️⃣ [Prio 3] [action]
   → [reason]"

**Dienstleister:**
"Ich habe [Anzahl] Dienstleister gefunden:

• Name: [name]
• Service-Typ: [service_type mit Icon: cleaning=🧹, laundry=🧺, maintenance=🔧, other=📋]
• Status: [is_active ? Aktiv ✅ : Inaktiv ❌]
• Kontakt: [contact_email], [contact_phone]
• Portal-Zugang: [has_portal ? Ja ✅ : Nein ❌]
• Notizen: [notes]"

**Umsatz-Statistiken (PHASE 1):**
"💰 Umsatz-Statistik ([period]):

📊 GESAMT:
• Gesamtumsatz: [total_revenue] EUR
• Anzahl Buchungen: [booking_count]
• Durchschnittsumsatz: [average_revenue] EUR

🏠 PRO HAUS:
• [Haus 1]: [total] EUR ([bookings] Buchungen)
• [Haus 2]: [total] EUR ([bookings] Buchungen)

📅 PRO MONAT:
• [Monat 1]: [total] EUR ([bookings] Buchungen)
• [Monat 2]: [total] EUR ([bookings] Buchungen)"

**Auslastungs-Statistiken (PHASE 1):**
"📈 Auslastungs-Statistik ([period]):

🏠 [Hausname]:
• Gesamttage: [total_days]
• Belegte Tage: [occupied_days]
• Leerstand: [vacant_days] Tage
• Auslastung: [occupancy_rate]%
• Buchungen: [booking_count]"

**Gäste-Statistiken (PHASE 1):**
"👥 Gäste-Statistik ([period]):

📊 ÜBERSICHT:
• Gesamt Gäste: [total_guests]
• Neue Gäste: [new_guests]
• Stammkunden: [returning_guests]
• Rückkehrrate: [return_rate]%
• Buchungen: [total_bookings]
• Ø Aufenthaltsdauer: [avg_stay_duration] Nächte

🌍 NACH NATIONALITÄT:
• [Land 1]: [Anzahl] Gäste
• [Land 2]: [Anzahl] Gäste"

**Mietzahlungen (PHASE 2):**
"💳 Mietzahlungen:

• Haus: [house_name]
• Mieter: [tenant_name]
• Fällig am: [due_date]
• Betrag: [amount] EUR
• Status: [status mit Icon: paid=✅, pending=⏳, overdue=⚠️, cancelled=❌]
• Zahlungsmethode: [payment_method]"

**Mieter-Info (PHASE 2):**
"🏘️ Mieter-Informationen für [Hausname]:

👤 MIETER:
• Name: [tenant_name]
• Email: [tenant_email]
• Telefon: [tenant_phone]

📝 VERTRAG:
• Beginn: [contract_start]
• Ende: [contract_end oder 'Unbefristet']
• Monatliche Miete: [monthly_rent] EUR
• Kaution: [deposit_amount] EUR
• Zahlungstag: [payment_day]. des Monats
• Zahlungsmethode: [payment_method]"

**Mieter-Statistiken (PHASE 2):**
"📊 Mieter-Statistik ([period]):

💰 ÜBERSICHT:
• Mieteinnahmen: [total_revenue] EUR
• Ausstehend: [pending_amount] EUR
• Überfällig: [overdue_amount] EUR
• Zahlungen: [payment_count]

🏠 PRO HAUS:
• [Haus 1]: [total] EUR (paid: [paid], pending: [pending], overdue: [overdue])"

**Bestellung erstellt (PHASE 3):**
"✅ Wäschebestellung erfolgreich erstellt!

📦 DETAILS:
• Haus: [house_name]
• Lieferdatum: [delivery_date]
• Status: Offen 📝
• Items: [Anzahl verschiedene Items]

💡 HINWEIS:
Die Bestellung muss noch bestätigt werden, bevor sie an die Wäscherei gesendet wird."

**Status geändert (PHASE 3):**
"✅ Status erfolgreich geändert!

🔄 ÄNDERUNG:
• Typ: [Bestellung/Reinigung]
• Alter Status: [old_status]
• Neuer Status: [new_status]

💡 Die Änderung wurde in der Datenbank gespeichert."

**Reinigungspersonal:**
"Ich habe [Anzahl] Reinigungskräfte gefunden:

• Name: [name]
• Status: [is_active ? Aktiv ✅ : Inaktiv ❌]
• Email: [email]
• Telefon: [phone]
• Stundensatz: [hourly_rate] EUR/Std
• Bewertung: [quality_rating]/5 ⭐
• Verfügbarkeit: [availability_days als Liste: Mo, Di, Mi, etc.]
• Einsätze gesamt: [total_assignments] (davon [completed_assignments] abgeschlossen)
• Erfolgsquote: [Prozentsatz] %
• Kommende Einsätze: [upcoming_tasks.length] Aufträge"

**Haus-Übersicht:**
"📊 Übersicht für [Hausname]:

👥 AKTUELL EINGECHECKT:
[falls current_booking existiert:]
• Gast: [guest_name]
• Check-in: [check_in_datum]
• Check-out: [check_out_datum] (noch X Tage)
• Anzahl Gäste: [number_of_guests]
• Buchungsbetrag: [booking_amount] EUR
[sonst:]
✅ Aktuell frei

📅 NÄCHSTE BUCHUNG:
[falls next_booking existiert:]
• Gast: [guest_name]
• Check-in: [check_in_datum] (in X Tagen)
• Check-out: [check_out_datum]
• Anzahl Gäste: [number_of_guests]
• Buchungsbetrag: [booking_amount] EUR
[sonst:]
Keine kommenden Buchungen

📈 STATISTIK:
• Gesamt Buchungen: [total]
• Aktuelle: [current]
• Kommende: [upcoming]
• Vergangene: [past]"

TOOLS - KRITISCHE REGELN:
1. Bei "reinigung von [Gastname]" → IMMER search_cleaning_tasks mit guest_name Parameter!
2. Bei "reinigung von [Reinigungskraft]" / "Amelas Reinigungen" → search_cleaning_tasks mit staff_name Parameter!
3. Bei "unbezahlte Reinigungen" / "offene Zahlungen" → search_cleaning_tasks mit payment_status="unpaid"!
4. Bei nur einem Namen → ERST search_bookings, DANN bei Bedarf search_cleaning_tasks
5. Bei "haus" / "chalet" → search_houses
6. Bei "gast" / "gäste" → search_guests
7. Bei "wäsche" / "linen" → get_linen_overview
8. Bei "müssen wir wäsche bestellen" / "offene bestellungen" / "zu bestätigen" → search_linen_orders mit status="offen"
9. Bei "wäschebestellungen prüfen" / "bestellstatus" → search_linen_orders ohne Status-Filter
10. Bei "statistik" / "übersicht" → get_dashboard_stats
11. Bei "kalender" / "termine" → get_calendar_events
12. Bei UUID → entsprechendes get_*_details Tool
13. Bei "familien" / "buchungen mit kindern" / "kinder dabei" → search_bookings mit has_children=true

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

WICHTIG - Wäschebestellungen:
- "Was brauche ich für [Buchung]?" → generate_booking_linen_order
- "Wieviel Wäsche für Dr. Mirtschink?" → 
  1. ERST search_bookings (Buchungs-ID finden)
  2. DANN generate_booking_linen_order mit booking_id

- "Wie ist mein Buffer?" / "Buffer-Status?" → get_house_linen_status
  → Zeige buffer_status aus Optimierungsergebnis falls vorhanden

ANTWORT-FORMAT für Buchungs-Bestellungen:
"🧺 Wäschebestellung für [Gast] ([X] Personen):

📦 BESTELLUNG:
• [X]x Bettwäsche (je [Preis] EUR)
• [X]x Große Handtücher (je [Preis] EUR)
• [X]x Kleine Handtücher (je [Preis] EUR)
...

💶 KOSTEN:
Gesamt: [X] EUR

💡 HINWEIS:
Dies ist nur für diese Buchung berechnet.
Dein Safety Buffer im Inventar bleibt unberührt und muss separat verwaltet werden."

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

Beispiel 12 (Familien-Buchungen):
User: "Zeige mir alle Familien" / "Welche Buchungen haben Kinder?"
✅ Tool: search_bookings({"has_children": true})
✅ Zeigt: Alle Buchungen mit Kindern (number_of_children > 0) mit Familien-Hinweis

Beispiel 13 (Familien in bestimmtem Zeitraum):
User: "Gibt es nächste Woche Familien?" / "Familien im Dezember"
✅ Tool: search_bookings({"has_children": true, "date_from": "[Startdatum]", "date_to": "[Enddatum]"})

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
              updated_to: { type: "string", description: "Buchungen geändert bis zu diesem Zeitpunkt (ISO 8601)" },
              has_children: { type: "boolean", description: "Buchungen mit Kindern (Familien)" }
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
          description: "Sucht Reinigungsaufträge nach Kriterien wie Haus, Buchung, Status, Datum, Personal oder Provider",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              booking_id: { type: "string", description: "UUID der Buchung" },
              guest_name: { type: "string", description: "Name des Gastes (sucht über Buchung)" },
              staff_name: { type: "string", description: "Name der Reinigungskraft (z.B. 'Amela', 'Boris')" },
              assigned_staff_id: { type: "string", description: "UUID der zugewiesenen Reinigungskraft" },
              provider_id: { type: "string", description: "UUID des Service-Providers" },
              payment_status: { 
                type: "string", 
                enum: ["paid", "unpaid", "pending"],
                description: "Zahlungsstatus" 
              },
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
              status: { type: "string", enum: ["offen", "pending", "assigned", "confirmed", "delivered", "cancelled"], description: "Status der Bestellung" },
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
          name: "generate_booking_linen_order",
          description: "Erstellt Wäschebestellung für eine EINZELNE Buchung (ohne Safety Buffer)",
          parameters: {
            type: "object",
            properties: {
              booking_id: { 
                type: "string", 
                description: "UUID der Buchung" 
              }
            },
            required: ["booking_id"]
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
      },
      {
        type: "function",
        function: {
          name: "search_service_providers",
          description: "Sucht Dienstleister (Reinigung, Wäsche, etc.) nach Name, Service-Typ oder Status",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name des Dienstleisters (Teilstring)" },
              service_type: { 
                type: "string", 
                enum: ["cleaning", "laundry", "maintenance", "other"],
                description: "Service-Typ" 
              },
              is_active: { type: "boolean", description: "Nur aktive Dienstleister?" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_house_bookings_summary",
          description: "Zeigt Übersicht aller Buchungen für ein Haus (aktuell, kommend, vergangen)",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              timeframe: {
                type: "string",
                enum: ["current", "upcoming", "past", "all"],
                description: "Zeitrahmen (default: all)"
              }
            },
            required: ["house_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_cleaning_staff",
          description: "Sucht Reinigungspersonal nach Name oder Verfügbarkeit",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Name der Reinigungskraft" },
              is_active: { type: "boolean", description: "Nur aktives Personal?" }
            }
          }
        }
      },
      // PHASE 1: Finanz-Statistiken
      {
        type: "function",
        function: {
          name: "get_revenue_stats",
          description: "Zeigt Umsatz-Statistiken für einen Zeitraum (Gesamt, pro Haus, pro Monat)",
          parameters: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" },
              house_id: { type: "string", description: "Optional: Nur für ein spezifisches Haus" }
            },
            required: ["date_from", "date_to"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_occupancy_stats",
          description: "Zeigt Auslastungsstatistiken für Häuser (Belegungstage, Leerstand, Auslastung in %)",
          parameters: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" },
              house_id: { type: "string", description: "Optional: Nur für ein spezifisches Haus" }
            },
            required: ["date_from", "date_to"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_guest_statistics",
          description: "Zeigt Gäste-Analysen (Stammkunden, neue Gäste, Nationalitäten, durchschnittliche Aufenthaltsdauer)",
          parameters: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" }
            },
            required: ["date_from", "date_to"]
          }
        }
      },
      // PHASE 2: Mieter-Management
      {
        type: "function",
        function: {
          name: "search_tenant_payments",
          description: "Sucht Mietzahlungen nach Haus, Status oder Zeitraum",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              status: { 
                type: "string", 
                enum: ["pending", "paid", "overdue", "cancelled"],
                description: "Zahlungsstatus" 
              },
              date_from: { type: "string", description: "Von-Datum für Fälligkeit (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum für Fälligkeit (ISO 8601)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_tenant_info",
          description: "Zeigt Mieterinformationen für ein spezifisches Haus (aus tenant_info JSONB-Feld)",
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
          name: "get_tenant_analytics",
          description: "Zeigt Mieter-Statistiken (Gesamteinnahmen, ausstehende Beträge, Vertragsstatus)",
          parameters: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "Von-Datum (ISO 8601)" },
              date_to: { type: "string", description: "Bis-Datum (ISO 8601)" }
            },
            required: ["date_from", "date_to"]
          }
        }
      },
      // PHASE 3: Schreibzugriffe (MIT BESTÄTIGUNG!)
      {
        type: "function",
        function: {
          name: "create_linen_order",
          description: "Erstellt eine neue Wäschebestellung. WICHTIG: Frage immer nach Bestätigung!",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              booking_id: { type: "string", description: "Optional: UUID der Buchung" },
              delivery_date: { type: "string", description: "Geplantes Lieferdatum (ISO 8601)" },
              items: { 
                type: "object", 
                description: "Wäsche-Items als Key-Value (z.B. {bedding: 5, large_towels: 3})" 
              },
              notes: { type: "string", description: "Notizen zur Bestellung" }
            },
            required: ["house_id", "delivery_date", "items"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_linen_order_status",
          description: "Ändert den Status einer Wäschebestellung. WICHTIG: Frage immer nach Bestätigung!",
          parameters: {
            type: "object",
            properties: {
              order_id: { type: "string", description: "UUID der Bestellung" },
              new_status: { 
                type: "string", 
                enum: ["pending", "assigned", "confirmed", "delivered", "cancelled"],
                description: "Neuer Status" 
              }
            },
            required: ["order_id", "new_status"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_cleaning_task",
          description: "Ändert Details eines Reinigungsauftrags. WICHTIG: Frage immer nach Bestätigung!",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID des Tasks" },
              scheduled_date: { type: "string", description: "Neues Datum (ISO 8601)" },
              scheduled_time: { type: "string", description: "Neue Uhrzeit (HH:MM)" },
              status: { 
                type: "string", 
                enum: ["scheduled", "in_progress", "completed", "cancelled", "delayed", "draft"],
                description: "Neuer Status" 
              },
              notes: { type: "string", description: "Aktualisierte Notizen" }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "assign_cleaning_staff",
          description: "Weist Reinigungspersonal einem Auftrag zu. WICHTIG: Frage immer nach Bestätigung!",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID des Reinigungsauftrags" },
              staff_id: { type: "string", description: "UUID der Reinigungskraft (aus cleaning_staff Tabelle)" },
              provider_id: { type: "string", description: "Optional: UUID des Service-Providers" }
            },
            required: ["task_id", "staff_id"]
          }
        }
      },
      // PHASE 4: Vacancy Analysis (Lücken-Analyse)
      {
        type: "function",
        function: {
          name: "get_vacancies",
          description: "Zeigt alle freien Zeiträume (Lücken) zwischen Buchungen für touristische Objekte. Berechnet Dringlichkeit basierend auf Saison und Vorlaufzeit.",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "Optional: Nur Lücken für ein spezifisches Haus (UUID)" },
              min_days: { type: "number", description: "Optional: Minimum Tage für relevante Lücke (default: 3)" },
              months_ahead: { type: "number", description: "Optional: Wie viele Monate in die Zukunft schauen (default: 6)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "analyze_vacancy_with_ai",
          description: "Führt tiefgehende KI-Analyse für eine spezifische Lücke durch. Gibt Buchungswahrscheinlichkeit, Preisempfehlung, priorisierte Maßnahmen und Dringlichkeit zurück.",
          parameters: {
            type: "object",
            properties: {
              house_id: { type: "string", description: "UUID des Hauses" },
              vacancy_start: { type: "string", description: "Startdatum der Lücke (ISO 8601, YYYY-MM-DD)" },
              vacancy_end: { type: "string", description: "Enddatum der Lücke (ISO 8601, YYYY-MM-DD)" }
            },
            required: ["house_id", "vacancy_start", "vacancy_end"]
          }
        }
      },
      // PHASE 5: Marketing Reminders
      {
        type: "function",
        function: {
          name: "get_marketing_reminders",
          description: "Holt alle kommenden Buchungen für die Marketing-Aktionen relevant sind. Zeigt Buchungen die Kriterien aktiver Marketing-Aktionen erfüllen (z.B. Familien mit Kindern für Kindergeschenke).",
          parameters: {
            type: "object",
            properties: {
              include_applied: { 
                type: "boolean", 
                description: "Auch bereits angewendete Aktionen anzeigen (default: false)" 
              },
              days_ahead: {
                type: "number",
                description: "Wie viele Tage in die Zukunft schauen (default: 90)"
              }
            }
          }
        }
      },
      // PHASE 6: Rating Reminders
      {
        type: "function",
        function: {
          name: "get_rating_reminders",
          description: "Holt alle Buchungen bei denen externe Bewertungen fehlen und nachgetragen werden sollten (2+ Wochen nach Checkout). Priorisiert Marketing-Kandidaten für die Erfolgsauswertung.",
          parameters: {
            type: "object",
            properties: {
              min_days_after_checkout: { 
                type: "number", 
                description: "Mindestanzahl Tage nach Checkout (default: 14)" 
              },
              max_days_after_checkout: {
                type: "number",
                description: "Maximale Tage nach Checkout (default: 90)"
              },
              marketing_only: {
                type: "boolean",
                description: "Nur Buchungen mit angewendeten Marketing-Aktionen (default: false)"
              }
            }
          }
        }
      }
    ];

    // Tool execution functions
    async function executeSearchBookings(params: any) {
      console.log('Executing search_bookings with params:', params);
      
      let query = supabase
        .from('bookings')
        .select('*, houses!bookings_house_id_fkey(name, address), guests!bookings_guest_id_fkey(*), number_of_adults, number_of_children');

      if (params.guest_name) {
        query = query.ilike('guest_name', `%${params.guest_name}%`);
      }
      if (params.status) {
        query = query.eq('status', params.status);
      }
      if (params.house_id) {
        query = query.eq('house_id', params.house_id);
      }
      // Overlap-Detection: Buchungen die im Zeitraum aktiv sind
      if (params.date_from && params.date_to) {
        // Eine Buchung ist aktiv wenn: check_in <= date_to UND check_out >= date_from
        query = query.lte('check_in', params.date_to);
        query = query.gte('check_out', params.date_from);
      } else if (params.date_from) {
        // Nur date_from: Alle Buchungen die ab diesem Datum noch laufen
        query = query.gte('check_out', params.date_from);
      } else if (params.date_to) {
        // Nur date_to: Alle Buchungen die bis zu diesem Datum schon begonnen haben
        query = query.lte('check_in', params.date_to);
      }
      if (params.updated_from) {
        query = query.gte('updated_at', params.updated_from);
      }
      if (params.updated_to) {
        query = query.lte('updated_at', params.updated_to);
      }
      // Familien-Filter: Buchungen mit Kindern
      if (params.has_children === true) {
        query = query.gt('number_of_children', 0);
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
        .select('*, houses!bookings_house_id_fkey(name, address, max_guests), guests!bookings_guest_id_fkey(*)')
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
        .select('*')
        .eq('rental_type', 'tourist');

      if (search_term) {
        query = query.or(`name.ilike.%${search_term}%,address.ilike.%${search_term}%`);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        console.error('Error searching houses:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data.length} houses (tourist rentals only)`);
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
          houses!service_tasks_house_id_fkey (name, address),
          bookings!service_tasks_booking_id_fkey (guest_name, check_in, check_out, guests!bookings_guest_id_fkey(name, email, phone))
        `)
        .eq('service_type', 'cleaning');

      // Wenn nach staff_name gesucht wird, erst die cleaning_staff finden
      if (params.staff_name) {
        const { data: staff } = await supabase
          .from('cleaning_staff')
          .select('id')
          .ilike('name', `%${params.staff_name}%`);
        
        if (staff && staff.length > 0) {
          const staffIds = staff.map(s => s.id);
          query = query.in('assigned_staff_id', staffIds);
        } else {
          return { success: true, tasks: [], count: 0, message: 'Keine Reinigungskraft mit diesem Namen gefunden' };
        }
      }

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
      if (params.assigned_staff_id) query = query.eq('assigned_staff_id', params.assigned_staff_id);
      if (params.provider_id) query = query.eq('provider_id', params.provider_id);
      if (params.payment_status) query = query.eq('payment_status', params.payment_status);
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

      // Lade cleaning_staff und service_provider Daten separat
      const staffIds = [...new Set(data.map((t: any) => t.assigned_staff_id).filter(Boolean))];
      const providerIds = [...new Set(data.map((t: any) => t.provider_id).filter(Boolean))];
      
      const [staffData, providerData] = await Promise.all([
        staffIds.length > 0 
          ? supabase.from('cleaning_staff').select('id, name, email, phone').in('id', staffIds)
          : { data: [] },
        providerIds.length > 0
          ? supabase.from('service_providers').select('id, name, contact_email, contact_phone').in('id', providerIds)
          : { data: [] }
      ]);

      const staffMap = new Map((staffData.data || []).map((s: any) => [s.id, s]));
      const providerMap = new Map((providerData.data || []).map((p: any) => [p.id, p]));

      // Füge die Daten zu den Tasks hinzu
      const enrichedData = data.map((task: any) => ({
        ...task,
        cleaning_staff: task.assigned_staff_id ? staffMap.get(task.assigned_staff_id) : null,
        service_providers: task.provider_id ? providerMap.get(task.provider_id) : null
      }));

      console.log(`Found ${enrichedData.length} cleaning tasks`);
      return { success: true, tasks: enrichedData, count: enrichedData.length };
    }

    async function executeGetCleaningTaskDetails(task_id: string) {
      console.log('Executing get_cleaning_task_details for:', task_id);
      
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses!service_tasks_house_id_fkey (*),
          bookings!service_tasks_booking_id_fkey (*, guests!bookings_guest_id_fkey(*))
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
        supabase.from('houses').select('*').eq('rental_type', 'tourist'),
        supabase.from('bookings').select('*, houses!bookings_house_id_fkey(rental_type)').eq('houses.rental_type', 'tourist'),
        supabase.from('service_tasks').select('*, houses!service_tasks_house_id_fkey(rental_type)').eq('houses.rental_type', 'tourist')
      ]);

      const stats = {
        totalHouses: housesRes.data?.length || 0,
        activeBookings: bookingsRes.data?.filter((b: any) => b.status === 'confirmed').length || 0,
        pendingTasks: tasksRes.data?.filter((t: any) => t.status === 'scheduled').length || 0,
        totalRevenue: bookingsRes.data?.reduce((sum: number, b: any) => sum + (b.booking_amount || 0), 0) || 0
      };

      console.log('Dashboard stats (tourist rentals only):', stats);
      return { success: true, stats };
    }

    async function executeSearchGuests(params: any) {
      console.log('Executing search_guests with params:', params);
      
      // Query direkt von guests-Tabelle
      let guestsQuery = supabase
        .from('guests')
        .select('*');

      if (params.guest_name) {
        guestsQuery = guestsQuery.ilike('name', `%${params.guest_name}%`);
      }
      if (params.guest_email) {
        guestsQuery = guestsQuery.ilike('email', `%${params.guest_email}%`);
      }
      if (params.nationality) {
        guestsQuery = guestsQuery.ilike('nationality', `%${params.nationality}%`);
      }
      if (params.updated_from) {
        guestsQuery = guestsQuery.gte('updated_at', params.updated_from);
      }
      if (params.updated_to) {
        guestsQuery = guestsQuery.lte('updated_at', params.updated_to);
      }

      const { data: guestsData, error: guestsError } = await guestsQuery.order('name', { ascending: true });
      
      if (guestsError) {
        console.error('Error searching guests:', guestsError);
        return { success: false, error: guestsError.message };
      }

      // Lade Buchungen für gefundene Gäste
      const guestIds = guestsData?.map((g: any) => g.id) || [];
      
      let bookingsData: any[] = [];
      if (guestIds.length > 0) {
        const { data } = await supabase
          .from('bookings')
          .select('id, guest_id, check_in, check_out')
          .in('guest_id', guestIds);
        bookingsData = data || [];
      }

      // Gruppiere Buchungen nach guest_id
      const bookingsByGuest = new Map();
      bookingsData.forEach((b: any) => {
        if (!bookingsByGuest.has(b.guest_id)) {
          bookingsByGuest.set(b.guest_id, []);
        }
        bookingsByGuest.get(b.guest_id).push({
          id: b.id,
          check_in: b.check_in,
          check_out: b.check_out
        });
      });

      const guests = (guestsData || []).map((g: any) => {
        const guestBookings = bookingsByGuest.get(g.id) || [];
        return {
          id: g.id,
          name: g.name,
          email: g.email,
          phone: g.phone,
          nationality: g.nationality,
          street: g.street,
          city: g.city,
          postal_code: g.postal_code,
          birth_date: g.birth_date,
          notes: g.notes,
          bookings: guestBookings,
          bookingCount: guestBookings.length,
          lastBooking: guestBookings.length > 0 
            ? guestBookings.sort((a: any, b: any) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())[0].check_in 
            : null
        };
      }).filter((g: any) => !params.min_bookings || g.bookingCount >= params.min_bookings);

      console.log(`Found ${guests.length} guests from guests table`);
      return { success: true, guests, count: guests.length };
    }

    async function executeGetLinenOverview() {
      console.log('Executing get_linen_overview');
      
      const { data: houses, error } = await supabase
        .from('houses')
        .select('id, name, address, linen_stock, linen_in_use, linen_dirty')
        .eq('rental_type', 'tourist')
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
        .select('*, houses!linen_orders_house_id_fkey(name, address), service_providers!linen_orders_provider_id_fkey(name, service_type), bookings!linen_orders_booking_id_fkey(guest_name, check_in, check_out)');

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

    async function executeGenerateBookingLinenOrder(booking_id: string) {
      console.log('Executing generate_booking_linen_order for:', booking_id);
      
      const { data, error } = await supabase.functions.invoke('generate-booking-linen-order', {
        body: { booking_id }
      });

      if (error) {
        console.error('Error generating linen order:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        ...data
      };
    }

    async function executeGetCalendarEvents(params: any) {
      console.log('Executing get_calendar_events with params:', params);
      
      const eventTypes = params.event_types || ['booking', 'cleaning'];
      const events: any[] = [];

      if (eventTypes.includes('booking')) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('*, houses!bookings_house_id_fkey(name)')
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
          .select('*, houses!service_tasks_house_id_fkey(name)')
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
          .select('*, houses!linen_orders_house_id_fkey(name)')
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

    async function executeSearchServiceProviders(params: any) {
      console.log('Executing search_service_providers with params:', params);
      
      let query = supabase
        .from('service_providers')
        .select('*');

      if (params.name) {
        query = query.ilike('name', `%${params.name}%`);
      }
      if (params.service_type) {
        query = query.eq('service_type', params.service_type);
      }
      if (params.is_active !== undefined) {
        query = query.eq('is_active', params.is_active);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        console.error('Error searching service providers:', error);
        return { success: false, error: error.message };
      }

      console.log(`Found ${data.length} service providers`);
      return { success: true, providers: data, count: data.length };
    }

    async function executeGetHouseBookingsSummary(house_id: string, timeframe: string = 'all') {
      console.log('Executing get_house_bookings_summary:', { house_id, timeframe });
      
      const now = new Date().toISOString();
      let query = supabase
        .from('bookings')
        .select('*, houses!bookings_house_id_fkey(name, address)')
        .eq('house_id', house_id);

      // Basis-Query: Alle Buchungen für das Haus
      const { data: allData, error: allError } = await query.order('check_in', { ascending: true });
      
      if (allError) {
        console.error('Error getting house bookings summary:', allError);
        return { success: false, error: allError.message };
      }

      // Kategorisieren nach Zeitrahmen
      const nowDate = new Date();
      const current = allData.filter((b: any) => 
        new Date(b.check_in) <= nowDate && new Date(b.check_out) > nowDate && b.status !== 'cancelled'
      );
      const upcoming = allData.filter((b: any) => 
        new Date(b.check_in) > nowDate && b.status !== 'cancelled'
      );
      const past = allData.filter((b: any) => 
        new Date(b.check_out) <= nowDate || b.status === 'cancelled'
      );

      // Filtern nach Timeframe
      let filteredData = allData;
      switch (timeframe) {
        case 'current':
          filteredData = current;
          break;
        case 'upcoming':
          filteredData = upcoming;
          break;
        case 'past':
          filteredData = past;
          break;
      }

      return {
        success: true,
        house: allData[0]?.houses || null,
        summary: {
          total: allData.length,
          current: current.length,
          upcoming: upcoming.length,
          past: past.length
        },
        current_booking: current[0] || null,
        next_booking: upcoming[0] || null,
        bookings: filteredData
      };
    }

    async function executeSearchCleaningStaff(params: any) {
      console.log('Executing search_cleaning_staff with params:', params);
      
      let query = supabase
        .from('cleaning_staff')
        .select('*');

      if (params.name) {
        query = query.ilike('name', `%${params.name}%`);
      }
      if (params.is_active !== undefined) {
        query = query.eq('is_active', params.is_active);
      }

      const { data, error } = await query.order('name', { ascending: true });

      if (error) {
        console.error('Error searching cleaning staff:', error);
        return { success: false, error: error.message };
      }

      // Lade kommende Reinigungsaufträge für jede Reinigungskraft
      const today = new Date().toISOString().split('T')[0];
      const { data: allTasks } = await supabase
        .from('service_tasks')
        .select('id, scheduled_date, scheduled_time, status, houses!service_tasks_house_id_fkey(name)')
        .eq('service_type', 'cleaning')
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'in_progress']);

      // Gruppiere Tasks nach Staff ID
      const tasksByStaff = new Map();
      allTasks?.forEach((task: any) => {
        const staffId = task.assigned_staff_id;
        if (staffId) {
          if (!tasksByStaff.has(staffId)) {
            tasksByStaff.set(staffId, []);
          }
          tasksByStaff.get(staffId).push(task);
        }
      });

      // Reichere Staff-Daten mit kommenden Tasks an
      const enrichedData = data.map(staff => ({
        ...staff,
        upcoming_tasks: tasksByStaff.get(staff.id) || [],
        success_rate: staff.total_assignments > 0 
          ? Math.round((staff.completed_assignments / staff.total_assignments) * 100) 
          : 0
      }));

      console.log(`Found ${enrichedData.length} cleaning staff`);
      return { success: true, staff: enrichedData, count: enrichedData.length };
    }

    // PHASE 1: Finanz-Statistiken Execute-Funktionen
    async function executeGetRevenueStats(params: any) {
      console.log('Executing get_revenue_stats with params:', params);
      
      let query = supabase
        .from('bookings')
        .select('booking_amount, check_in, check_out, houses!inner(name, rental_type), status')
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled')
        .not('booking_amount', 'is', null)
        .gte('check_in', params.date_from)
        .lte('check_out', params.date_to);

      if (params.house_id) {
        query = query.eq('house_id', params.house_id);
      }

      const { data, error } = await query.order('check_in', { ascending: true });

      if (error) {
        console.error('Error getting revenue stats:', error);
        return { success: false, error: error.message };
      }

      const totalRevenue = data.reduce((sum, b) => sum + (b.booking_amount || 0), 0);
      const bookingCount = data.length;
      const averageRevenue = bookingCount > 0 ? totalRevenue / bookingCount : 0;

      // Gruppiere nach Haus
      const revenueByHouse: Record<string, { total: number, bookings: number }> = {};
      data.forEach(b => {
        const houseName = b.houses?.name || 'Unbekannt';
        if (!revenueByHouse[houseName]) {
          revenueByHouse[houseName] = { total: 0, bookings: 0 };
        }
        revenueByHouse[houseName].total += b.booking_amount || 0;
        revenueByHouse[houseName].bookings++;
      });

      // Gruppiere nach Monat
      const revenueByMonth: Record<string, { total: number, bookings: number }> = {};
      data.forEach(b => {
        const month = b.check_in.substring(0, 7); // YYYY-MM
        if (!revenueByMonth[month]) {
          revenueByMonth[month] = { total: 0, bookings: 0 };
        }
        revenueByMonth[month].total += b.booking_amount || 0;
        revenueByMonth[month].bookings++;
      });

      return {
        success: true,
        summary: {
          total_revenue: totalRevenue,
          booking_count: bookingCount,
          average_revenue: Math.round(averageRevenue),
          period: `${params.date_from} bis ${params.date_to}`
        },
        by_house: revenueByHouse,
        by_month: revenueByMonth
      };
    }

    async function executeGetOccupancyStats(params: any) {
      console.log('Executing get_occupancy_stats with params:', params);
      
      const startDate = new Date(params.date_from);
      const endDate = new Date(params.date_to);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      let housesQuery = supabase.from('houses').select('id, name').eq('rental_type', 'tourist');
      if (params.house_id) {
        housesQuery = housesQuery.eq('id', params.house_id);
      }

      const { data: houses, error: housesError } = await housesQuery;
      if (housesError) {
        return { success: false, error: housesError.message };
      }

      const stats: Record<string, any> = {};

      for (const house of houses || []) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('check_in, check_out, status')
          .eq('house_id', house.id)
          .neq('status', 'cancelled')
          .or(`check_in.lte.${params.date_to},check_out.gte.${params.date_from}`);

        let occupiedDays = 0;
        bookings?.forEach(b => {
          const checkIn = new Date(Math.max(new Date(b.check_in).getTime(), startDate.getTime()));
          const checkOut = new Date(Math.min(new Date(b.check_out).getTime(), endDate.getTime()));
          const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
          occupiedDays += Math.max(0, days);
        });

        const occupancyRate = totalDays > 0 ? Math.round((occupiedDays / totalDays) * 100) : 0;
        
        stats[house.name] = {
          total_days: totalDays,
          occupied_days: occupiedDays,
          vacant_days: totalDays - occupiedDays,
          occupancy_rate: occupancyRate,
          booking_count: bookings?.length || 0
        };
      }

      return {
        success: true,
        period: `${params.date_from} bis ${params.date_to}`,
        houses: stats
      };
    }

    async function executeGetGuestStatistics(params: any) {
      console.log('Executing get_guest_statistics with params:', params);
      
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('guest_email, guest_name, nationality, check_in, check_out, number_of_guests, houses!inner(rental_type)')
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled')
        .gte('check_in', params.date_from)
        .lte('check_out', params.date_to)
        .order('check_in', { ascending: true });

      if (error) {
        return { success: false, error: error.message };
      }

      const guestMap: Record<string, { bookings: number, total_nights: number, total_guests: number, first_booking: string, last_booking: string }> = {};
      const nationalityStats: Record<string, number> = {};
      
      bookings?.forEach(b => {
        const email = b.guest_email || 'unknown';
        if (!guestMap[email]) {
          guestMap[email] = {
            bookings: 0,
            total_nights: 0,
            total_guests: 0,
            first_booking: b.check_in,
            last_booking: b.check_in
          };
        }
        
        const nights = Math.ceil((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / (1000 * 60 * 60 * 24));
        guestMap[email].bookings++;
        guestMap[email].total_nights += nights;
        guestMap[email].total_guests += b.number_of_guests || 0;
        guestMap[email].last_booking = b.check_in;

        const nationality = b.nationality || 'Unbekannt';
        nationalityStats[nationality] = (nationalityStats[nationality] || 0) + 1;
      });

      const totalGuests = Object.keys(guestMap).length;
      const returningGuests = Object.values(guestMap).filter(g => g.bookings > 1).length;
      const newGuests = totalGuests - returningGuests;
      const totalNights = bookings?.reduce((sum, b) => {
        const nights = Math.ceil((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / (1000 * 60 * 60 * 24));
        return sum + nights;
      }, 0) || 0;
      const avgStayDuration = bookings && bookings.length > 0 ? Math.round(totalNights / bookings.length) : 0;

      return {
        success: true,
        period: `${params.date_from} bis ${params.date_to}`,
        summary: {
          total_guests: totalGuests,
          new_guests: newGuests,
          returning_guests: returningGuests,
          return_rate: totalGuests > 0 ? Math.round((returningGuests / totalGuests) * 100) : 0,
          total_bookings: bookings?.length || 0,
          avg_stay_duration: avgStayDuration
        },
        by_nationality: nationalityStats
      };
    }

    // PHASE 2: Mieter-Management Execute-Funktionen
    async function executeSearchTenantPayments(params: any) {
      console.log('Executing search_tenant_payments with params:', params);
      
      let query = supabase
        .from('tenant_payments')
        .select('*, houses!tenant_payments_house_id_fkey(name, address, tenant_info)');

      if (params.house_id) query = query.eq('house_id', params.house_id);
      if (params.status) query = query.eq('status', params.status);
      if (params.date_from) query = query.gte('due_date', params.date_from);
      if (params.date_to) query = query.lte('due_date', params.date_to);

      const { data, error } = await query.order('due_date', { ascending: false });

      if (error) {
        console.error('Error searching tenant payments:', error);
        return { success: false, error: error.message };
      }

      return { success: true, payments: data || [], count: data?.length || 0 };
    }

    async function executeGetTenantInfo(house_id: string) {
      console.log('Executing get_tenant_info for:', house_id);
      
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, address, rental_type, property_type, tenant_info')
        .eq('id', house_id)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.tenant_info) {
        return { 
          success: true, 
          house: data, 
          tenant_info: null,
          message: 'Keine Mietvertragsdaten für dieses Haus hinterlegt' 
        };
      }

      return {
        success: true,
        house: {
          id: data.id,
          name: data.name,
          address: data.address,
          rental_type: data.rental_type,
          property_type: data.property_type
        },
        tenant_info: data.tenant_info
      };
    }

    async function executeGetTenantAnalytics(params: any) {
      console.log('Executing get_tenant_analytics with params:', params);
      
      const { data: payments, error } = await supabase
        .from('tenant_payments')
        .select('*, houses!tenant_payments_house_id_fkey(name, tenant_info)')
        .gte('due_date', params.date_from)
        .lte('due_date', params.date_to);

      if (error) {
        return { success: false, error: error.message };
      }

      const totalRevenue = payments?.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const pendingAmount = payments?.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const overdueAmount = payments?.filter(p => p.status === 'overdue').reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      // Gruppiere nach Haus
      const byHouse: Record<string, any> = {};
      payments?.forEach(p => {
        const houseName = p.houses?.name || 'Unbekannt';
        if (!byHouse[houseName]) {
          byHouse[houseName] = {
            paid: 0,
            pending: 0,
            overdue: 0,
            total: 0
          };
        }
        const amount = p.amount || 0;
        byHouse[houseName][p.status] += amount;
        byHouse[houseName].total += amount;
      });

      return {
        success: true,
        period: `${params.date_from} bis ${params.date_to}`,
        summary: {
          total_revenue: totalRevenue,
          pending_amount: pendingAmount,
          overdue_amount: overdueAmount,
          payment_count: payments?.length || 0
        },
        by_house: byHouse
      };
    }

    // PHASE 3: Schreibzugriffe Execute-Funktionen
    async function executeCreateLinenOrder(params: any) {
      console.log('Executing create_linen_order with params:', params);
      
      const orderData: any = {
        house_id: params.house_id,
        delivery_date: params.delivery_date,
        order_items: params.items,
        status: 'offen',
        order_source: 'manual',
        order_date: new Date().toISOString()
      };

      if (params.booking_id) orderData.booking_id = params.booking_id;
      if (params.notes) orderData.notes = params.notes;

      const { data, error } = await supabase
        .from('linen_orders')
        .insert([orderData])
        .select()
        .single();

      if (error) {
        console.error('Error creating linen order:', error);
        return { success: false, error: error.message };
      }

      return { 
        success: true, 
        order: data, 
        message: 'Wäschebestellung erfolgreich erstellt' 
      };
    }

    async function executeUpdateLinenOrderStatus(order_id: string, new_status: string) {
      console.log('Executing update_linen_order_status:', { order_id, new_status });
      
      const { data, error } = await supabase
        .from('linen_orders')
        .update({ status: new_status })
        .eq('id', order_id)
        .select()
        .single();

      if (error) {
        console.error('Error updating linen order status:', error);
        return { success: false, error: error.message };
      }

      return { 
        success: true, 
        order: data, 
        message: `Status erfolgreich auf '${new_status}' geändert` 
      };
    }

    async function executeUpdateCleaningTask(task_id: string, params: any) {
      console.log('Executing update_cleaning_task:', { task_id, params });
      
      const updateData: any = {};
      if (params.scheduled_date) updateData.scheduled_date = params.scheduled_date;
      if (params.scheduled_time) updateData.scheduled_time = params.scheduled_time;
      if (params.status) updateData.status = params.status;
      if (params.notes) updateData.notes = params.notes;

      const { data, error } = await supabase
        .from('service_tasks')
        .update(updateData)
        .eq('id', task_id)
        .select()
        .single();

      if (error) {
        console.error('Error updating cleaning task:', error);
        return { success: false, error: error.message };
      }

      return { 
        success: true, 
        task: data, 
        message: 'Reinigungsauftrag erfolgreich aktualisiert' 
      };
    }

    async function executeAssignCleaningStaff(task_id: string, staff_id: string, provider_id?: string) {
      console.log('Executing assign_cleaning_staff:', { task_id, staff_id, provider_id });
      
      const updateData: any = { assigned_staff_id: staff_id };
      if (provider_id) updateData.provider_id = provider_id;

      const { data, error } = await supabase
        .from('service_tasks')
        .update(updateData)
        .eq('id', task_id)
        .select()
        .single();

      if (error) {
        console.error('Error assigning cleaning staff:', error);
        return { success: false, error: error.message };
      }

      return { 
        success: true, 
        task: data, 
        message: 'Reinigungspersonal erfolgreich zugewiesen' 
      };
    }

    // PHASE 4: Vacancy Analysis
    async function executeGetVacancies(params: any) {
      console.log('Executing get_vacancies with params:', params);
      
      const minDays = params.min_days || 3;
      const monthsAhead = params.months_ahead || 6;
      const today = new Date();
      const endDate = new Date(today.getTime() + (monthsAhead * 30 * 24 * 60 * 60 * 1000));

      // Helper: Calculate days between dates
      const daysBetween = (start: Date, end: Date) => 
        Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // Helper: Assess urgency
      const assessUrgency = (startDate: Date, days: number): 'high' | 'medium' | 'low' => {
        const daysUntilStart = daysBetween(today, startDate);
        const month = startDate.getMonth();
        const isHighSeason = month === 11 || month === 0 || month === 1; // Dec, Jan, Feb
        
        if ((isHighSeason && days >= 3) || (daysUntilStart <= 30 && days >= 3)) return 'high';
        if (daysUntilStart <= 60 && days >= 3) return 'medium';
        return 'low';
      };

      // Helper: Get season name
      const getSeasonName = (date: Date): string => {
        const month = date.getMonth();
        if ([11, 0, 1].includes(month)) return '🔥 Hochsaison';
        if ([2, 3, 9, 10].includes(month)) return '📅 Übergangssaison';
        return '🌿 Nebensaison';
      };

      // Fetch tourist houses
      let housesQuery = supabase
        .from('houses')
        .select('id, name, address')
        .eq('rental_type', 'tourist');
      
      if (params.house_id) {
        housesQuery = housesQuery.eq('id', params.house_id);
      }

      const { data: houses, error: housesError } = await housesQuery;
      if (housesError) {
        console.error('Error fetching houses:', housesError);
        return { success: false, error: housesError.message };
      }

      if (!houses || houses.length === 0) {
        return { 
          success: true, 
          vacancies: [], 
          message: 'Keine touristischen Häuser gefunden' 
        };
      }

      const allVacancies: any[] = [];

      // Process each house
      for (const house of houses) {
        // Fetch confirmed bookings for this house
        const { data: bookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('check_in, check_out, status')
          .eq('house_id', house.id)
          .eq('status', 'confirmed')
          .gte('check_out', today.toISOString().split('T')[0])
          .lte('check_in', endDate.toISOString().split('T')[0])
          .order('check_in', { ascending: true });

        if (bookingsError) {
          console.error(`Error fetching bookings for house ${house.id}:`, bookingsError);
          continue;
        }

        // Find vacancies
        const sortedBookings = (bookings || [])
          .filter(b => b.status !== 'cancelled')
          .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

        let currentDate = today;

        sortedBookings.forEach((booking, index) => {
          const bookingStart = new Date(booking.check_in);
          
          if (currentDate < bookingStart) {
            const gapDays = daysBetween(currentDate, bookingStart);
            if (gapDays >= minDays) {
              const urgency = assessUrgency(currentDate, gapDays);
              const daysUntilStart = daysBetween(today, currentDate);
              
              allVacancies.push({
                house_id: house.id,
                house_name: house.name,
                start: currentDate.toISOString().split('T')[0],
                end: bookingStart.toISOString().split('T')[0],
                days: gapDays,
                urgency,
                season: getSeasonName(currentDate),
                days_until_start: daysUntilStart
              });
            }
          }
          
          currentDate = new Date(Math.max(currentDate.getTime(), new Date(booking.check_out).getTime()));
        });

        // Check gap at the end
        if (currentDate < endDate) {
          const gapDays = daysBetween(currentDate, endDate);
          if (gapDays >= minDays) {
            const urgency = assessUrgency(currentDate, gapDays);
            const daysUntilStart = daysBetween(today, currentDate);
            
            allVacancies.push({
              house_id: house.id,
              house_name: house.name,
              start: currentDate.toISOString().split('T')[0],
              end: endDate.toISOString().split('T')[0],
              days: gapDays,
              urgency,
              season: getSeasonName(currentDate),
              days_until_start: daysUntilStart
            });
          }
        }
      }

      // Sort by urgency and days_until_start
      allVacancies.sort((a, b) => {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.days_until_start - b.days_until_start;
      });

      console.log(`Found ${allVacancies.length} vacancies`);
      return { 
        success: true, 
        vacancies: allVacancies, 
        count: allVacancies.length 
      };
    }

    async function executeAnalyzeVacancyWithAI(house_id: string, vacancy_start: string, vacancy_end: string) {
      console.log('Executing analyze_vacancy_with_ai:', { house_id, vacancy_start, vacancy_end });
      
      // Calculate days
      const start = new Date(vacancy_start);
      const end = new Date(vacancy_end);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // Call the analyze-vacancy edge function
      const { data, error } = await supabase.functions.invoke('analyze-vacancy', {
        body: {
          vacancy: {
            start: vacancy_start,
            end: vacancy_end,
            days
          },
          houseId: house_id
        }
      });

      if (error) {
        console.error('Error calling analyze-vacancy:', error);
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        return { 
          success: false, 
          error: data?.error || 'AI-Analyse fehlgeschlagen' 
        };
      }

      return { 
        success: true, 
        analysis: data.analysis,
        message: 'KI-Analyse erfolgreich abgeschlossen'
      };
    }

    // PHASE 5: Marketing Reminders
    async function executeGetMarketingReminders(params: any) {
      console.log('Executing get_marketing_reminders with params:', params);
      
      const includeApplied = params.include_applied || false;
      const daysAhead = params.days_ahead || 90;
      
      // 1. Aktive Marketing-Aktionen laden
      const { data: actions, error: actionsError } = await supabase
        .from('marketing_actions')
        .select('*')
        .eq('status', 'active');
      
      if (actionsError) {
        console.error('Error loading marketing actions:', actionsError);
        return { success: false, error: actionsError.message };
      }
      
      if (!actions || actions.length === 0) {
        return { 
          success: true, 
          reminders: [], 
          message: 'Keine aktiven Marketing-Aktionen vorhanden.',
          totalActions: 0
        };
      }
      
      // 2. Zukünftige touristische Buchungen laden
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const currentDate = new Date().toISOString().split('T')[0];
      
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, guest_name, guest_email, check_in, check_out, 
          number_of_guests, number_of_adults, number_of_children,
          booking_amount, nationality,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .gte('check_in', currentDate)
        .lte('check_in', futureDate.toISOString())
        .eq('status', 'confirmed')
        .eq('houses.rental_type', 'tourist')
        .order('check_in');
      
      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError);
        return { success: false, error: bookingsError.message };
      }
      
      // 3. Tracking-Daten laden
      const bookingIds = bookings?.map(b => b.id) || [];
      const { data: tracking } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .in('booking_id', bookingIds);
      
      // 4. Für jede Buchung prüfen welche Aktionen zutreffen
      const reminders: any[] = [];
      
      bookings?.forEach(booking => {
        const matchingActions: any[] = [];
        
        actions.forEach(action => {
          const criteria = action.target_criteria || {};
          let matches = true;
          
          // has_children: Prüfen ob Kinder vorhanden
          if (criteria.has_children && (!booking.number_of_children || booking.number_of_children <= 0)) {
            matches = false;
          }
          
          // min_nights: Mindestaufenthalt prüfen
          if (criteria.min_nights && booking.check_in && booking.check_out) {
            const checkIn = new Date(booking.check_in);
            const checkOut = new Date(booking.check_out);
            const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
            if (nights < criteria.min_nights) {
              matches = false;
            }
          }
          
          // nationality: Nationalität prüfen
          if (criteria.nationality && booking.nationality) {
            if (!booking.nationality.toLowerCase().includes(criteria.nationality.toLowerCase())) {
              matches = false;
            }
          }
          
          // booking_amount_min: Mindestbetrag prüfen
          if (criteria.booking_amount_min && (!booking.booking_amount || booking.booking_amount < criteria.booking_amount_min)) {
            matches = false;
          }
          
          if (matches) {
            const trackingEntry = tracking?.find(
              t => t.booking_id === booking.id && t.action_id === action.id
            );
            const isApplied = trackingEntry?.action_applied || false;
            
            // Filter basierend auf include_applied
            if (includeApplied || !isApplied) {
              matchingActions.push({
                action_id: action.id,
                action_name: action.name,
                action_description: action.description,
                is_applied: isApplied,
                applied_at: trackingEntry?.applied_at
              });
            }
          }
        });
        
        if (matchingActions.length > 0) {
          const daysUntilCheckIn = Math.ceil(
            (new Date(booking.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          const isFamily = (booking.number_of_children || 0) > 0;
          
          reminders.push({
            booking_id: booking.id,
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            house_name: booking.houses?.name || 'Unbekannt',
            check_in: booking.check_in,
            check_out: booking.check_out,
            days_until_check_in: daysUntilCheckIn,
            number_of_guests: booking.number_of_guests,
            number_of_children: booking.number_of_children,
            is_family: isFamily,
            matching_actions: matchingActions
          });
        }
      });
      
      // Nach Check-in-Datum sortieren
      reminders.sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
      
      console.log(`Found ${reminders.length} bookings with marketing reminders`);
      
      return {
        success: true,
        reminders,
        totalActions: actions.length,
        totalBookingsWithActions: reminders.length,
        message: reminders.length > 0 
          ? `${reminders.length} Buchung(en) mit relevanten Marketing-Aktionen gefunden.`
          : 'Keine Buchungen mit passenden Marketing-Aktionen gefunden.'
      };
    }

    // PHASE 6: Rating Reminders
    async function executeGetRatingReminders(params: any) {
      console.log('Executing get_rating_reminders with params:', params);
      
      // Settings aus Datenbank laden
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'rating_reminder_settings')
        .maybeSingle();
      
      const defaultSettings = {
        is_enabled: true,
        min_days_after_checkout: 14,
        max_days_after_checkout: 90,
        require_platform: true,
        rental_type_filter: 'tourist'
      };
      
      const settings = { ...defaultSettings, ...(settingsData?.value as any || {}) };
      
      // Prüfen ob Feature deaktiviert
      if (!settings.is_enabled) {
        return {
          success: true,
          reminders: [],
          message: 'Bewertungs-Erinnerungen sind in den Einstellungen deaktiviert.'
        };
      }
      
      const minDays = params.min_days_after_checkout || settings.min_days_after_checkout;
      const maxDays = params.max_days_after_checkout || settings.max_days_after_checkout;
      const marketingOnly = params.marketing_only || false;
      
      const today = new Date();
      const minCheckoutDate = new Date(today.getTime() - (maxDays * 24 * 60 * 60 * 1000));
      const maxCheckoutDate = new Date(today.getTime() - (minDays * 24 * 60 * 60 * 1000));
      
      // 1. Buchungen ohne Bewertung laden (basierend auf Settings)
      let query = supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          check_out,
          platform,
          house_id,
          number_of_children,
          external_rating,
          rating_not_expected,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .eq('status', 'completed')
        .gte('check_out', minCheckoutDate.toISOString())
        .lte('check_out', maxCheckoutDate.toISOString())
        .is('external_rating', null)
        .or('rating_not_expected.is.null,rating_not_expected.eq.false')
        .order('check_out', { ascending: false });
      
      // Plattform-Filter anwenden wenn aktiviert
      if (settings.require_platform) {
        query = query.not('platform', 'is', null);
      }
      
      // Rental-Type Filter anwenden
      if (settings.rental_type_filter !== 'all') {
        query = query.eq('houses.rental_type', settings.rental_type_filter);
      }
      
      const { data: bookings, error: bookingsError } = await query;
      
      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError);
        return { success: false, error: bookingsError.message };
      }
      
      if (!bookings || bookings.length === 0) {
        return {
          success: true,
          reminders: [],
          message: 'Keine ausstehenden Bewertungen gefunden.'
        };
      }
      
      // 2. Aktive Marketing-Aktionen laden
      const { data: actions } = await supabase
        .from('marketing_actions')
        .select('id, name, target_criteria')
        .eq('status', 'active');
      
      // 3. Tracking-Daten laden
      const bookingIds = bookings.map(b => b.id);
      const { data: tracking } = await supabase
        .from('booking_action_tracking')
        .select('*')
        .in('booking_id', bookingIds)
        .eq('action_applied', true);
      
      // 4. Für jede Buchung prüfen
      const reminders: any[] = [];
      
      bookings.forEach(booking => {
        const daysSinceCheckout = Math.floor(
          (today.getTime() - new Date(booking.check_out).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Finde passende Marketing-Aktion mit angewendetem Tracking
        let isMarketingCandidate = false;
        let marketingActionName = null;
        
        if (actions) {
          for (const action of actions) {
            const criteria = action.target_criteria || {};
            let matches = true;
            
            // Prüfe has_children Kriterium
            if (criteria.has_children && (!booking.number_of_children || booking.number_of_children <= 0)) {
              matches = false;
            }
            
            if (matches) {
              // Prüfe ob Aktion angewendet wurde
              const trackingEntry = tracking?.find(
                t => t.booking_id === booking.id && t.action_id === action.id
              );
              
              if (trackingEntry?.action_applied) {
                isMarketingCandidate = true;
                marketingActionName = action.name;
                break;
              }
            }
          }
        }
        
        // Filter basierend auf marketing_only
        if (marketingOnly && !isMarketingCandidate) {
          return;
        }
        
        reminders.push({
          booking_id: booking.id,
          guest_name: booking.guest_name,
          guest_email: booking.guest_email,
          check_out: booking.check_out,
          platform: booking.platform,
          house_name: (booking.houses as any)?.name || 'Unbekannt',
          days_since_checkout: daysSinceCheckout,
          is_marketing_candidate: isMarketingCandidate,
          marketing_action_name: marketingActionName,
          number_of_children: booking.number_of_children
        });
      });
      
      // Sortieren: Marketing-Kandidaten zuerst
      reminders.sort((a, b) => {
        if (a.is_marketing_candidate && !b.is_marketing_candidate) return -1;
        if (!a.is_marketing_candidate && b.is_marketing_candidate) return 1;
        return b.days_since_checkout - a.days_since_checkout;
      });
      
      const marketingCount = reminders.filter(r => r.is_marketing_candidate).length;
      
      console.log(`Found ${reminders.length} rating reminders (${marketingCount} marketing priority)`);
      
      return {
        success: true,
        reminders,
        totalCount: reminders.length,
        marketingPriorityCount: marketingCount,
        message: reminders.length > 0 
          ? `${reminders.length} Buchung(en) ohne Bewertung gefunden${marketingCount > 0 ? ` (${marketingCount} mit Marketing-Priorität)` : ''}.`
          : 'Keine ausstehenden Bewertungen gefunden.'
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
          case 'generate_booking_linen_order':
            return await executeGenerateBookingLinenOrder(args.booking_id);
          case 'get_calendar_events':
            return await executeGetCalendarEvents(args);
          case 'search_service_providers':
            return await executeSearchServiceProviders(args);
          case 'get_house_bookings_summary':
            return await executeGetHouseBookingsSummary(args.house_id, args.timeframe);
          case 'search_cleaning_staff':
            return await executeSearchCleaningStaff(args);
          // PHASE 1: Finanz-Statistiken
          case 'get_revenue_stats':
            return await executeGetRevenueStats(args);
          case 'get_occupancy_stats':
            return await executeGetOccupancyStats(args);
          case 'get_guest_statistics':
            return await executeGetGuestStatistics(args);
          // PHASE 2: Mieter-Management
          case 'search_tenant_payments':
            return await executeSearchTenantPayments(args);
          case 'get_tenant_info':
            return await executeGetTenantInfo(args.house_id);
          case 'get_tenant_analytics':
            return await executeGetTenantAnalytics(args);
          // PHASE 3: Schreibzugriffe
          case 'create_linen_order':
            return await executeCreateLinenOrder(args);
          case 'update_linen_order_status':
            return await executeUpdateLinenOrderStatus(args.order_id, args.new_status);
          case 'update_cleaning_task':
            return await executeUpdateCleaningTask(args.task_id, args);
          case 'assign_cleaning_staff':
            return await executeAssignCleaningStaff(args.task_id, args.staff_id, args.provider_id);
          // PHASE 4: Vacancy Analysis
          case 'get_vacancies':
            return await executeGetVacancies(args);
          case 'analyze_vacancy_with_ai':
            return await executeAnalyzeVacancyWithAI(args.house_id, args.vacancy_start, args.vacancy_end);
          // PHASE 5: Marketing Reminders
          case 'get_marketing_reminders':
            return await executeGetMarketingReminders(args);
          // PHASE 6: Rating Reminders
          case 'get_rating_reminders':
            return await executeGetRatingReminders(args);
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

        // NEW: Vacancies formatting
        if (result.vacancies && Array.isArray(result.vacancies)) {
          resultsText += `\n\nGefundene Lücken (${result.count}):\n`;
          result.vacancies.forEach((v: any, i: number) => {
            const urgencyEmoji = v.urgency === 'high' ? '🔴' : v.urgency === 'medium' ? '🟡' : '🟢';
            resultsText += `\nLücke ${i + 1} (${v.house_name}):\n`;
            resultsText += `- Zeitraum: ${new Date(v.start).toLocaleDateString('de-DE')} - ${new Date(v.end).toLocaleDateString('de-DE')} (${v.days} Tage)\n`;
            resultsText += `- Dringlichkeit: ${urgencyEmoji} ${v.urgency.toUpperCase()}\n`;
            resultsText += `- Saison: ${v.season}\n`;
            resultsText += `- Status: In ${v.days_until_start} Tagen\n`;
            
            entityLinks.push({
              id: v.house_id,
              type: 'house',
              label: `${v.house_name} - Lücke ${i + 1}`
            });
          });
          
          if (result.vacancies.length > 0) {
            resultsText += `\n💡 Tipp: Sage "Analysiere Lücke 1 vom [Hausname]" für detaillierte KI-Empfehlungen\n`;
          }
        }

        // NEW: AI Vacancy Analysis formatting
        if (result.analysis) {
          const a = result.analysis;
          resultsText += `\n\n🤖 KI-ANALYSE:\n`;
          resultsText += `📊 Buchungswahrscheinlichkeit: ${a.bookingProbability}%\n`;
          resultsText += `💰 Preisempfehlung:\n`;
          resultsText += `   • Pro Nacht: €${a.suggestedPriceMin} - €${a.suggestedPriceMax}\n`;
          resultsText += `   • Pro Woche (7 Nächte): €${a.suggestedPriceMin * 7} - €${a.suggestedPriceMax * 7}\n`;
          resultsText += `🎯 Dringlichkeit: ${a.urgency.toUpperCase()}\n`;
          resultsText += `⏰ Deadline: ${new Date(a.deadline).toLocaleDateString('de-DE')}\n\n`;
          resultsText += `💭 BEGRÜNDUNG:\n${a.reasoning}\n\n`;
          resultsText += `📋 EMPFOHLENE MAßNAHMEN:\n`;
          a.actions.forEach((act: any, i: number) => {
            resultsText += `${i + 1}️⃣ [Prio ${act.priority}] ${act.action}\n`;
            resultsText += `   → ${act.reason}\n\n`;
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
