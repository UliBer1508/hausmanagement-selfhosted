import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// REINIGUNGSRECHNUNG EINLESEN (import-boris-invoice)
// ============================================================
//
// Zweck: Ein Rechnungs-PDF von Borislav Pantelic (Reinigung & Haus-
// betreuung) lesen, die Positionen extrahieren, rechnerisch pruefen und
// jede Position einer Reinigung aus service_tasks zuordnen.
//
// UNTERSCHIED ZU TEUNI, und der Grund fuer diese eigene Funktion:
// Boris' Rechnung schluesselt AUF. Jede Zeile nennt Datum und Objekt:
//
//     Apartment Reinigung in Wald, Chalet 17    2.8.2026   1 x Reinigen  EUR 150,00
//     Apartment Reinigung in Vendiger          29.7.26     1 x Reinigen  EUR 150,00
//
// Damit ist die Zuordnung zu einzelnen Reinigungen fachlich bestimmbar —
// bei Teuni ist sie es nicht, weil dort Sammelrechnungen ohne Bezug zur
// einzelnen Lieferung stehen (siehe CODE-INDEX, Abschnitt 11).
//
// SCHREIBT NICHTS. Wie bei Teuni: Diese Funktion liest, prueft und
// schlaegt vor. Angelegt wird die Rechnung vom Frontend nach Freigabe
// durch den Menschen. Bei Geld setzt keine automatische Erkennung einen
// Betrag, den niemand angesehen hat.
//
// BEWUSST IN KAUF GENOMMENE DOPPLUNG (03.09.2026):
// Die PDF-Textextraktion (Objekte sammeln, Fonts, Contentstreams,
// Zeilenbildung — rund 380 Zeilen) ist mit import-teuni-invoice
// IDENTISCH. Sauberer waere ein gemeinsames Modul unter _shared/. Uli hat
// sich bewusst fuer eine eigenstaendige Funktion entschieden, damit eine
// Aenderung am Boris-Format die laufende Teuni-Verarbeitung nicht
// gefaehrden kann.
// FOLGE, die jeder kennen muss, der hier arbeitet: Ein Fehler im Leser
// muss an ZWEI Stellen behoben werden. Wer eine der beiden Dateien im
// Extraktionsteil aendert, prueft die andere mit.
//
// ZUORDNUNG POSITION -> REINIGUNG
// -------------------------------
// Ueber DATUM + HAUS. Beides steht in der Zeile.
//
// Das Haus wird ueber houses.dokument_begriffe erkannt, nicht ueber den
// Namen: Boris schreibt "Wald, Chalet 17" und "Vendiger" (ohne zweites
// "e"). Die Systemnamen "Wald Chalet" und "Venediger Chalet" treffen das
// nicht. Gepflegt wird das in den Stammdaten, nicht hier im Code.
//
// Gesucht wird eine Reinigung dieses Hauses am genannten Tag. Wird KEINE
// gefunden oder MEHRERE, wird das gemeldet — nicht geraten. Der Mensch
// entscheidet dann im Dialog.

interface BorisPosition {
  pos: number;
  beschreibung: string;
  datum: string;            // ISO, YYYY-MM-DD
  datum_roh: string;        // wie im PDF, fuer die Anzeige
  menge: number;
  betrag: number;           // netto, EUR
  haus_id: string | null;
  haus_name: string | null;
  task_id: string | null;
  zuordnung: 'eindeutig' | 'kein_treffer' | 'mehrdeutig' | 'haus_unbekannt';
  hinweis: string | null;
}

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



/* ================================================================
   BORIS-SPEZIFISCHE REGELN
   ================================================================ */

/*
 * Kopfdaten. Boris schreibt einen Punkt VOR den Doppelpunkt
 * ("Datum.:17.08.2026") — ungewoehnlich, aber stabil ueber die
 * geprueften Rechnungen. Der Punkt wird optional gefasst, damit ein
 * Wegfall die Erkennung nicht bricht.
 */
const RE_NUMMER = /Rechnungsnummer\s*\.?\s*:\s*([0-9]+\s*\/\s*[0-9]{4})/i;
const RE_DATUM  = /Datum\s*\.?\s*:\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i;

/*
 * Summen. "ohne MwSt" = netto, "inkl. MwSt." = brutto.
 * Das Eurozeichen steht VOR dem Betrag — anders als bei Teuni.
 */
const RE_NETTO  = /ohne\s+MwSt\D{0,12}([\d.,]+)/i;
const RE_SATZ   = /MwSt\.?\s*([\d.,]+)\s*%/i;
const RE_MWST   = /MwSt\.?\s*[\d.,]+\s*%\D{0,12}([\d.,]+)/i;
const RE_BRUTTO = /inkl\.?\s*MwSt\D{0,12}([\d.,]+)/i;

/*
 * Positionszeile. Aufbau laut PDF:
 *   <Beschreibung>  <Datum>  <Menge> x Reinigen  EUR <Betrag>
 *
 * ZWEI DATUMSFORMATE in derselben Tabelle, an Rechnung 002048/2026
 * belegt: "2.8.2026" und "29.7.26". Tag und Monat ein- oder zweistellig,
 * Jahr zwei- oder vierstellig. Alles vier Varianten muessen greifen.
 *
 * Die Beschreibung wird nicht-gierig gefasst, damit sie nicht ins Datum
 * hineinlaeuft.
 */
const RE_POS = /^(.+?)\s+(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d+)\s*x\s*Reinigen\D{0,12}([\d.,]+)\s*$/i;

/** Deutsches Zahlformat: 1.234,56 -> 1234.56 */
function zahl(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
}

/**
 * Zwei- und vierstellige Jahreszahlen zu ISO.
 *
 * "26" wird zu 2026. Die Grenze bei 70 ist willkuerlich, aber
 * unproblematisch: Rechnungen aus den 1900ern gibt es hier nicht.
 */
function isoDatum(tag: string, monat: string, jahr: string): string {
  let j = parseInt(jahr, 10);
  if (j < 100) j += j < 70 ? 2000 : 1900;
  const t = tag.padStart(2, '0');
  const m = monat.padStart(2, '0');
  return `${j}-${m}-${t}`;
}

/**
 * Findet das Haus zu einer Positionsbeschreibung.
 *
 * Verglichen wird gegen dokument_begriffe UND den Namen. Gewonnen hat der
 * LAENGSTE Treffer: "Chalet 17" ist aussagekraeftiger als "Chalet", und
 * "Chalet" allein passt auf beide Haeuser.
 *
 * Bewusst KEINE Punktelogik wie in pdfText.ts: Hier geht es um eine
 * einzelne kurze Zeile, nicht um ein ganzes Dokument. Ein Begriff kommt
 * vor oder nicht.
 */
function findeHaus(
  beschreibung: string,
  haeuser: Array<{ id: string; name: string; dokument_begriffe: string[] | null }>,
): { id: string; name: string } | null {
  const text = beschreibung.toLowerCase();
  let bester: { id: string; name: string; laenge: number } | null = null;

  for (const h of haeuser) {
    const kandidaten = [h.name, ...(h.dokument_begriffe ?? [])];
    for (const k of kandidaten) {
      const begriff = String(k ?? '').trim().toLowerCase();
      // Unter vier Zeichen traefe zu vieles.
      if (begriff.length < 4) continue;
      if (!text.includes(begriff)) continue;
      if (!bester || begriff.length > bester.laenge) {
        bester = { id: h.id, name: h.name, laenge: begriff.length };
      }
    }
  }

  return bester ? { id: bester.id, name: bester.name } : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { pdf_base64, provider_id } = await req.json();
    if (!pdf_base64) throw new Error('pdf_base64 fehlt');
    if (!provider_id) throw new Error('provider_id fehlt');

    const bytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
    const text = await pdfToText(bytes);

    const warnungen: string[] = [];
    const hinweise: string[] = [];

    // ---- Kopfdaten
    const mNummer = text.match(RE_NUMMER);
    if (!mNummer) {
      throw new Error('Rechnungsnummer nicht gefunden — ist das eine Rechnung von Boris?');
    }
    // Leerzeichen um den Schraegstrich entfernen: "002048 / 2026" -> "002048/2026"
    const rechnungsnummer = mNummer[1].replace(/\s+/g, '');

    const mDatum = text.match(RE_DATUM);
    if (!mDatum) throw new Error('Rechnungsdatum nicht gefunden');
    const rechnungsdatum = isoDatum(mDatum[1], mDatum[2], mDatum[3]);

    // ---- Summen
    const mBrutto = text.match(RE_BRUTTO);
    if (!mBrutto) throw new Error('Gesamtbetrag (inkl. MwSt) nicht gefunden');
    const bruttobetrag = zahl(mBrutto[1]);

    const mNetto = text.match(RE_NETTO);
    const nettobetrag = mNetto ? zahl(mNetto[1]) : null;

    /*
     * MwSt: erst lesen, dann rechnen.
     *
     * ANLASS, am 03.09.2026 an Rechnung 002048/2026 beobachtet: Netto und
     * Brutto wurden sauber gelesen, Satz und Betrag blieben leer. Der
     * Unterschied zwischen den Regeln ist das PROZENTZEICHEN — nur
     * RE_SATZ und RE_MWST verlangen es. Vermutlich kommt es aus der
     * Textextraktion nicht sauber heraus; nachgewiesen ist das nicht.
     *
     * Statt die Regel auf eine Vermutung hin umzubauen, wird gerechnet:
     * Netto und Brutto stehen fest, alles andere ergibt sich zwingend
     * daraus. Das haelt auch, wenn Boris das Zeichen weglaesst oder seine
     * Software es anders setzt.
     *
     * Die gelesenen Werte haben Vorrang — gerechnet wird nur, was fehlt.
     */
    const mSatz = text.match(RE_SATZ);
    const mMwst = text.match(RE_MWST);

    let mwst_satz = mSatz ? zahl(mSatz[1]) : null;
    let mwst_betrag = mMwst ? zahl(mMwst[1]) : null;
    let mwst_gerechnet = false;

    if (nettobetrag !== null) {
      if (mwst_betrag === null) {
        const diff = round2(bruttobetrag - nettobetrag);
        // Nur uebernehmen, wenn es plausibel ist. Ein negativer Wert
        // hiesse, dass Netto und Brutto vertauscht gelesen wurden — dann
        // lieber leer lassen als etwas Falsches speichern.
        if (diff >= 0) {
          mwst_betrag = diff;
          mwst_gerechnet = true;
        }
      }
      if (mwst_satz === null && mwst_betrag !== null && nettobetrag > 0) {
        mwst_satz = round2((mwst_betrag / nettobetrag) * 100);
        mwst_gerechnet = true;
      }
    }

    if (mwst_gerechnet) {
      hinweise.push(
        `Umsatzsteuer war im PDF nicht lesbar und wurde aus Netto und Brutto errechnet: ${mwst_betrag?.toFixed(2)} EUR (${mwst_satz?.toFixed(2)} %). Bitte gegen die Rechnung pruefen.`,
      );
    }

    // ---- Haeuser laden, fuer die Zuordnung
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: haeuser, error: hErr } = await supabase
      .from('houses')
      .select('id, name, dokument_begriffe');
    if (hErr) throw hErr;

    // ---- Positionen
    const positionen: BorisPosition[] = [];
    let nr = 0;

    for (const roh of text.split('\n')) {
      const zeile = roh.trim();
      if (!zeile) continue;

      const m = zeile.match(RE_POS);
      if (!m) continue;

      nr += 1;
      const beschreibung = m[1].trim();
      const datum = isoDatum(m[2], m[3], m[4]);
      const menge = parseInt(m[5], 10);
      const betrag = zahl(m[6]);

      const haus = findeHaus(beschreibung, (haeuser ?? []) as any[]);

      positionen.push({
        pos: nr,
        beschreibung,
        datum,
        datum_roh: `${m[2]}.${m[3]}.${m[4]}`,
        menge,
        betrag,
        haus_id: haus?.id ?? null,
        haus_name: haus?.name ?? null,
        task_id: null,
        zuordnung: haus ? 'kein_treffer' : 'haus_unbekannt',
        hinweis: haus
          ? null
          : `Kein Haus erkannt in "${beschreibung}". Schreibweise unter Stammdaten → Haus → Dokumentbegriffe ergaenzen.`,
      });
    }

    if (positionen.length === 0) {
      throw new Error('Keine Positionen gefunden — Layout der Rechnung abweichend?');
    }

    // ---- Rechnung gegen sich selbst pruefen
    const summePositionen = positionen.reduce((s, p) => s + p.betrag, 0);
    if (nettobetrag !== null && Math.abs(summePositionen - nettobetrag) > 0.02) {
      warnungen.push(
        `Summe der Positionen (${summePositionen.toFixed(2)} EUR) weicht vom ausgewiesenen Nettobetrag (${nettobetrag.toFixed(2)} EUR) ab.`,
      );
    }
    // Nur pruefen, wenn die MwSt GELESEN wurde. Ist sie aus Netto und
    // Brutto errechnet, ginge die Rechnung zwangslaeufig auf — die
    // Pruefung wuerde sich selbst bestaetigen und waere wertlos.
    if (nettobetrag !== null && mwst_betrag !== null && !mwst_gerechnet) {
      const erwartet = nettobetrag + mwst_betrag;
      if (Math.abs(erwartet - bruttobetrag) > 0.02) {
        warnungen.push(
          `Netto + MwSt (${erwartet.toFixed(2)} EUR) ergibt nicht den Bruttobetrag (${bruttobetrag.toFixed(2)} EUR).`,
        );
      }
    }

    // ---- Zuordnung zu Reinigungen: Datum + Haus
    //
    // Gesucht wird je Position eine Reinigung dieses Hauses an diesem Tag.
    // KEIN Zeitfenster, kein "naechstgelegener Termin": Boris nennt das
    // Datum ausdruecklich. Weicht es ab, ist das eine Abweichung, die der
    // Mensch sehen muss — nicht etwas, das die Funktion glattbuegelt.
    const daten = [...new Set(positionen.map((p) => p.datum))];
    const { data: tasks, error: tErr } = await supabase
      .from('service_tasks')
      .select('id, house_id, scheduled_date, status, cleaning_invoice_id, payment_status')
      .eq('provider_id', provider_id)
      .in('scheduled_date', daten);
    if (tErr) throw tErr;

    for (const p of positionen) {
      if (!p.haus_id) continue;

      const passend = (tasks ?? []).filter(
        (t: any) => t.house_id === p.haus_id && t.scheduled_date === p.datum,
      );

      if (passend.length === 1) {
        const t = passend[0] as any;
        p.task_id = t.id;
        p.zuordnung = 'eindeutig';
        if (t.cleaning_invoice_id) {
          p.hinweis = 'Diese Reinigung ist bereits auf einer anderen Rechnung abgerechnet.';
          warnungen.push(
            `Position ${p.pos} (${p.haus_name}, ${p.datum_roh}) haengt schon an einer Rechnung.`,
          );
        }
      } else if (passend.length === 0) {
        p.zuordnung = 'kein_treffer';
        p.hinweis = 'Keine Reinigung dieses Hauses an diesem Tag gefunden.';
        hinweise.push(
          `Position ${p.pos}: keine Reinigung fuer ${p.haus_name} am ${p.datum_roh}.`,
        );
      } else {
        p.zuordnung = 'mehrdeutig';
        p.hinweis = `${passend.length} Reinigungen dieses Hauses an diesem Tag — bitte von Hand waehlen.`;
        hinweise.push(
          `Position ${p.pos}: mehrere Reinigungen fuer ${p.haus_name} am ${p.datum_roh}.`,
        );
      }
    }

    // ---- Ist diese Rechnung schon erfasst?
    //
    // Eindeutig JE DIENSTLEISTER, nicht global — Boris nummeriert
    // "002048/2026", Teuni rein numerisch. Entspricht dem UNIQUE-Index
    // aus 53_reinigungsrechnungen.sql.
    const { data: vorhanden } = await supabase
      .from('cleaning_invoices')
      .select('id, rechnungsdatum, status, bruttobetrag')
      .eq('provider_id', provider_id)
      .ilike('rechnungsnummer', rechnungsnummer)
      .maybeSingle();

    return json({
      ok: true,
      bereits_erfasst: !!vorhanden,
      erfasst_id: vorhanden?.id ?? null,
      erfasst_info: vorhanden
        ? `Rechnung ${rechnungsnummer} ist bereits erfasst (Stand ${vorhanden.rechnungsdatum}, ${vorhanden.status}).`
        : null,
      rechnung: {
        rechnungsnummer,
        rechnungsdatum,
        faelligkeitsdatum: null,   // Boris nennt kein Datum, nur "innerhalb 7 Tage"
        nettobetrag,
        mwst_satz,
        mwst_betrag,
        bruttobetrag,
      },
      positionen,
      warnungen,
      hinweise,
    });
  } catch (e) {
    console.error('import-boris-invoice:', e);
    return json({ ok: false, error: (e as Error).message }, 400);
  }
});
