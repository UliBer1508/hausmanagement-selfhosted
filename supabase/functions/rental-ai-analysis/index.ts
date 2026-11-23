import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { requireAdmin } from "../_shared/auth.ts";
import { geminiStructuredOutput, GeminiAPIError } from "../_shared/gemini.ts";
import { capFromLegal, detectLegal } from "./legal.ts";

/**
 * KI-Analyse Mietpreis (23.11.2026) — für FESTVERMIETUNG von Premium-Objekten
 * (möbliertes Chalet), bei denen ein Wohnungs-Mietspiegel nichts aussagt.
 *
 * Die Empfehlung entsteht zwischen vier Ankern (docs/CODE-INDEX.md „KI-Analyse Mietpreis"):
 *   1. Untergrenze   — kostendeckende Kaltmiete aus der Kalkulation
 *                      (vom Frontend mit lib/rentalCalc.ts gerechnet, `cost_floor_cold`)
 *   2. Normaler Markt — letzte Mietpreissuche (rental_price_analysis, Inserate/Statistik)
 *   3. Premium        — möblierte Häuser/Chalets zur Langzeitmiete, hier per Perplexity gesucht;
 *                       der m²-Preis wird aus den Inseraten SELBST gerechnet
 *   4. Touristisch    — bisherige Portal-Auszahlungen der letzten 12 Monate / 12 (nur Vergleich)
 *   5. Obergrenze     — rechtlich zulässige Kaltmiete. HARTE Grenze. Vorrang hat die vom Vermieter
 *                       erfasste (lib/rentalCalc.ts mietobergrenze(), `legal_cap_cold`); sonst rechnet
 *                       legal.ts sie aus Standort + Mietspiegel (Mietpreisbremse +10 %, sonst
 *                       § 5 WiStG +20 %). Standort/Regel/Vergleichsmiete stehen in `legal`.
 * Gemini formuliert daraus Spanne + Begründung; die Spanne wird danach auf die Anker gekappt.
 *
 * Ergebnis: eine Zeile in rental_price_analysis mit search_params.method = 'ai_analysis'
 * (keine eigene Tabelle). Nur Admin.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface Comparable {
  title?: string;
  location?: string;
  type?: string;
  sqm?: number;
  rent?: number;
  rent_kind?: string;
  furnished?: boolean;
  sauna?: boolean;
  source?: string;
  url?: string;
  per_sqm?: number;
}

interface Recommendation {
  empfehlung_min_eur: number;
  empfehlung_max_eur: number;
  begruendung: string;
  hinweise?: string[];
}

const PERPLEXITY_TIMEOUT_MS = 60_000;

function parseJson(content: string): any {
  try { return JSON.parse(content); } catch { /* weiter */ }
  let c = content.trim();
  const block = c.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (block) c = block[1].trim();
  const a = c.indexOf('{'); const b = c.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(c.substring(a, b + 1)); } catch { /* leer */ } }
  return null;
}

const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round10 = (n: number) => Math.round(n / 10) * 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const houseId: string | undefined = body.house_id;
    if (!houseId) return json({ success: false, error: 'house_id fehlt' }, 400);
    const costFloorCold = Number(body.cost_floor_cold) > 0 ? Number(body.cost_floor_cold) : null;
    const legalCapCold = Number(body.legal_cap_cold) > 0 ? Number(body.legal_cap_cold) : null;

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const geminiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!perplexityKey) throw new Error('PERPLEXITY_API_KEY nicht konfiguriert');
    if (!geminiKey) throw new Error('GOOGLE_GEMINI_API_KEY nicht konfiguriert');

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // ---- Objekt und Anker aus der Datenbank ----
    const since = new Date(); since.setFullYear(since.getFullYear() - 1);
    const sinceISO = since.toISOString().slice(0, 10);
    const [houseR, settingsR, inventoryR, marketR, bookingsR] = await Promise.all([
      supabase.from('houses').select('id, name, address, property_type, rental_type, living_area_sqm, bedrooms, bathrooms, amenities').eq('id', houseId).maybeSingle(),
      supabase.from('utility_settings').select('country').eq('house_id', houseId).maybeSingle(),
      supabase.from('house_inventory').select('id', { count: 'exact', head: true }).eq('house_id', houseId).eq('is_template', false),
      supabase.from('rental_price_analysis').select('price_per_sqm, analysis_date, sources, search_params')
        .eq('house_id', houseId).not('price_per_sqm', 'is', null).order('analysis_date', { ascending: false }).limit(10),
      supabase.from('bookings').select('booking_amount').eq('house_id', houseId).neq('status', 'cancelled').gte('check_in', sinceISO),
    ]);
    if (houseR.error) throw houseR.error;
    const house = houseR.data;
    if (!house) return json({ success: false, error: 'Haus nicht gefunden' }, 404);
    const sqm = Number(house.living_area_sqm) || 0;
    if (!(sqm > 0)) return json({ success: false, error: 'Wohnfläche fehlt – bitte im Haus eintragen' }, 400);

    const country: 'AT' | 'DE' = settingsR.data?.country === 'AT' ? 'AT' : 'DE';
    const furnished = (inventoryR.count ?? 0) > 0;
    const amenities = (house.amenities ?? {}) as Record<string, unknown>;
    const features = [
      amenities.sauna ? 'Sauna' : null,
      amenities.terrace ? 'Terrasse' : null,
      amenities.glacier_view ? 'Gletscherblick' : null,
      amenities.ski_cellar ? 'Skikeller' : null,
      Number(amenities.garage_spaces) > 0 ? `Garage (${amenities.garage_spaces})` : null,
    ].filter(Boolean) as string[];
    const typeLabel = house.property_type === 'house' ? 'Chalet/Haus' : 'Wohnung';

    // Normaler Markt: letzte echte Suche (keine KI-Analyse, kein Handwert)
    const marketRow = (marketR.data ?? []).find((r: any) => {
      const p = (r.search_params ?? {}) as Record<string, unknown>;
      return p.method !== 'ai_analysis' && p.manual !== true;
    });
    const normalPerSqm = marketRow ? Number(marketRow.price_per_sqm) : null;

    const touristYear = (bookingsR.data ?? []).reduce((s: number, b: any) => s + (Number(b.booking_amount) || 0), 0);
    const touristMonthly = touristYear > 0 ? Math.round(touristYear / 12) : null;

    // ---- Standort und Mietrecht (parallel zur Premium-Suche, legal.ts) ----
    const legalPromise = detectLegal({
      perplexityKey, address: String(house.address ?? ''), country, typeLabel, sqm, furnished,
      timeoutMs: PERPLEXITY_TIMEOUT_MS, parseJson,
    });

    // ---- Premium-Vergleiche suchen (Perplexity, ohne Portalfilter) ----
    const regionHint = country === 'AT'
      ? 'Oberpinzgau und Pinzgau (Neukirchen, Bramberg, Wald, Mittersill, Zell am See), dazu vergleichbare alpine Lagen: Kitzbüheler Alpen, Zillertal, Saalbach'
      : 'dieselbe Stadt bzw. denselben Stadtteil wie die Adresse, sonst angrenzende Stadtteile';
    const searchPrompt = `
AUFGABE: Finde aktuelle Inserate für die LANGZEITMIETE (ab 3 Monaten, keine Ferienvermietung) von ${house.property_type === 'house' ? 'MÖBLIERTEN Häusern, Chalets oder Landhäusern' : 'MÖBLIERTEN Wohnungen'} im Premium-Segment.

Unser Objekt: ${typeLabel}, ${sqm} m², ${house.bedrooms ?? '?'} Schlafzimmer, ${house.bathrooms ?? '?'} Bäder${furnished ? ', voll möbliert' : ''}${features.length ? ', ' + features.join(', ') : ''}.
Lage: ${house.address} (${country === 'AT' ? 'Österreich' : 'Deutschland'}).
Suchgebiet: ${regionHint}.
Größe der Vergleiche: etwa ${Math.round(sqm * 0.6)}-${Math.round(sqm * 1.6)} m².

ANTWORT NUR ALS JSON:
{
  "comparables": [
    {
      "title": "Titel des Inserats",
      "location": "Ort",
      "type": "${house.property_type === 'house' ? 'Chalet | Haus | Landhaus | Reihenhaus' : 'Wohnung | Penthouse | Maisonette'}",
      "sqm": 135,
      "rent": 2610,
      "rent_kind": "kalt | warm | all-in",
      "furnished": true,
      "sauna": false,
      "source": "Portal",
      "url": "direkte URL zum Inserat"
    }
  ]
}
REGELN: nur echte, aktuelle Inserate mit Monatsmiete und Fläche; ${house.property_type === 'house' ? 'keine Wohnungen' : 'keine Häuser'}; keine Tages- oder Wochenpreise; nur dieselbe Stadt bzw. Region; nichts erfinden.
`;
    let comparables: Comparable[] = [];
    let citations: string[] = [];
    try {
      const resp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(PERPLEXITY_TIMEOUT_MS),
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: 'Du recherchierst Mietinserate fuer Langzeitmiete im Premium-Segment. Antworte ausschliesslich mit validem JSON. Erfinde keine Inserate.' },
            { role: 'user', content: searchPrompt },
          ],
          temperature: 0.0,
          max_tokens: 4000,
          return_images: false,
          return_related_questions: false,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        citations = data.citations ?? [];
        const parsed = parseJson(data.choices?.[0]?.message?.content ?? '');
        comparables = (Array.isArray(parsed?.comparables) ? parsed.comparables : [])
          .filter((c: any) => Number(c?.rent) > 0 && Number(c?.sqm) > 0)
          .map((c: any) => ({
            title: c.title ? String(c.title) : undefined,
            location: c.location ? String(c.location) : undefined,
            type: c.type ? String(c.type) : undefined,
            sqm: Number(c.sqm),
            rent: Number(c.rent),
            rent_kind: c.rent_kind ? String(c.rent_kind) : undefined,
            furnished: c.furnished === true,
            sauna: c.sauna === true,
            source: c.source ? String(c.source) : undefined,
            url: typeof c.url === 'string' && c.url.startsWith('http') && !c.url.includes('...') ? c.url : undefined,
            per_sqm: round2(Number(c.rent) / Number(c.sqm)),
          }));
      } else {
        console.error('[rental-ai-analysis] Perplexity', resp.status);
      }
    } catch (e) {
      console.error('[rental-ai-analysis] Premium-Suche fehlgeschlagen:', e);
    }

    const premiumValues = comparables.map(c => c.per_sqm!).filter(v => v > 0);
    const premium = premiumValues.length > 0
      ? { median: round2(median(premiumValues)), min: round2(Math.min(...premiumValues)), max: round2(Math.max(...premiumValues)), count: premiumValues.length }
      : null;

    const legal = await legalPromise;
    const { cap: capCold, basis: capBasis } = capFromLegal(legalCapCold, legal, sqm, country);
    const capLabel = capBasis === 'manual' ? 'vom Vermieter erfasst (Mietpreisbremse/Vormiete)'
      : capBasis === 'mietpreisbremse' ? `Mietpreisbremse: Vergleichsmiete ${legal.reference_per_sqm} €/m² + 10 %`
      : capBasis === 'wistg' ? `§ 5 WiStG: Vergleichsmiete ${legal.reference_per_sqm} €/m² + 20 %`
      : '';
    const legalText = [
      `Standort: ${[legal.municipality, legal.state].filter(Boolean).join(', ') || 'nicht bestimmt'}`,
      `Regel: ${legal.regime ?? 'unklar'}${legal.applies === true ? ' – begrenzt die Miete bei Neuvermietung' : legal.applies === false ? ' – keine Begrenzung' : ''}${legal.regulation ? ` (${legal.regulation})` : ''}`,
      `Ortsübliche Vergleichsmiete: ${legal.reference_per_sqm ? `${legal.reference_per_sqm} €/m²${legal.reference_source ? ` (${legal.reference_source})` : ''}` : 'nicht gefunden'}`,
    ].join('\n');

    // ---- Empfehlung (Gemini) ----
    const anchorText = [
      `Kostendeckende Kaltmiete (Kalkulation): ${costFloorCold ? `${costFloorCold} € / Monat` : 'noch keine Kalkulation'}`,
      `Normaler Mietmarkt (Wohnungen/Statistik): ${normalPerSqm ? `${normalPerSqm} €/m² → ${Math.round(normalPerSqm * sqm)} € bei ${sqm} m²` : 'keine Daten'}`,
      `Premium-Vergleiche (möblierte Häuser/Chalets): ${premium ? `Median ${premium.median} €/m², Spanne ${premium.min}–${premium.max} €/m², ${premium.count} Inserate` : 'keine gefunden'}`,
      `Rechtliche Obergrenze Kaltmiete: ${capCold ? `${capCold} € / Monat (${capLabel}) – darf NICHT überschritten werden` : country === 'DE' ? (legal.applies ? 'Mietpreisbremse gilt, Vergleichsmiete aber unbekannt – bleib beim normalen Markt und weise deutlich darauf hin' : 'nicht bestimmt – weise darauf hin') : (legal.applies ? 'Begrenzung nach MRG möglich – weise darauf hin' : 'keine gesetzliche Obergrenze erkannt')}`,
      `Bisheriger touristischer Ertrag: ${touristMonthly ? `${touristMonthly} € / Monat (Portal-Auszahlungen der letzten 12 Monate, inkl. Reinigung/Wäsche/Aufwand des Vermieters)` : 'keine Daten'}`,
    ].join('\n');
    const compText = comparables.slice(0, 12).map(c =>
      `- ${c.title ?? c.type ?? 'Inserat'} (${c.location ?? '?'}): ${c.sqm} m², ${c.rent} € ${c.rent_kind ?? ''}, ${c.per_sqm} €/m²${c.furnished ? ', möbliert' : ''}${c.sauna ? ', Sauna' : ''}`
    ).join('\n');

    const recommendation = await geminiStructuredOutput<Recommendation>(
      geminiKey,
      'Du bist ein nüchterner Mietpreis-Berater für private Vermieter von Häusern und Wohnungen in Österreich und Deutschland (Langzeitvermietung). Du rechnest in Euro Kaltmiete pro Monat, begründest knapp auf Deutsch und erfindest keine Zahlen. Eine angegebene rechtliche Obergrenze (z. B. Mietpreisbremse) ist zwingend: Deine Spanne darf sie nie überschreiten. Teurere Vergleichslagen (z. B. Kitzbühel gegenüber dem Oberpinzgau, Grünwald gegenüber dem Münchner Stadtgebiet) berücksichtigst du mit Abschlag.',
      `Objekt: ${house.name}, ${typeLabel}, ${sqm} m², ${house.bedrooms ?? '?'} Schlafzimmer, ${house.bathrooms ?? '?'} Bäder${furnished ? ', voll möbliert' : ''}${features.length ? ', ' + features.join(', ') : ''}.
Lage: ${house.address}. Vermietung: 6–12 Monate oder unbefristet, ohne Reinigung/Wäsche durch den Vermieter.

MIETRECHT:
${legalText}

ANKER:
${anchorText}

PREMIUM-INSERATE:
${compText || '(keine)'}

Gib eine realistische Spanne für die monatliche KALTMIETE (ohne Betriebskosten) und eine Begründung in höchstens 5 Sätzen. Nenne in "hinweise" kurz, welche Anker fehlen oder unsicher sind.`,
      {
        name: 'mietpreis_empfehlung',
        description: 'Empfohlene Kaltmiete pro Monat für das Objekt',
        parameters: {
          type: 'object',
          properties: {
            empfehlung_min_eur: { type: 'number', description: 'Untere Grenze Kaltmiete EUR/Monat' },
            empfehlung_max_eur: { type: 'number', description: 'Obere Grenze Kaltmiete EUR/Monat' },
            begruendung: { type: 'string', description: 'Begründung, höchstens 5 Sätze, Deutsch' },
            hinweise: { type: 'array', items: { type: 'string' }, description: 'Fehlende oder unsichere Anker' },
          },
          required: ['empfehlung_min_eur', 'empfehlung_max_eur', 'begruendung'],
        },
      },
    );

    // ---- Plausibilität: Spanne auf die Anker begrenzen (sichtbar vermerkt) ----
    let min = Number(recommendation.empfehlung_min_eur) || 0;
    let max = Number(recommendation.empfehlung_max_eur) || 0;
    if (min > max) [min, max] = [max, min];
    const notes: string[] = Array.isArray(recommendation.hinweise) ? recommendation.hinweise.map(String) : [];
    const floor = Math.max(costFloorCold ?? 0, normalPerSqm ? normalPerSqm * sqm * 0.8 : 0);
    const ceiling = premium ? premium.max * sqm : (normalPerSqm ? normalPerSqm * sqm * 2.5 : 0);
    if (floor > 0 && min < floor) { min = floor; notes.push('Untergrenze auf Kosten/Normalmarkt angehoben.'); }
    if (ceiling > 0 && max > ceiling) { max = ceiling; notes.push('Obergrenze auf den teuersten Premium-Vergleich begrenzt.'); }
    // Rechtliche Obergrenze schlägt alles andere (auch die Kosten-Untergrenze)
    if (capCold) {
      if (max > capCold) { max = capCold; notes.push(`Auf die rechtliche Obergrenze begrenzt (${capLabel}).`); }
      if (min > capCold) { min = capCold; }
      if (costFloorCold && costFloorCold > capCold) notes.push('Achtung: Die Kosten liegen über der rechtlich zulässigen Miete.');
      if (capBasis !== 'manual') notes.push('Obergrenze automatisch aus dem Mietspiegel geschätzt – mit dem Mietspiegel prüfen und in „Rechtliche Obergrenze“ übernehmen.');
    } else if (country === 'DE') {
      notes.push(legal.applies
        ? 'Mietpreisbremse gilt, die Vergleichsmiete wurde aber nicht gefunden – Empfehlung ist NICHT rechtlich geprüft. Obergrenze eintragen.'
        : 'Rechtliche Obergrenze nicht bestimmt – Mietpreisbremse prüfen.');
    }
    if (max < min) max = min;
    // runden, ohne die rechtliche Grenze durch Aufrunden zu überschreiten
    min = round10(min); max = round10(max);
    if (capCold) { max = Math.min(max, Math.floor(capCold / 10) * 10); min = Math.min(min, max); }
    if (!(max > 0)) return json({ success: false, error: 'Die KI hat keine verwertbare Empfehlung geliefert.' }, 502);
    let mid = round10((min + max) / 2);
    if (capCold) mid = Math.min(mid, max);

    const analysis = {
      method: 'ai_analysis',
      market: 'long_term',
      sqm, country, furnished, features,
      anchors: {
        cost_floor_cold: costFloorCold,
        legal_cap_cold: capCold,
        legal_cap_basis: capBasis,
        normal_per_sqm: normalPerSqm,
        normal_date: marketRow?.analysis_date ?? null,
        premium,
        tourist_monthly: touristMonthly,
      },
      legal,
      recommendation: { min, max, mid, reasoning: String(recommendation.begruendung ?? ''), notes },
      comparables: comparables.slice(0, 15),
      citations: citations.slice(0, 15),
    };

    const { data: saved, error: saveError } = await supabase.from('rental_price_analysis').insert({
      house_id: houseId,
      price_per_sqm: round2(mid / sqm),
      avg_rent: mid,
      min_rent: min,
      max_rent: max,
      comparable_count: comparables.length,
      sources: ['KI-Analyse'],
      search_params: analysis,
    }).select('id');
    if (saveError || !saved?.length) console.error('[rental-ai-analysis] Speichern fehlgeschlagen:', saveError);

    return json({ success: true, saved: !!saved?.length, analysis });
  } catch (error) {
    console.error('[rental-ai-analysis] Fehler:', error);
    const message = error instanceof GeminiAPIError || error instanceof Error ? error.message : 'Unbekannter Fehler';
    return json({ success: false, error: message }, 500);
  }
});
