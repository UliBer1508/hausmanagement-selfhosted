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
// ZWEI PDF-BAUARTEN (Befund 01.08.2026 an RG-0098):
//
//   (a) ALT — Schrift mit 1-Byte-Kodierung (WinAnsi). Ein Byte = ein Zeichen.
//       So waren die sechs Rechnungen aus 2025/2026 gebaut, gegen die dieser
//       Extraktor urspruenglich entwickelt wurde.
//
//   (b) NEU — Schrift als Type0/CID mit /Encoding /Identity-H. ZWEI Bytes =
//       ein Zeichen, und die Zahl dahinter ist KEIN Unicode, sondern eine
//       Glyphennummer der jeweiligen Schrift. Uebersetzt wird sie ueber die
//       im PDF eingebettete /ToUnicode-CMap.
//
// RG-0098 (31.07.2026) ist die erste Rechnung der Bauart (b): alle vier
// verwendeten Schriften (ArialMT, Arial-BoldMT, Calibri, TimesNewRomanPSMT)
// sind Type0/Identity-H. Der alte Extraktor las jedes Byte einzeln und lieferte
// Zeichensalat — die Anker-Regex fanden nichts, die Funktion antwortete mit
// "Rechnungsnummer/Datum nicht gefunden" (HTTP 400). Im Dialog kam davon nur
// "Edge Function returned a non-2xx status code" an.
//
// Vermutlich ein Versionswechsel der Rechnungssoftware bei Teuni: dieselbe
// Rechnung fuehrt auch erstmals den Artikel MW4 statt MW3.
//
// DIESE FASSUNG BEHERRSCHT BEIDE BAUARTEN. Erkannt wird am Font-Objekt, nicht
// geraten: /Subtype /Type0 bzw. /Encoding /Identity-H -> 2 Byte + CMap,
// sonst der bisherige 1-Byte-Weg. Aeltere Rechnungen laufen damit unveraendert
// durch denselben Pfad wie bisher.
//
// ZUSAETZLICH NOETIG: Bauart (b) legt die Font-Dictionaries in einem
// komprimierten Objekt-Stream (/Type /ObjStm) ab, nicht als einzelne Objekte.
// Ohne dessen Aufloesung findet man die Schriften gar nicht erst.

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

interface PdfObjekt { dict: string; data: Uint8Array | null; }

// Alle indirekten Objekte einsammeln — direkte ("N 0 obj … endobj") UND die,
// die in einem Objekt-Stream stecken.
//
// Wir gehen von der OBJEKTGRENZE aus, nicht per lastIndexOf("<<") — bei
// verschachtelten Dictionaries traefe das sonst die falsche Klammer, und ein
// "stream"-Vorkommen im bereits dekodierten Text wuerde faelschlich als
// Streamanfang gewertet.
async function sammleObjekte(bytes: Uint8Array): Promise<Map<number, PdfObjekt>> {
  const latin = new TextDecoder('latin1').decode(bytes);
  const objekte = new Map<number, PdfObjekt>();

  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  const direkte: Array<{ num: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(latin)) !== null) {
    direkte.push({ num: parseInt(m[1]), start: m.index + m[0].length });
  }

  for (const o of direkte) {
    const sIdx = latin.indexOf('stream', o.start);
    const eIdx = latin.indexOf('endobj', o.start);
    const hatStream = sIdx >= 0 && (eIdx < 0 || sIdx < eIdx);

    if (!hatStream) {
      objekte.set(o.num, {
        dict: latin.slice(o.start, eIdx < 0 ? Math.min(o.start + 4000, latin.length) : eIdx),
        data: null,
      });
      continue;
    }

    const dict = latin.slice(o.start, sIdx);
    let ds = sIdx + 'stream'.length;
    if (latin[ds] === '\r') ds++;
    if (latin[ds] === '\n') ds++;
    let de = latin.indexOf('endstream', ds);
    if (de < 0) continue;
    // Der Zeilenumbruch VOR "endstream" gehoert nicht zu den Streamdaten.
    // Bleibt er drin, meldet DecompressionStream "failed to write whole
    // buffer" — verifiziert am 24.07.2026.
    if (latin[de - 1] === '\n') de--;
    if (latin[de - 1] === '\r') de--;

    let raw: Uint8Array | null = bytes.slice(ds, de);
    if (/FlateDecode/.test(dict)) {
      try { raw = await inflateAsync(raw); } catch { raw = null; }
    }
    objekte.set(o.num, { dict, data: raw });
  }

  // Objekt-Streams aufloesen: dort stecken bei Bauart (b) die Font-Dictionaries.
  // Aufbau: Kopf aus N Zahlenpaaren (Objektnummer, Offset), danach ab /First
  // die Objekt-Koerper hintereinander.
  for (const o of [...objekte.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.data) continue;
    const txt = new TextDecoder('latin1').decode(o.data);
    const nMatch = o.dict.match(/\/N\s+(\d+)/);
    const firstMatch = o.dict.match(/\/First\s+(\d+)/);
    if (!nMatch || !firstMatch) continue;
    const N = parseInt(nMatch[1]);
    const First = parseInt(firstMatch[1]);

    const kopf = txt.slice(0, First).trim().split(/\s+/).map(Number);
    const paare: Array<[number, number]> = [];
    for (let i = 0; i + 1 < N * 2; i += 2) {
      if (!isNaN(kopf[i]) && !isNaN(kopf[i + 1])) paare.push([kopf[i], kopf[i + 1]]);
    }
    const sortiert = [...paare].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < sortiert.length; i++) {
      const [num, off] = sortiert[i];
      const start = First + off;
      const end = i + 1 < sortiert.length ? First + sortiert[i + 1][1] : txt.length;
      // Direkte Objekte gewinnen — sie sind die vollstaendigeren.
      if (!objekte.has(num)) objekte.set(num, { dict: txt.slice(start, end), data: null });
    }
  }

  return objekte;
}

// ToUnicode-CMap lesen: uebersetzt Glyphennummer -> lesbares Zeichen.
// Zwei Bauformen: einzelne Paare (bfchar) und Bereiche (bfrange, mit
// fortlaufendem Ziel oder expliziter Liste).
function parseToUnicode(cmapText: string): Map<number, string> {
  const map = new Map<number, string>();

  // Ziele sind UTF-16BE in Hex, ggf. mehrere Zeichen hintereinander.
  const hexToStr = (h: string): string => {
    let s = '';
    for (let i = 0; i + 4 <= h.length; i += 4) {
      const cp = parseInt(h.slice(i, i + 4), 16);
      if (!isNaN(cp)) s += String.fromCharCode(cp);
    }
    return s;
  };

  for (const blk of cmapText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(p[1], 16), hexToStr(p[2]));
    }
  }

  for (const blk of cmapText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = blk[1];
    // Form 1: <lo> <hi> <ziel-basis>
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(p[1], 16);
      const hi = parseInt(p[2], 16);
      const basis = parseInt(p[3], 16);
      // Deckel gegen absurd grosse Bereiche in defekten PDFs.
      for (let c = lo; c <= hi && c - lo < 65536; c++) {
        map.set(c, String.fromCharCode(basis + (c - lo)));
      }
    }
    // Form 2: <lo> <hi> [ <z1> <z2> … ]
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(p[1], 16);
      const ziele = [...p[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => hexToStr(x[1]));
      ziele.forEach((z, i) => map.set(lo + i, z));
    }
  }

  return map;
}

interface PdfFont { twoByte: boolean; toUni: Map<number, string> | null; }

// Ressourcenname ("F0") -> Schrifteigenschaften. Die Zuordnung steht im
// Page-Objekt unter /Resources /Font << /F0 7 0 R … >>.
function baueFonts(objekte: Map<number, PdfObjekt>): Map<string, PdfFont> {
  const fonts = new Map<string, PdfFont>();

  for (const o of objekte.values()) {
    const resMatch = o.dict.match(/\/Font\s*<<([^>]*)>>/);
    if (!resMatch) continue;

    for (const r of resMatch[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const resName = r[1];
      const fontObj = objekte.get(parseInt(r[2]));
      if (!fontObj) continue;

      const twoByte = /\/Subtype\s*\/Type0/.test(fontObj.dict) ||
                      /\/Encoding\s*\/Identity-H/.test(fontObj.dict);

      let toUni: Map<number, string> | null = null;
      const tu = fontObj.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (tu) {
        const cm = objekte.get(parseInt(tu[1]));
        if (cm?.data) toUni = parseToUnicode(new TextDecoder('latin1').decode(cm.data));
      }

      fonts.set(resName, { twoByte, toUni });
    }
  }

  return fonts;
}

// Contentstreams der Seiten: alles, was Textoperatoren enthaelt.
// Bilder, Schriftdateien, Metadaten und CMaps werden ausgeschlossen.
function contentStreams(objekte: Map<number, PdfObjekt>): string[] {
  const out: string[] = [];
  for (const o of objekte.values()) {
    if (!o.data) continue;
    if (/\/Subtype\s*\/(Image|XML|Type1C|TrueType)|\/DCTDecode|\/FontFile|\/Type\s*\/(ObjStm|XRef|Metadata|CMap)/.test(o.dict)) continue;
    const txt = new TextDecoder('latin1').decode(o.data);
    if (/\bTj\b|\bTJ\b/.test(txt)) out.push(txt);
  }
  return out;
}

const WIN1252_EXTRA: Record<number, string> = {
  128: '\u20ac', 130: '\u201a', 131: '\u0192', 132: '\u201e', 133: '\u2026',
  145: '\u2018', 146: '\u2019', 147: '\u201c', 148: '\u201d', 150: '\u2013',
  151: '\u2014', 153: '\u2122',
};

// Literal-String "(...)" in seine ROHEN Bytes zerlegen. Bewusst Bytes und
// nicht Zeichen: erst die Schrift entscheidet, ob eins oder zwei Bytes ein
// Zeichen ergeben.
function rohBytesAusLiteral(s: string): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      const simple: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (simple[n] !== undefined) { out.push(simple[n]); i += 2; continue; }
      const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
      if (oct) { out.push(parseInt(oct[0], 8) & 0xff); i += 1 + oct[0].length; continue; }
      out.push(n.charCodeAt(0) & 0xff); i += 2; continue;
    }
    out.push(c.charCodeAt(0) & 0xff);
    i++;
  }
  return out;
}

// Hex-String "<...>" in rohe Bytes.
function rohBytesAusHex(h: string): number[] {
  const clean = h.replace(/[^0-9A-Fa-f]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16));
  }
  return out;
}

// Bytes -> Text, abhaengig von der aktiven Schrift.
function dekodiere(bytesArr: number[], font: PdfFont | null): string {
  if (font?.twoByte) {
    let s = '';
    for (let i = 0; i + 1 < bytesArr.length; i += 2) {
      const code = (bytesArr[i] << 8) | bytesArr[i + 1];
      s += font.toUni?.get(code) ?? '';
    }
    return s;
  }
  // 1-Byte-Weg (Bauart a) — unveraendert wie bisher.
  return bytesArr.map((b) => WIN1252_EXTRA[b] ?? String.fromCharCode(b)).join('');
}

interface Frag { y: number; x: number; s: string; }

function extractFromStream(content: string, fonts: Map<string, PdfFont>): Frag[] {
  const frags: Frag[] = [];
  let cm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let tx = 0, ty = 0;
  let font: PdfFont | null = null;

  const TOKEN = new RegExp([
    /\(((?:[^()\\]|\\.)*)\)\s*Tj/.source,                                                     // 1
    /\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/.source,                                                   // 2
    /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(cm|Tm)/.source, // 3-9
    /([-\d.]+)\s+([-\d.]+)\s+Td/.source,                                                      // 10,11
    /(BT|ET|q|Q)/.source,                                                                     // 12
    /\/([A-Za-z0-9]+)\s+[-\d.]+\s+Tf/.source,                                                 // 13  Schriftwahl
    /<([0-9A-Fa-f\s]+)>\s*Tj/.source,                                                         // 14  Hex-String
  ].join('|'), 'g');

  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(content)) !== null) {
    // Tf: ab hier gilt eine andere Schrift — entscheidend fuer 1 oder 2 Byte.
    if (m[13]) { font = fonts.get(m[13]) ?? null; continue; }

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
    if (m[1] !== undefined) {
      s = dekodiere(rohBytesAusLiteral(m[1]), font);
    } else if (m[14] !== undefined) {
      s = dekodiere(rohBytesAusHex(m[14]), font);
    } else if (m[2] !== undefined) {
      // TJ-Array: Mischung aus Strings und Abstandszahlen.
      let acc = '';
      for (const t of m[2].matchAll(/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>/g)) {
        acc += t[1] !== undefined
          ? dekodiere(rohBytesAusLiteral(t[1]), font)
          : dekodiere(rohBytesAusHex(t[2]), font);
      }
      s = acc;
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
  const objekte = await sammleObjekte(bytes);
  const fonts = baueFonts(objekte);
  const streams = contentStreams(objekte);
  if (streams.length === 0) throw new Error('Kein lesbarer Textstream im PDF gefunden');

  const parts: string[] = [];
  for (const st of streams) {
    const f = extractFromStream(st, fonts);
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
