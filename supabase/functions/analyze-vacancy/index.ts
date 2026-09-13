import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { geminiStructuredOutput, GeminiRateLimitError, GeminiAPIError } from "../_shared/gemini.ts";
import { grossFromNet, loadPlatformMarkups } from "../_shared/platformMarkup.ts";

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

/** Default, den airroi-sync bei unbrauchbarer API-Antwort schreibt (CODE-INDEX Modul 12). */
const AIRROI_FALLBACK_ADR = 120;

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
      .select('name, address, additional_fees, pricing_config')
      .eq('id', houseId)
      .single();

    if (houseError) throw houseError;

    const additionalFees = house.additional_fees as AdditionalFees | null;

    // Fix (13.09.2026): Mindest-/Hoechstpreis aus houses.pricing_config
    // (gepflegt im Preise-Tab, PricingConfigCard). Die KI-Analyse hat diese
    // Grenzen vorher komplett ignoriert und Preise unterhalb des
    // Mindestpreises empfohlen - bei Venediger 280-330 EUR gegen einen
    // Mindestpreis von 445 EUR.
    const hausPreisCfg = (house.pricing_config ?? {}) as Record<string, unknown>;
    const alsZahl = (v: unknown) =>
      Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const minPreis = alsZahl(hausPreisCfg.min_price);
    const maxPreis = alsZahl(hausPreisCfg.max_price);
    const basisPreis = alsZahl(hausPreisCfg.base_price);

    // Fix (2026-09-12): Wettbewerberpreise laden. Mirror von
    // useHouseCompetitorPricing (src/hooks/useCompetitorAnalysis.ts) — bewusst
    // NICHT scrape-competitor-prices/search-competitors nutzen, die liefern laut
    // docs/CODE-INDEX.md keine Daten mehr (Portale blocken automatisiertes
    // Scraping). Einzige aktuell funktionierende Quelle: manuell über
    // ManualCompetitorDialog erfasste weekly_pricing-Einträge (source='manual').
    const vacancyStartMs = new Date(vacancy.start).getTime();
    const vacancyEndMs = new Date(vacancy.end).getTime();
    const vacancyMonthIdx = new Date(vacancy.start).getMonth();

    let competitorPricesPerNight: number[] = [];
    let competitorSnapshotCount = 0;
    let competitorNamesUsed: string[] = [];

    const { data: competitors } = await supabase
      .from('competitor_properties')
      .select('id, property_name')
      .eq('house_id', houseId)
      .eq('is_active', true);

    if (competitors && competitors.length > 0) {
      const competitorIds = competitors.map((c: any) => c.id);
      const nameById = new Map(competitors.map((c: any) => [c.id, c.property_name]));

      const { data: weekly } = await supabase
        .from('weekly_pricing')
        .select('competitor_property_id, period_check_in, period_check_out, period_total_price, period_nights')
        .in('competitor_property_id', competitorIds)
        .not('period_total_price', 'is', null)
        .not('period_nights', 'is', null);

      const validSnapshots = (weekly || []).filter(
        (w: any) => w.period_nights > 0 && w.period_total_price
      );

      // Priorität 1: Preise, deren Zeitraum sich mit der Lücke überschneidet.
      let matching = validSnapshots.filter((w: any) => {
        const sStart = new Date(w.period_check_in).getTime();
        const sEnd = new Date(w.period_check_out).getTime();
        return sStart <= vacancyEndMs && sEnd >= vacancyStartMs;
      });

      // Priorität 2 (Fallback): Preise aus demselben Kalendermonat, egal welches Jahr.
      if (matching.length === 0) {
        matching = validSnapshots.filter(
          (w: any) => new Date(w.period_check_in).getMonth() === vacancyMonthIdx
        );
      }

      competitorPricesPerNight = matching.map(
        (w: any) => Math.round((w.period_total_price / w.period_nights) * 100) / 100
      );
      competitorSnapshotCount = matching.length;
      const namenListe: string[] = matching.map((w: any) =>
        String(nameById.get(w.competitor_property_id) ?? 'Unbekannt'),
      );
      competitorNamesUsed = [...new Set(namenListe)];
    }

    const competitorAvgPricePerNight = average(competitorPricesPerNight);
    const competitorMinPricePerNight = competitorPricesPerNight.length
      ? Math.min(...competitorPricesPerNight) : null;
    const competitorMaxPricePerNight = competitorPricesPerNight.length
      ? Math.max(...competitorPricesPerNight) : null;

    // Fix (2026-09-12): Regionale Marktdaten aus market_data_cache, READ-ONLY
    // (löst KEINEN neuen airroi-sync aus - das passiert weiterhin nur im
    // Preise-Tab/Cron). source='estimated' bewusst ausgeschlossen, das ist
    // eine aus den eigenen season_factors berechnete Formel, keine echten
    // Marktdaten (siehe docs/CODE-INDEX.md, "Stille Fallback-Falle in airroi-sync").
    //
    // WICHTIG: airroi-sync schreibt market_data_cache.location als
    // `airroi_district || airroi_locality` aus system_settings.pricing_config
    // (z.B. "Neukirchen am Großvenediger") - NICHT als houses.address. Mit der
    // Hausadresse zu suchen liefert still null.
    let regionalAvgPricePerNight: number | null = null;
    let regionalOccupancyRate: number | null = null;
    let regionalSource: string | null = null;
    let regionalLocation: string | null = null;
    let regionalDaysCovered = 0;
    let regionalSummaryOnly = false;

    const { data: pricingCfgRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'pricing_config')
      .maybeSingle();

    // Plattform-Aufschlag-Saetze (Auszahlung -> Verkaufspreis), Einstellungen-Tab.
    const platformMarkups = await loadPlatformMarkups(supabase);

    const pricingCfg = (pricingCfgRow?.value as any) ?? {};
    const airroiDistrict = String(pricingCfg.airroi_district ?? '').trim();
    const airroiLocality = String(pricingCfg.airroi_locality ?? '').trim();
    regionalLocation = airroiDistrict || airroiLocality || null;

    if (regionalLocation) {
      const { data: regionalRows } = await supabase
        .from('market_data_cache')
        .select('avg_price, occupancy_rate, source')
        .eq('location', regionalLocation)
        .in('source', ['airroi', 'competitor'])
        .gte('date', vacancy.start)
        .lte('date', vacancy.end)
        .not('avg_price', 'is', null);

      if (regionalRows && regionalRows.length > 0) {
        const prices = regionalRows.map((r: any) => Number(r.avg_price)).filter((n: number) => Number.isFinite(n));
        const occs = regionalRows.map((r: any) => Number(r.occupancy_rate)).filter((n: number) => Number.isFinite(n));

        // WICHTIG (docs/CODE-INDEX.md Modul 12, "Stille Fallback-Falle in
        // airroi-sync"): Bei HTTP 200 ohne brauchbare Zahlen schreibt
        // airroi-sync die Defaults occupancy 0.6 / adr 120 - trotzdem mit
        // source='airroi'. Diese erfundenen Werte duerfen NICHT als Marktpreis
        // in den KI-Kontext wandern. Diagnose laut Doku: adr_min == adr_max == 120.
        const distinctPrices = new Set(prices);
        const isFallbackGarbage =
          distinctPrices.size === 1 && prices[0] === AIRROI_FALLBACK_ADR;

        if (prices.length > 0 && !isFallbackGarbage) {
          regionalAvgPricePerNight = Math.round(average(prices)! * 100) / 100;
          regionalOccupancyRate = occs.length ? average(occs) : null;
          regionalSource = regionalRows[0].source;
          regionalDaysCovered = regionalRows.length;
          regionalSummaryOnly = distinctPrices.size === 1;
        }
      }
    }

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
    //
    // Fix (12.09.2026): `booking_amount` ist die NETTO-AUSZAHLUNG vom Portal,
    // nicht der Gastpreis (von Uli bestaetigt: er traegt bei Belvilla, Booking
    // und Airbnb jeweils den Betrag ein, den er bekommt). Die Empfehlung muss
    // aber ein VERKAUFSPREIS sein - das ist die Zahl, die Uli im Portal
    // eintraegt, und nur die ist mit AirROI-Marktpreisen vergleichbar.
    // Hochrechnung PRO BUCHUNG mit DEREN Plattform, bevor gemittelt wird - ein
    // Aufschlag auf einen plattformgemischten Durchschnitt waere falsch.
    // Rechenweg: _shared/platformMarkup.ts (Spiegel von src/lib/platformMarkup.ts).
    const bookingsWithRealPrice = bookings.map((b: any) => {
      const nights = nightsBetween(b.check_in, b.check_out);
      const pricePerNightNet = calculateRealPricePerNight(
        b.booking_amount || 0,
        nights,
        b.number_of_guests,
        additionalFees
      );
      const pricePerNightReal = pricePerNightNet === null
        ? null
        : grossFromNet(pricePerNightNet, b.platform, platformMarkups);
      return {
        ...b,
        __nights: nights,
        __pricePerNightNet: pricePerNightNet,
        __pricePerNightReal: pricePerNightReal,
      };
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
    const historicalReferencePricePerNight = monthAvgPricePerNight ?? overallAvgPricePerNight;

    // Fix (2026-09-12): Referenzwert für die Plausibilitätsgrenze berücksichtigt
    // jetzt Wettbewerber- UND Regionaldaten, statt sich nur an der eigenen (ggf.
    // zu niedrigen) Buchungshistorie zu verankern. Der HÖCHSTE der verfügbaren
    // Werte wird als Anker verwendet — keiner der drei Werte soll den Korridor
    // nach unten drücken, wenn ein anderer real teurer ist.
    const candidateReferences = [
      historicalReferencePricePerNight,
      competitorAvgPricePerNight,
      regionalAvgPricePerNight,
    ].filter((v): v is number => v !== null && v !== undefined && v > 0);
    const referencePricePerNight = candidateReferences.length
      ? Math.max(...candidateReferences)
      : null;

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
      // ACHTUNG Einheit: alle Werte hier sind VERKAUFSPREISE pro Nacht
      // (Auszahlung + Plattform-Aufschlag), damit sie mit den AirROI-Marktpreisen
      // und mit dem, was Uli im Portal eintraegt, vergleichbar sind.
      historischerPreisProNachtEUR: {
        einheit: "Verkaufspreis pro Nacht in EUR (inkl. Portal-Aufschlag, exkl. Nebenkosten)",
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
      // Fix (2026-09-12): reale Marktpreise von Wettbewerbern, manuell erfasst
      // im Häuser-Tab (ManualCompetitorDialog -> weekly_pricing, source='manual').
      // NICHT aus scrape-competitor-prices/search-competitors, die liefern laut
      // docs/CODE-INDEX.md keine Daten mehr.
      wettbewerbspreiseEURProNacht: {
        hinweis: competitorSnapshotCount > 0
          ? "Reale, manuell erfasste Preise von Wettbewerber-Unterkünften in der Region für diesen Zeitraum bzw. denselben Kalendermonat. Gewichte diese Werte GLEICHBERECHTIGT mit der eigenen Historie, nicht nachrangig."
          : "Für dieses Haus sind noch keine Wettbewerberpreise hinterlegt. Verlasse dich in diesem Fall auf die eigene Historie, weise in der Begründung aber darauf hin, dass kein Marktvergleich möglich war.",
        anzahlPreise: competitorSnapshotCount,
        wettbewerber: competitorNamesUsed,
        durchschnittProNacht: competitorAvgPricePerNight,
        minProNacht: competitorMinPricePerNight,
        maxProNacht: competitorMaxPricePerNight,
      },
      // Fix (2026-09-12): grobe, automatische Regionalmarktdaten (AirROI),
      // read-only aus dem Cache — kein Ersatz für property-genaue
      // Wettbewerberpreise, aber besser als nichts, wenn keine Wettbewerber
      // hinterlegt sind.
      regionaleMarktdatenEURProNacht: {
        hinweis: regionalAvgPricePerNight
          ? "Grober Durchschnittspreis für die Region (nicht objektspezifisch), automatisch aus AirROI. Aktuell die verlaesslichste externe Marktquelle in diesem System - nutze sie als Hauptanker fuer den Marktvergleich, wenn keine objektgenauen Wettbewerbspreise vorliegen."
          : "Keine belastbaren Regionaldaten für diesen Zeitraum vorhanden.",
        durchschnittProNacht: regionalAvgPricePerNight,
        auslastung: regionalOccupancyRate,
        quelle: regionalSource,
        markt: regionalLocation,
        abgedeckteTage: regionalDaysCovered,
        nurSummaryEndpunkt: regionalSummaryOnly,
      },
      // Fix (13.09.2026): harte Preisgrenzen des Vermieters aus dem Preise-Tab.
      preisgrenzenVermieterEURProNacht: {
        hinweis: (minPreis || maxPreis)
          ? "VERBINDLICHE Vorgabe des Vermieters. Deine Empfehlung MUSS innerhalb dieser Grenzen liegen. Liegen Markt oder Historie darunter, sage das im reasoning deutlich - aber unterschreite den Mindestpreis NICHT."
          : "Keine Preisgrenzen hinterlegt.",
        mindestpreis: minPreis,
        hoechstpreis: maxPreis,
        basispreis: basisPreis,
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
          auszahlungProNachtEUR: b.__pricePerNightNet,
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
- EINHEIT: Alle Preisangaben in diesem Kontext und deine Empfehlung sind VERKAUFSPREISE pro Nacht - also der Betrag, den der Gast zahlt bzw. den der Vermieter im Buchungsportal eintraegt. NICHT die Auszahlung nach Portalprovision. Das Feld "auszahlungProNachtEUR" ist nur zur Information beigefuegt; rechne NICHT damit.
- Verwende NIEMALS "gesamtbetragEURFuerGanzenAufenthalt" aus "recentBookings" als Nachtpreis - das ist die Summe für den GESAMTEN Aufenthalt (oft mehrere Nächte oder Wochen) und muss ignoriert werden, wenn du den Preis pro Nacht bestimmst.
- Liegt für den Ziel-Monat kein Wert vor (anzahlBuchungen = 0), orientiere dich am "gesamtDurchschnittAllerMonate" und passe ihn saisonal an (siehe Saison-Regeln unten), statt eine Zahl zu erfinden.
- Eine plausible Nachtpreis-Spanne für dieses Haus bewegt sich üblicherweise im ein- bis niedrigen dreistelligen Euro-Bereich, nicht im drei- oder vierstelligen Bereich.

WETTBEWERBSVERGLEICH (unbedingt beachten, siehe "wettbewerbspreiseEURProNacht"):
- Liegen Wettbewerberpreise vor (anzahlPreise > 0), sind das REALE, aktuelle Marktpreise vergleichbarer Unterkünfte in derselben Region. Diese sind mindestens genauso wichtig wie die eigene Buchungshistorie, oft aktueller.
- Wenn eigene Historie und Wettbewerbspreise deutlich auseinanderliegen: nenne beide Werte explizit in "reasoning" und erkläre, wohin du dich orientierst und warum (z.B. "eigene Historie basiert auf älteren, ggf. günstigeren Jahren").
- Erfinde NIEMALS Wettbewerbspreise, wenn anzahlPreise = 0 ist - weise stattdessen im reasoning darauf hin, dass kein Marktvergleich verfügbar war.
- Liegen keine Wettbewerberpreise vor, aber "regionaleMarktdatenEURProNacht" hat einen Wert: nutze diesen groben Regionsschnitt als zweitbeste Orientierung (besser als nur Eigen-Historie, aber schwächer als ein echter Wettbewerbspreis).

PREISGRENZEN (hoechste Prioritaet, siehe "preisgrenzenVermieterEURProNacht"):
- Sind mindestpreis/hoechstpreis gesetzt, MUSS suggestedPriceMin >= mindestpreis und suggestedPriceMax <= hoechstpreis sein. Diese Vorgabe schlaegt Historie, Wettbewerb und Regionaldaten.
- Liegt der Markt unter dem Mindestpreis, empfiehl trotzdem den Mindestpreis und weise im reasoning ausdruecklich darauf hin, dass der Markt darunter liegt und die Buchungswahrscheinlichkeit dadurch sinkt.

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
        const refLabel = competitorAvgPricePerNight && competitorAvgPricePerNight >= (historicalReferencePricePerNight ?? 0)
          ? `Wettbewerbs-/historischer Referenzwert ~€${Math.round(referencePricePerNight)}`
          : `historischer Nachtpreis ~€${Math.round(referencePricePerNight)}`;
        console.warn(
          `analyze-vacancy: Preisempfehlung außerhalb des Plausibilitätskorridors ` +
          `(${refLabel}) - ` +
          `KI lieferte €${originalMin}-€${originalMax}, gekappt auf €${analysis.suggestedPriceMin}-€${analysis.suggestedPriceMax}.`
        );
        analysis.reasoning +=
          ` (Hinweis: Die ursprüngliche KI-Preisspanne (€${originalMin}-€${originalMax}/Nacht) lag ` +
          `deutlich außerhalb des Referenzwerts von ca. €${Math.round(referencePricePerNight)}/Nacht ` +
          `(historisch und/oder Wettbewerb) und wurde deshalb auf €${analysis.suggestedPriceMin}-€${analysis.suggestedPriceMax}/Nacht angepasst.)`;
      }
    } else {
      console.warn('analyze-vacancy: Kein historischer Preis/Nacht-Referenzwert vorhanden - keine Plausibilitätsprüfung möglich.');
    }

    // Fix (13.09.2026): Harte Preisgrenzen des Vermieters durchsetzen.
    // Der Systemprompt weist die KI zwar an, sie einzuhalten - darauf ist aber
    // kein Verlass. Diese Klammer steht BEWUSST NACH der Plausibilitätsprüfung
    // oben, damit sie das letzte Wort hat. Die Anpassung wird im reasoning
    // benannt, nicht still vorgenommen: dass Markt und Historie darunter
    // liegen, ist für Uli eine Information und kein Störgeräusch.
    if (minPreis !== null || maxPreis !== null) {
      const vorherMin = analysis.suggestedPriceMin;
      const vorherMax = analysis.suggestedPriceMax;

      if (minPreis !== null && analysis.suggestedPriceMin < minPreis) {
        analysis.suggestedPriceMin = minPreis;
        if (analysis.suggestedPriceMax < minPreis) analysis.suggestedPriceMax = minPreis;
      }
      if (maxPreis !== null && analysis.suggestedPriceMax > maxPreis) {
        analysis.suggestedPriceMax = maxPreis;
        if (analysis.suggestedPriceMin > maxPreis) analysis.suggestedPriceMin = maxPreis;
      }

      if (vorherMin !== analysis.suggestedPriceMin || vorherMax !== analysis.suggestedPriceMax) {
        console.warn(
          `analyze-vacancy: Empfehlung an die Preisgrenzen des Hauses angepasst ` +
          `(Mindestpreis ${minPreis ?? '-'}, Höchstpreis ${maxPreis ?? '-'}): ` +
          `€${vorherMin}-€${vorherMax} -> €${analysis.suggestedPriceMin}-€${analysis.suggestedPriceMax}.`
        );
        analysis.reasoning +=
          ` (Hinweis: Die Empfehlung lautete zunächst €${vorherMin}-€${vorherMax}/Nacht und wurde auf ` +
          `deine im Preise-Tab hinterlegten Grenzen angepasst` +
          `${minPreis !== null ? `, Mindestpreis €${minPreis}` : ''}` +
          `${maxPreis !== null ? `, Höchstpreis €${maxPreis}` : ''}. ` +
          `Liegt der Markt darunter, sinkt die Buchungswahrscheinlichkeit entsprechend.)`;
      }
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
