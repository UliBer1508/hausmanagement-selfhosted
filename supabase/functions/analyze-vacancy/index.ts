import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { geminiStructuredOutput, GeminiRateLimitError, GeminiAPIError } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VacancyAnalysis {
  bookingProbability: number;
  suggestedPriceMin: number;
  suggestedPriceMax: number;
  reasoning: string;
  actions: Array<{
    priority: number;
    action: string;
    reason: string;
  }>;
  urgency: 'niedrig' | 'mittel' | 'hoch' | 'kritisch';
  deadline: string;
}

interface AdditionalFees {
  cleaning_fee_per_stay?: number;
  electricity_fee_per_stay?: number;
  linen_fee_per_stay?: number;
  service_fee_per_stay?: number;
  tourist_tax_per_night?: number;
  vat_percentage?: number;
}

// Fix (2026-09-06): identische Formel wie im Frontend
// (src/components/Guests/GuestAnalytics.tsx -> calculateRealPricePerNight).
// Bewusst NICHT neu erfunden, um genau den "Doppelgänger"-Fehler zu vermeiden,
// der diesen Bug verursacht hat (zwei Preis-Berechnungen, die auseinanderlaufen).
function calculateRealPricePerNight(
  bookingAmount: number,
  nights: number,
  guests: number,
  additionalFees: AdditionalFees | null | undefined
): number | null {
  if (!bookingAmount || !nights || nights <= 0) return null;

  const fees = additionalFees || {};
  const fixedCosts =
    (fees.cleaning_fee_per_stay || 0) +
    (fees.electricity_fee_per_stay || 0) +
    (fees.linen_fee_per_stay || 0) +
    (fees.service_fee_per_stay || 0);

  const variableCosts = (fees.tourist_tax_per_night || 0) * nights * (guests || 1);
  const totalAdditionalCosts = fixedCosts + variableCosts;

  const realPricePerNight = Math.max(0, (bookingAmount - totalAdditionalCosts) / nights);
  return Math.round(realPricePerNight * 100) / 100;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

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
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');

    if (!geminiApiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fix (2026-09-06): additional_fees mitladen, um wie im Frontend
    // echte Nachtpreise (ohne Nebenkosten) statt Rohsummen zu berechnen.
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('name, address, additional_fees')
      .eq('id', houseId)
      .single();

    if (houseError) throw houseError;

    const additionalFees = house.additional_fees as AdditionalFees | null;

    // Load historical bookings for this house
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, guests!bookings_guest_id_fkey(nationality)')
      .eq('house_id', houseId)
      .eq('status', 'confirmed')
      .order('check_in', { ascending: false })
      .limit(50);

    if (bookingsError) throw bookingsError;

    // Fix (2026-09-06): pro Buchung Nächte + ECHTEN Preis/Nacht berechnen.
    // Vorher wurde nur der rohe Gesamtbetrag (booking_amount) an Gemini
    // gegeben - ohne Bezug zur Aufenthaltsdauer und ohne Einheit. Das führte
    // dazu, dass die KI Gesamtsummen mehrtägiger/mehrwöchiger Aufenthalte
    // fälschlich als Preis PRO NACHT interpretiert hat.
    const bookingsWithRealPrice = bookings.map((b: any) => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const pricePerNightReal = calculateRealPricePerNight(
        b.booking_amount || 0,
        nights,
        b.number_of_guests,
        additionalFees
      );
      return { ...b, __nights: nights, __pricePerNightReal: pricePerNightReal };
    });

    // Calculate monthly statistics (jetzt auf Basis von Preis/Nacht, nicht Rohsumme)
    const monthlyStats = bookingsWithRealPrice.reduce((acc: Record<number, any>, booking: any) => {
      const month = new Date(booking.check_in).getMonth();
      if (!acc[month]) {
        acc[month] = { count: 0, pricesPerNight: [] as number[], nationalities: {} as Record<string, number> };
      }
      acc[month].count++;
      if (booking.__pricePerNightReal !== null) {
        acc[month].pricesPerNight.push(booking.__pricePerNightReal);
      }

      // Etappe 4: Nationalitaet aus der guests-Relation
      const nat = booking.guests?.nationality || booking.nationality || 'unknown';
      acc[month].nationalities[nat] = (acc[month].nationalities[nat] || 0) + 1;

      return acc;
    }, {} as Record<number, any>);

    // Get current date
    const currentDate = new Date().toISOString().split('T')[0];
    const vacancyMonth = new Date(vacancy.start).getMonth();
    const monthName = new Date(vacancy.start).toLocaleString('de-DE', { month: 'long' });

    const monthStatsRaw = monthlyStats[vacancyMonth];
    const monthAvgPricePerNight = monthStatsRaw ? average(monthStatsRaw.pricesPerNight) : null;
    const monthMinPricePerNight = monthStatsRaw && monthStatsRaw.pricesPerNight.length
      ? Math.min(...monthStatsRaw.pricesPerNight) : null;
    const monthMaxPricePerNight = monthStatsRaw && monthStatsRaw.pricesPerNight.length
      ? Math.max(...monthStatsRaw.pricesPerNight) : null;

    // Fix (2026-09-06): Gesamtdurchschnitt über alle Monate als Rückfalloption,
    // damit die KI auch ohne Daten für den Ziel-Monat einen echten Anker hat -
    // statt aus Buchungen anderer Saisons eine Nacht-Fehlinterpretation abzuleiten.
    const allPricesPerNight = bookingsWithRealPrice
      .map((b: any) => b.__pricePerNightReal)
      .filter((p: number | null): p is number => p !== null);
    const overallAvgPricePerNight = average(allPricesPerNight);
    const overallMinPricePerNight = allPricesPerNight.length ? Math.min(...allPricesPerNight) : null;
    const overallMaxPricePerNight = allPricesPerNight.length ? Math.max(...allPricesPerNight) : null;

    // Referenzwert für die Plausibilitätsgrenze weiter unten:
    // bevorzugt Monatsdurchschnitt, sonst Gesamtdurchschnitt.
    const referencePricePerNight = monthAvgPricePerNight ?? overallAvgPricePerNight;

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
      // Fix (2026-09-06): alle Preisangaben sind EXPLIZIT "pro Nacht", bereits
      // um Nebenkosten (Reinigung, Strom, Wäsche, Service, Kurtaxe) bereinigt -
      // exakt dieselbe Rechnung wie in der lokalen ML-Preisempfehlung
      // (calculateRealPricePerNight in GuestAnalytics.tsx).
      historischerPreisProNachtEUR: {
        hinweis: "Alle Werte in diesem Block sind bereits Preis PRO NACHT nach Abzug der Nebenkosten. NICHT mit Gesamtbeträgen verwechseln.",
        zielMonat: {
          monat: monthName,
          anzahlBuchungen: monthStatsRaw?.count || 0,
          durchschnittProNacht: monthAvgPricePerNight,
          minProNacht: monthMinPricePerNight,
          maxProNacht: monthMaxPricePerNight,
        },
        gesamtDurchschnittAllerMonate: {
          anzahlBuchungen: bookings.length,
          durchschnittProNacht: overallAvgPricePerNight,
          minProNacht: overallMinPricePerNight,
          maxProNacht: overallMaxPricePerNight,
        },
      },
      historicalData: {
        totalBookings: bookings.length,
        monthlyStats: {
          count: monthStatsRaw?.count || 0,
          nationalities: monthStatsRaw?.nationalities || {},
        },
        // Fix (2026-09-06): statt "amount" (Gesamtsumme) jetzt Nächte UND
        // Preis/Nacht explizit getrennt ausgewiesen.
        recentBookings: bookingsWithRealPrice.slice(0, 5).map((b: any) => ({
          checkIn: b.check_in,
          checkOut: b.check_out,
          naechte: b.__nights,
          guests: b.number_of_guests,
          gesamtbetragEURFuerGanzenAufenthalt: b.booking_amount,
          preisProNachtEUR: b.__pricePerNightReal,
          nationality: b.guests?.nationality || b.nationality,
          platform: b.platform,
        })),
      },
    };

    const systemPrompt = `Du bist ein KI-Assistent für Ferienhaus-Vermietung in der österreichischen Ski-Region. 
            
Deine Aufgabe: Analysiere freie Zeiträume (Lücken) und gib konkrete, priorisierte Handlungsempfehlungen.

KONTEXT:
- Region: Österreichische Alpen (Ski-Resort)
- Hauptgäste: Niederländer und Belgier
- Hochsaison: Dezember-März (Ski), Juli-August (Sommer)
- Nebensaison: April-Juni, September-November

WICHTIG ZUR PREISEINHEIT (unbedingt beachten):
- "suggestedPriceMin" und "suggestedPriceMax" sind IMMER ein Preis PRO NACHT in EUR.
- Nutze dafür ausschließlich die Werte aus "historischerPreisProNachtEUR" (bereits pro Nacht berechnet).
- Verwende NIEMALS "gesamtbetragEURFuerGanzenAufenthalt" aus "recentBookings" als Nachtpreis - das ist die Summe für den GESAMTEN Aufenthalt (oft mehrere Nächte oder Wochen) und muss ignoriert werden, wenn du den Preis pro Nacht bestimmst.
- Liegt für den Ziel-Monat kein Wert vor (anzahlBuchungen = 0), orientiere dich am "gesamtDurchschnittAllerMonate" und passe ihn saisonal an (siehe Saison-Regeln unten), statt eine Zahl zu erfinden.
- Eine plausible Nachtpreis-Spanne für dieses Haus bewegt sich üblicherweise im ein- bis niedrigen dreistelligen Euro-Bereich, nicht im drei- oder vierstelligen Bereich.

ANALYSE-KRITERIEN:
1. Lead-Time: Je näher der Termin, desto dringender
2. Saisonalität: Hochsaison = höhere Wahrscheinlichkeit
3. Historische Daten: Preise PRO NACHT (siehe historischerPreisProNachtEUR) und Buchungsraten
4. Aktuelle Trends: Letzte Buchungen als Indikator, aber NUR für Wahrscheinlichkeit/Saisonmuster - nicht für den Nachtpreis, wenn sie aus einer anderen Saison stammen

Liefere eine strukturierte Analyse mit:
- Buchungswahrscheinlichkeit (0-100%)
- Empfohlene Preisspanne PRO NACHT
- Natürlichsprachliche Begründung
- 3-5 konkrete, priorisierte Maßnahmen
- Dringlichkeitsstufe (niedrig/mittel/hoch/kritisch)
- Deadline bis wann gehandelt werden sollte`;

    const userPrompt = `Analysiere diese Buchungslücke:\n\n${JSON.stringify(context, null, 2)}\n\nGib eine fundierte Empfehlung basierend auf den historischen Preisen PRO NACHT (nicht Gesamtbeträgen).`;

    const tool = {
      name: 'provide_vacancy_analysis',
      description: 'Liefert eine strukturierte Analyse der Buchungslücke mit Wahrscheinlichkeit, Preisempfehlung pro Nacht und konkreten Maßnahmen',
      parameters: {
        type: 'object',
        properties: {
          bookingProbability: {
            type: 'number',
            description: 'Wahrscheinlichkeit einer Buchung in Prozent (0-100)',
          },
          suggestedPriceMin: {
            type: 'number',
            description: 'Empfohlener Mindestpreis in EUR PRO NACHT (niemals der Gesamtbetrag eines mehrtägigen/mehrwöchigen Aufenthalts)',
          },
          suggestedPriceMax: {
            type: 'number',
            description: 'Empfohlener Maximalpreis in EUR PRO NACHT (niemals der Gesamtbetrag eines mehrtägigen/mehrwöchigen Aufenthalts)',
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
    };

    console.log('Calling Gemini API for vacancy analysis');

    const analysis = await geminiStructuredOutput<VacancyAnalysis>(
      geminiApiKey,
      systemPrompt,
      userPrompt,
      tool
    );

    // Fix (2026-09-06): Plausibilitätsgrenze. Falls Gemini trotz der
    // Klarstellungen einen unplausiblen Nachtpreis liefert (z.B. weil für
    // Haus + Monat noch nie Daten vorlagen), wird die Empfehlung auf einen
    // Korridor um den historischen Durchschnitt gekappt, statt ungeprüft
    // angezeigt zu werden. Das verdeckt keinen Fehler, sondern verhindert
    // nur, dass ein einzelner KI-Ausreißer bis auf den Bildschirm kommt -
    // im "reasoning" wird ein Kappen immer sichtbar vermerkt.
    const MIN_FACTOR = 0.4;
    const MAX_FACTOR = 2.5;
    let clamped = false;

    if (referencePricePerNight && referencePricePerNight > 0) {
      const floor = Math.round(referencePricePerNight * MIN_FACTOR);
      const ceiling = Math.round(referencePricePerNight * MAX_FACTOR);

      const originalMin = analysis.suggestedPriceMin;
      const originalMax = analysis.suggestedPriceMax;

      if (analysis.suggestedPriceMin < floor || analysis.suggestedPriceMin > ceiling) {
        analysis.suggestedPriceMin = Math.min(Math.max(analysis.suggestedPriceMin, floor), ceiling);
        clamped = true;
      }
      if (analysis.suggestedPriceMax < floor || analysis.suggestedPriceMax > ceiling) {
        analysis.suggestedPriceMax = Math.min(Math.max(analysis.suggestedPriceMax, floor), ceiling);
        clamped = true;
      }
      if (analysis.suggestedPriceMin > analysis.suggestedPriceMax) {
        analysis.suggestedPriceMax = analysis.suggestedPriceMin;
      }

      if (clamped) {
        console.warn(
          `analyze-vacancy: Preisempfehlung außerhalb des Plausibilitätskorridors ` +
          `(historischer Nachtpreis ~€${Math.round(referencePricePerNight)}) - ` +
          `KI lieferte €${originalMin}-€${originalMax}, gekappt auf €${analysis.suggestedPriceMin}-€${analysis.suggestedPriceMax}.`
        );
        analysis.reasoning +=
          ` (Hinweis: Die ursprüngliche KI-Preisspanne (€${originalMin}-€${originalMax}/Nacht) lag ` +
          `deutlich außerhalb des historischen Durchschnitts von ca. €${Math.round(referencePricePerNight)}/Nacht ` +
          `und wurde deshalb auf €${analysis.suggestedPriceMin}-€${analysis.suggestedPriceMax}/Nacht angepasst.)`;
      }
    } else {
      console.warn('analyze-vacancy: Kein historischer Preis/Nacht-Referenzwert vorhanden - keine Plausibilitätsprüfung möglich.');
    }

    console.log('Vacancy analysis completed:', analysis);

    return new Response(JSON.stringify({
      success: true,
      analysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-vacancy:', error);

    if (error instanceof GeminiRateLimitError) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Please try again later.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
