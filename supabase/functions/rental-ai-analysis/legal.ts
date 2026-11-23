/**
 * Standort und Mietrecht für die KI-Analyse Mietpreis (23.11.2026).
 *
 * Frage: Wo liegt das Objekt, welche Regel begrenzt die Miete bei Neuvermietung, und wie hoch ist
 * die ortsübliche Vergleichsmiete (Mietspiegel)? In Berlin und München ist es gefährlich, darüber
 * zu liegen (Mietpreisbremse § 556d BGB: höchstens Vergleichsmiete + 10 %; Mietpreisüberhöhung
 * § 5 WiStG: mehr als 20 % darüber kann ein Bußgeld auslösen).
 *
 * Zwei Quellen:
 *   1. KNOWN_REGIMES — feste, geprüfte Gebiete unserer Objekte (Verordnung, Laufzeit, Fundstelle).
 *      Schlägt die KI bei „gilt / gilt nicht“. Neue Orte hier nachtragen, wenn ein Objekt dazukommt.
 *   2. Perplexity — Gemeinde, Bundesland und Vergleichsmiete aus dem aktuellen Mietspiegel
 *      (auch für Orte, die nicht in der Tabelle stehen).
 *
 * Die Obergrenze selbst rechnet index.ts (capFromLegal), damit die Regel an einer Stelle steht.
 * Eine vom Vermieter erfasste Obergrenze (rental_calculations.rent_cap, z. B. mit Vormiete) hat
 * immer Vorrang — die automatische ist nur der Schutz, wenn nichts erfasst ist.
 */

export interface KnownRegime {
  /** Kleinbuchstaben; trifft, wenn die Adresse eines davon enthält */
  match: string[];
  municipality: string;
  state: string;
  regime: string;
  regulation: string;
  valid_until: string;
  source: string;
  /** Link zum Mietspiegel bzw. Rechner, falls bekannt */
  mietspiegel_url?: string;
}

// Reihenfolge zählt: Falkensee vor Berlin (Adresse „Berlin Falkensee“ liegt in Brandenburg).
export const KNOWN_REGIMES: KnownRegime[] = [
  {
    match: ['falkensee'],
    municipality: 'Falkensee',
    state: 'Brandenburg (Landkreis Havelland)',
    regime: 'Mietpreisbremse (§ 556d BGB)',
    regulation: 'Brandenburgische Mietpreisbegrenzungsverordnung vom 3. Dezember 2025 (GVBl. II/25 Nr. 95)',
    valid_until: '2029-12-31',
    source: 'https://bravors.brandenburg.de/verordnungen/mietbegrenzv_2025',
  },
  {
    match: ['berlin'],
    municipality: 'Berlin',
    state: 'Berlin',
    regime: 'Mietpreisbremse (§ 556d BGB), ganzes Stadtgebiet',
    regulation: 'Berliner Mietenbegrenzungsverordnung, in Kraft ab 1. Januar 2026',
    valid_until: '2029-12-31',
    source: 'https://www.berlin.de/aktuelles/10014766-958090-mietpreisbremse-bis-2029-verlaengert.html',
    mietspiegel_url: 'https://www.stadtentwicklung.berlin.de/wohnen/mietspiegel/',
  },
  {
    match: ['münchen', 'muenchen', 'munich'],
    municipality: 'München',
    state: 'Bayern',
    regime: 'Mietpreisbremse (§ 556d BGB)',
    regulation: 'Bayerische Mieterschutzverordnung (MiSchuV)',
    valid_until: '2029-12-31',
    source: 'https://www.gesetze-bayern.de/Content/Document/BayMiSchuV',
    mietspiegel_url: 'https://stadt.muenchen.de/infos/mietspiegel.html',
  },
];

export const findKnownRegime = (address: string): KnownRegime | null => {
  const a = address.toLowerCase();
  return KNOWN_REGIMES.find(r => r.match.some(m => a.includes(m))) ?? null;
};

export interface LegalCheck {
  municipality: string | null;
  state: string | null;
  regime: string | null;
  /** Begrenzt eine Regel die Miete bei Neuvermietung? null = unklar */
  applies: boolean | null;
  regulation: string | null;
  valid_until: string | null;
  /** true = aus KNOWN_REGIMES bestätigt, false = nur KI */
  confirmed: boolean;
  reference_per_sqm: number | null;
  reference_range: { min: number; max: number } | null;
  reference_source: string | null;
  mietspiegel_url: string | null;
  notes: string[];
  sources: string[];
}

interface LegalInput {
  perplexityKey: string;
  address: string;
  country: 'AT' | 'DE';
  typeLabel: string;
  sqm: number;
  furnished: boolean;
  timeoutMs: number;
  parseJson: (s: string) => any;
}

const num = (v: unknown) => (Number(v) > 0 ? Number(v) : null);

export async function detectLegal(i: LegalInput): Promise<LegalCheck> {
  const known = i.country === 'DE' ? findKnownRegime(i.address) : null;
  const today = new Date().toISOString().slice(0, 10);
  const lawHint = i.country === 'DE'
    ? 'Deutschland: Gilt in der Gemeinde eine Mietpreisbegrenzungsverordnung nach § 556d BGB (Mietpreisbremse)? Wie hoch ist die ortsübliche Vergleichsmiete laut aktuellem (qualifiziertem) Mietspiegel für genau dieses Objekt?'
    : 'Österreich: Welche Regel des Mietrechtsgesetzes (MRG) gilt für dieses Objekt (Vollausnahme z. B. Ein- oder Zweifamilienhaus § 1 Abs 2 Z 5, Teilanwendung, Richtwert)? Gibt es eine gesetzliche Mietzinsobergrenze?';

  const prompt = `
Stand: ${today}. Adresse: ${i.address} (${i.country === 'DE' ? 'Deutschland' : 'Österreich'}).
Objekt: ${i.typeLabel}, ${i.sqm} m²${i.furnished ? ', möbliert' : ''}, Langzeitvermietung (Wohnraum).

1. Bestimme die politische Gemeinde und das Bundesland. Achtung: Ortsangaben wie „Berlin Falkensee“ meinen oft eine eigene Gemeinde im Umland.
2. ${lawHint}

ANTWORT NUR ALS JSON:
{
  "gemeinde": "…",
  "bundesland": "…",
  "regel": "kurzer Name der Regel, z. B. Mietpreisbremse (§ 556d BGB) oder MRG-Vollausnahme",
  "begrenzung_gilt": true,
  "verordnung": "Name und Datum der Verordnung oder null",
  "gilt_bis": "JJJJ-MM-TT oder null",
  "mietspiegel": "Name und Jahr des Mietspiegels oder null",
  "vergleichsmiete_eur_qm": 12.5,
  "vergleichsmiete_min_eur_qm": 11.0,
  "vergleichsmiete_max_eur_qm": 14.0,
  "hinweise": ["kurz: Ausnahmen wie Neubau nach 1.10.2014, umfassende Modernisierung, Vormiete, Möblierungszuschlag"]
}
REGELN: Nur belegte Angaben aus amtlichen Quellen oder dem Mietspiegel; unbekannt = null. Vergleichsmiete als NETTOKALTmiete je m² für Größe und Art dieses Objekts, nicht der Stadtdurchschnitt aller Wohnungen.`;

  let ai: any = null;
  let sources: string[] = [];
  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${i.perplexityKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(i.timeoutMs),
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'Du prüfst Mietrecht und Mietspiegel für private Vermieter. Antworte ausschliesslich mit validem JSON. Erfinde keine Zahlen.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 1500,
        return_images: false,
        return_related_questions: false,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sources = Array.isArray(data.citations) ? data.citations.slice(0, 8) : [];
      ai = i.parseJson(data.choices?.[0]?.message?.content ?? '');
    } else {
      console.error('[rental-ai-analysis] Rechtsprüfung Perplexity', resp.status);
    }
  } catch (e) {
    console.error('[rental-ai-analysis] Rechtsprüfung fehlgeschlagen:', e);
  }

  const notes: string[] = Array.isArray(ai?.hinweise) ? ai.hinweise.map(String).slice(0, 5) : [];
  let refMin = num(ai?.vergleichsmiete_min_eur_qm);
  let refMax = num(ai?.vergleichsmiete_max_eur_qm);
  let ref = num(ai?.vergleichsmiete_eur_qm);
  // Unplausible Werte verwerfen (Tipp- oder Einheitenfehler der KI)
  if (ref && (ref < 3 || ref > 40)) { notes.push(`Vergleichsmiete ${ref} €/m² unplausibel – verworfen.`); ref = null; }
  if (refMin && refMax && refMin > refMax) [refMin, refMax] = [refMax, refMin];

  const aiApplies = typeof ai?.begrenzung_gilt === 'boolean' ? ai.begrenzung_gilt : null;
  if (known && aiApplies === false) notes.push('Die KI meinte, es gelte keine Mietpreisbremse – laut Verordnung gilt sie doch.');

  return {
    municipality: known?.municipality ?? (ai?.gemeinde ? String(ai.gemeinde) : null),
    state: known?.state ?? (ai?.bundesland ? String(ai.bundesland) : null),
    regime: known?.regime ?? (ai?.regel ? String(ai.regel) : null),
    applies: known ? true : aiApplies,
    regulation: known?.regulation ?? (ai?.verordnung ? String(ai.verordnung) : null),
    valid_until: known?.valid_until ?? (ai?.gilt_bis ? String(ai.gilt_bis) : null),
    confirmed: !!known,
    reference_per_sqm: ref,
    reference_range: refMin && refMax ? { min: refMin, max: refMax } : null,
    reference_source: ai?.mietspiegel ? String(ai.mietspiegel) : null,
    mietspiegel_url: known?.mietspiegel_url ?? null,
    notes,
    sources: known ? [known.source, ...sources.filter(s => s !== known.source)] : sources,
  };
}

/** Faktoren der automatischen Obergrenze (Deutschland). */
export const BRAKE_MARKUP = 1.10;   // § 556d BGB: Vergleichsmiete + 10 %
export const WISTG_MARKUP = 1.20;   // § 5 WiStG: ab mehr als 20 % darüber Mietpreisüberhöhung

export type CapBasis = 'manual' | 'mietpreisbremse' | 'wistg' | null;

/**
 * Obergrenze Kaltmiete aus Rechtsprüfung, auf 10 € abgerundet. Vorrang: vom Vermieter erfasste
 * Obergrenze (z. B. mit Vormiete), sonst Mietpreisbremse, sonst Wucher-Schutz § 5 WiStG.
 */
export function capFromLegal(
  manualCap: number | null, legal: LegalCheck, sqm: number, country: 'AT' | 'DE',
): { cap: number | null; basis: CapBasis } {
  if (manualCap) return { cap: manualCap, basis: 'manual' };
  if (country !== 'DE' || !legal.reference_per_sqm || !(sqm > 0)) return { cap: null, basis: null };
  const factor = legal.applies ? BRAKE_MARKUP : WISTG_MARKUP;
  return {
    cap: Math.floor((legal.reference_per_sqm * factor * sqm) / 10) * 10,
    basis: legal.applies ? 'mietpreisbremse' : 'wistg',
  };
}
