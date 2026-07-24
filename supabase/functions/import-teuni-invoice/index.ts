import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// TEUNI-RECHNUNG EINLESEN (import-teuni-invoice)
// ============================================================
//
// Zweck: Ein Rechnungs-PDF von Wäsche Pinzgau (Teuni) lesen, die Positionen
// extrahieren, rechnerisch prüfen und die Preise gegen die eigene Preisliste
// (ai_linen_settings.prices) vergleichen.
//
// WAS DIESE FUNKTION KANN
// -----------------------
//   - Kopfdaten lesen: Rechnungsnummer, Rechnungsdatum, Fälligkeit, Betrag
//   - Positionen lesen: Art.Nr, Bezeichnung, Menge, Einheit, Preis, Summe
//   - Rechnung gegen sich selbst prüfen: Menge x Preis = Zeilensumme,
//     Summe aller Zeilen = Gesamtbetrag
//   - Preise gegen ai_linen_settings.prices vergleichen (Mietwäsche-Artikel)
//   - Unbekannte Artikelnummern MELDEN statt sie zu verschlucken
//
// WAS SIE NICHT KANN (und warum)
// ------------------------------
//   - Prüfen, ob die MENGEN stimmen. Dazu bräuchte es die Zuordnung
//     Rechnung -> Bestellung. Teuni schlüsselt Sammelrechnungen NICHT auf;
//     welche Bestellung in welcher Rechnung steckt, ist fachlich nicht
//     bestimmbar. (Siehe MASTER-Doku, Abschnitt Wäschekosten.)
//   - Den Zahlvermerk lesen. Auf den PDFs steht er ("bezahlt 16.3.26") als
//     GRAFIK, nicht im Textlayer. Befund vom 24.07.2026 an RG-0047 und
//     RG-0081 verifiziert. bezahlt_am setzt der Mensch.
//   - Kilogramm-Posten (WT3/WTB3) gegen die Preisliste prüfen. Die eigene
//     Kalkulation rechnet in Stück, Teuni bei Lohnwäsche in kg — es gibt
//     keinen Vergleichswert. Diese Positionen werden gelesen und ausgewiesen,
//     aber nicht bewertet.
//
// SCHREIBT NICHTS. Die Funktion liefert nur ein Prüfergebnis zurück; das
// Anlegen der Rechnung macht das Frontend nach Freigabe durch den Menschen.
// Bei Geld soll keine automatische Erkennung einen Betrag setzen, den
// niemand angesehen hat.
//
// ARTIKEL-ZUORDNUNG
// -----------------
// Erarbeitet am 24.07.2026 anhand von sechs Rechnungen (2025 + 2026) und
// bestätigt durch Uli. Teuni baut ihr Geschäft auf und ändert Artikel und
// Preise im Laufe der Zeit — deshalb ist diese Tabelle bewusst DATEN und
// kein fest verdrahteter Parser: neue Kürzel führen zu einer Meldung,
// nicht zum stillen Überspringen.
const ARTIKEL_MAP: Record<string, { feld: string | null; hinweis?: string }> = {
  MW3:     { feld: 'bedding',       hinweis: 'Paket 5 Tlg — Zusammensetzung bei Teuni nicht schriftlich bestätigt' },
  MWST:    { feld: 'sauna_towels' },
  MWHT:    { feld: 'small_towels' },
  MWBVL:   { feld: 'bath_mats' },
  MWBT:    { feld: 'large_towels' },
  MWSPLT1: { feld: null, hinweis: 'Spannleintuch Zusatzbett — Sonderfall, nicht kalkuliert' },
  KLGEW:   { feld: null, hinweis: 'Kleinunternehmerregelung, immer 0,00' },
  WT3:     { feld: null, hinweis: 'Lohnwäsche nach kg — nicht mit Stückpreisen vergleichbar' },
  WTB3:    { feld: null, hinweis: 'Lohnwäsche nach kg — nicht mit Stückpreisen vergleichbar' },
};

interface Position {
  pos: number; artikel: string; bezeichnung: string;
  menge: number; einheit: string; preis: number;
  gesamt: number; summe: number; ust: number;
}

// Deutsches Zahlformat: 1.234,56 -> 1234.56
function num(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- PDF-Textextraktion, eigenimplementiert ----------------------------
//
// WARUM KEINE BIBLIOTHEK: pdfjs-dist zieht ueber esm.sh eine native
// Canvas-Abhaengigkeit nach ("canvas.node"), die Deno nicht aufloesen kann —
// der Deploy scheitert mit HTTP 400. Verifiziert am 24.07.2026.
//
// Die Teuni-PDFs (Erzeuger: WPCUBE) sind guenstig gebaut: Contentstream
// unkomprimiert oder FlateDecode, Text in ( ) mit Tj/TJ, WinAnsiEncoding,
// Positionierung ueber cm/Tm/Td. Das reicht fuer eine eigene Extraktion.
// Getestet gegen sechs Rechnungen aus 2025 und 2026 — Ergebnis identisch
// zu pdfplumber.

async function inflateAsync(data: Uint8Array): Promise<Uint8Array> {
  // PDF-FlateDecode ist zlib (mit Header). Falls das fehlschlaegt, ohne
  // Header versuchen — manche Erzeuger schreiben rohes deflate.
  for (const fmt of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([data]).stream()
        .pipeThrough(new DecompressionStream(fmt));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* naechstes Format */ }
  }
  throw new Error('Stream nicht dekomprimierbar');
}

// Contentstreams der Seiten finden.
// Wir gehen von OBJEKTGRENZE aus ("N 0 obj ... endobj"), nicht per
// lastIndexOf("<<") — bei verschachtelten Dictionaries trifft das sonst die
// falsche Klammer, und ein "stream"-Vorkommen im bereits dekodierten Text
// wuerde faelschlich als Streamanfang gewertet.
async function contentStreams(bytes: Uint8Array): Promise<string[]> {
  const latin = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(latin)) !== null) {
    const objStart = m.index + m[0].length;
    const sIdx = latin.indexOf('stream', objStart);
    if (sIdx < 0) continue;
    const endObj = latin.indexOf('endobj', objStart);
    if (endObj >= 0 && sIdx > endObj) continue;      // Objekt ohne Stream

    const dict = latin.slice(objStart, sIdx);
    // Bilder, Fonts und Metadaten ueberspringen
    if (/\/Subtype\s*\/(Image|XML|Type1C|TrueType)|\/DCTDecode|\/FontFile/.test(dict)) continue;

    let dataStart = sIdx + 'stream'.length;
    if (latin[dataStart] === '\r') dataStart++;
    if (latin[dataStart] === '\n') dataStart++;
    let dataEnd = latin.indexOf('endstream', dataStart);
    if (dataEnd < 0) continue;
    // Der Zeilenumbruch VOR "endstream" gehoert nicht zu den Streamdaten.
    // Bleibt er drin, meldet DecompressionStream "failed to write whole
    // buffer" — verifiziert am 24.07.2026.
    if (latin[dataEnd - 1] === '\n') dataEnd--;
    if (latin[dataEnd - 1] === '\r') dataEnd--;

    let raw = bytes.slice(dataStart, dataEnd);
    if (/FlateDecode/.test(dict)) {
      try { raw = await inflateAsync(raw); } catch { continue; }
    }
    const txt = new TextDecoder('latin1').decode(raw);
    if (/\bTj\b|\bTJ\b/.test(txt)) out.push(txt);
  }
  return out;
}

const WIN1252_EXTRA: Record<number, string> = {
  128: '\u20ac', 130: '\u201a', 131: '\u0192', 132: '\u201e', 133: '\u2026',
  145: '\u2018', 146: '\u2019', 147: '\u201c', 148: '\u201d', 150: '\u2013',
  151: '\u2014', 153: '\u2122',
};

function unescapePdfString(s: string): string {
  let out = ''; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
      if (simple[n] !== undefined) { out += simple[n]; i += 2; continue; }
      const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
      if (oct) { out += String.fromCharCode(parseInt(oct[0], 8) & 0xff); i += 1 + oct[0].length; continue; }
      out += n; i += 2; continue;
    }
    out += c; i++;
  }
  // latin1 -> Unicode, WinAnsi-Sonderfaelle beruecksichtigen
  return [...out].map(ch => {
    const code = ch.charCodeAt(0);
    return WIN1252_EXTRA[code] ?? ch;
  }).join('');
}

interface Frag { y: number; x: number; s: string; }

function extractFromStream(content: string): Frag[] {
  const frags: Frag[] = [];
  let cm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let tx = 0, ty = 0;

  const TOKEN = new RegExp([
    /\(((?:[^()\\]|\\.)*)\)\s*Tj/.source,                         // 1
    /\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/.source,                        // 2
    /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(cm|Tm)/.source, // 3-9
    /([-\d.]+)\s+([-\d.]+)\s+Td/.source,                           // 10,11
    /(BT|ET|q|Q)/.source,                                            // 12
  ].join('|'), 'g');

  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(content)) !== null) {
    if (m[12]) {
      if (m[12] === 'q') stack.push([...cm]);
      else if (m[12] === 'Q') { const p = stack.pop(); if (p) cm = p; }
      else if (m[12] === 'BT') { tx = 0; ty = 0; }
      continue;
    }
    if (m[9]) {
      const [a, b, c, d, e, f] = [3, 4, 5, 6, 7, 8].map(i => parseFloat(m![i]));
      if (m[9] === 'cm') {
        const [A, B, C, D, E, F] = cm;
        cm = [a * A + b * C, a * B + b * D, c * A + d * C,
              c * B + d * D, e * A + f * C + E, e * B + f * D + F];
      } else { tx = e; ty = f; }
      continue;
    }
    if (m[10] !== undefined) { tx += parseFloat(m[10]); ty += parseFloat(m[11]); continue; }

    let s: string | null = null;
    if (m[1] !== undefined) s = unescapePdfString(m[1]);
    else if (m[2] !== undefined) {
      s = [...m[2].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)]
        .map(x => unescapePdfString(x[1])).join('');
    }
    if (s === null || !s.trim()) continue;

    const [A, B, C, D, E, F] = cm;
    frags.push({ y: Math.round((tx * B + ty * D + F) * 10) / 10, x: tx * A + ty * C + E, s });
  }
  return frags;
}

function fragsToLines(frags: Frag[]): string {
  frags.sort((p, q) => (q.y - p.y) || (p.x - q.x));
  const lines: Frag[][] = [];
  let cur: Frag[] = []; let lastY: number | null = null;
  for (const f of frags) {
    if (lastY === null || Math.abs(f.y - lastY) <= 2.0) {
      cur.push(f); if (lastY === null) lastY = f.y;
    } else { lines.push(cur); cur = [f]; lastY = f.y; }
  }
  if (cur.length) lines.push(cur);

  return lines.map(l => {
    let s = l.sort((a, b) => a.x - b.x).map(f => f.s).join(' ');
    // Der Tc-Operator (Zeichenabstand) zerlegt Woerter und Zahlen in
    // Einzelfragmente. Beim Zusammenfuegen entsteht "30 , 00" und
    // "G e s a m t b e t r a g" -> wieder zusammenziehen.
    s = s.replace(/(?<=\d) *([.,]) *(?=\d)/g, '$1');
    s = s.replace(/\b(?:[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df] ){2,}[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]\b/g,
                  (x: string) => x.replace(/ /g, ''));
    return s.replace(/ {2,}/g, ' ').trim();
  }).join('\n');
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const streams = await contentStreams(bytes);
  if (streams.length === 0) throw new Error('Kein lesbarer Textstream im PDF gefunden');
  let all: Frag[] = [];
  const parts: string[] = [];
  for (const st of streams) {
    const f = extractFromStream(st);
    if (f.length) parts.push(fragsToLines(f));
  }
  return parts.join('\n');
}

const RE_HEADER = /Rechnung\s+Nr\.\s*(\S+)\s+vom\s+(\d{2})\.(\d{2})\.(\d{4})/;
const RE_DUE    = /Zahlung bis sp\u00e4testens\s+(\d{2})\.(\d{2})\.(\d{4})/;
const RE_TOTAL  = /Gesamtbetrag\s+Netto:\s*([\d.,]+)\s*\u20ac/;
const RE_POS    = /^(\d{1,3})\s+([A-Z0-9]{2,10})\s+(.+?)\s+([\d.,]+)\s+(Stk\.|kg)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*\u20ac\s+(\d+)%$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64) throw new Error('pdf_base64 fehlt');

    const bytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    const text = await pdfToText(bytes);

    const warnungen: string[] = [];
    const hinweise: string[] = [];

    // ---- Kopfdaten
    const h = text.match(RE_HEADER);
    if (!h) throw new Error('Rechnungsnummer/Datum nicht gefunden — ist das eine Teuni-Rechnung?');
    const rechnungsnummer = h[1];
    const rechnungsdatum = `${h[4]}-${h[3]}-${h[2]}`;

    const d = text.match(RE_DUE);
    const faelligkeitsdatum = d ? `${d[3]}-${d[2]}-${d[1]}` : null;

    const t = text.match(RE_TOTAL);
    if (!t) throw new Error('Gesamtbetrag nicht gefunden');
    const bruttobetrag = num(t[1]);

    // ---- Positionen
    const positionen: Position[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      const m = line.match(RE_POS);
      if (!m) continue;
      const p: Position = {
        pos: parseInt(m[1]), artikel: m[2], bezeichnung: m[3].trim(),
        menge: num(m[4]), einheit: m[5].replace('.', ''), preis: num(m[6]),
        gesamt: num(m[7]), summe: num(m[8]), ust: parseInt(m[9]),
      };
      const erwartet = round2(p.menge * p.preis);
      if (Math.abs(erwartet - p.gesamt) > 0.01) {
        warnungen.push(`Pos ${p.pos} (${p.artikel}): ${p.menge} × ${p.preis} = ${erwartet.toFixed(2)}, Rechnung sagt ${p.gesamt.toFixed(2)}`);
      }
      positionen.push(p);
    }

    if (positionen.length === 0) {
      throw new Error('Keine Positionen erkannt — Format vermutlich geändert');
    }

    const summePos = round2(positionen.reduce((s, p) => s + p.summe, 0));
    if (Math.abs(summePos - bruttobetrag) > 0.01) {
      warnungen.push(`Summe der Positionen ${summePos.toFixed(2)} weicht vom Gesamtbetrag ${bruttobetrag.toFixed(2)} ab`);
    }

    // ---- Preisvergleich gegen die eigene Liste
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Preisliste der FERIENHAEUSER holen (rental_type = 'tourist').
    // Teuni-Rechnungen sind Sammelrechnungen ueber beide Chalets — eine
    // Zuordnung zu einem einzelnen Haus gibt es nicht. Langzeitvermietung
    // hat keinen Waescheservice und bleibt aussen vor.
    const { data: settings } = await supabase
      .from('ai_linen_settings')
      .select('prices, houses!inner(name, rental_type)')
      .eq('houses.rental_type', 'tourist');

    const listen = (settings ?? [])
      .filter((r: any) => r.prices)
      .map((r: any) => ({ haus: r.houses?.name as string, prices: r.prices as Record<string, number> }));

    let prices: Record<string, number> | null = listen[0]?.prices ?? null;

    // Weichen die Ferienhaeuser voneinander ab, ist der Vergleich mehrdeutig
    // -> melden statt still eine der beiden Listen zu bevorzugen.
    if (listen.length > 1) {
      const felder = new Set(listen.flatMap(l => Object.keys(l.prices)));
      for (const f of felder) {
        const werte = new Set(listen.map(l => l.prices[f]));
        if (werte.size > 1) {
          warnungen.push(`Preis "${f}" ist je Haus verschieden (${listen.map(l => `${l.haus}: ${l.prices[f] ?? '—'}`).join(', ')}) — verglichen wurde gegen ${listen[0].haus}`);
        }
      }
    }
    if (!prices) {
      warnungen.push('Keine Preisliste für die Ferienhäuser gefunden — kein Preisvergleich möglich');
    }

    const preisabweichungen: Array<{
      artikel: string; feld: string; unser_preis: number; teuni_preis: number; differenz: number;
    }> = [];

    for (const p of positionen) {
      const map = ARTIKEL_MAP[p.artikel];

      if (!map) {
        // Neuer Artikel — melden, NICHT verschlucken. Teuni erweitert ihr
        // Sortiment; ein stilles Überspringen würde die Prüfung wertlos machen.
        warnungen.push(`Unbekannter Artikel ${p.artikel} (${p.bezeichnung}) zu ${p.preis.toFixed(2)} — Zuordnung fehlt, bitte Preisliste ergänzen`);
        continue;
      }
      if (map.hinweis) hinweise.push(`${p.artikel}: ${map.hinweis}`);
      if (!map.feld || !prices) continue;

      const unser = prices[map.feld];
      if (typeof unser !== 'number') {
        warnungen.push(`${p.artikel} → Feld "${map.feld}" fehlt in der Preisliste`);
        continue;
      }
      if (Math.abs(unser - p.preis) > 0.001) {
        preisabweichungen.push({
          artikel: p.artikel, feld: map.feld,
          unser_preis: unser, teuni_preis: p.preis,
          differenz: round2(p.preis - unser),
        });
      }
    }

    // ---- Dublettenprüfung
    const { data: vorhanden } = await supabase
      .from('laundry_invoices')
      .select('id, bruttobetrag, status, rechnungsdatum')
      .eq('rechnungsnummer', rechnungsnummer)
      .eq('rechnungsdatum', rechnungsdatum)
      .maybeSingle();

    // "bereits erfasst" ist KEINE Warnung, sondern ein Zustand. Es wird ueber
    // das Flag bereits_erfasst transportiert und im Dialog einmal angezeigt —
    // nicht zusaetzlich als Pruefpunkt, sonst steht dieselbe Information
    // doppelt auf dem Schirm.
    const erfasstInfo = vorhanden
      ? `Bereits erfasst am ${vorhanden.rechnungsdatum ?? rechnungsdatum} (Status ${vorhanden.status}, ${Number(vorhanden.bruttobetrag).toFixed(2)} EUR)`
      : null;

    return new Response(JSON.stringify({
      ok: true,
      bereits_erfasst: !!vorhanden,
      erfasst_info: erfasstInfo,
      rechnung: {
        rechnungsnummer, rechnungsdatum, faelligkeitsdatum,
        bruttobetrag, nettobetrag: bruttobetrag, // Kleinunternehmer: 0% USt
      },
      positionen,
      preisabweichungen,
      warnungen,
      hinweise: [...new Set(hinweise)],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
