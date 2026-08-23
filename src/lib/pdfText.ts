/**
 * pdfText.ts — PDF-Text lesen und daraus Attribute vorschlagen.
 *
 * ============================================================
 * HERKUNFT DES LESERS — WICHTIG BEIM AENDERN
 * ============================================================
 * Der Extraktionsteil (sammleObjekte, parseToUnicode, baueFonts,
 * contentStreams, extractFromStream, fragsToLines, pdfToText) ist
 * WOERTLICH uebernommen aus
 *
 *     supabase/functions/import-teuni-invoice/index.ts
 *
 * Er existiert damit ZWEIMAL im Projekt. Das ist eine bewusste
 * Entscheidung vom 23.08.2026: Die Teuni-Funktion laeuft produktiv und
 * wurde gegen sechs echte Rechnungen erprobt; sie anzufassen, nur um
 * hier Code zu sparen, waere ein Risiko ohne Gegenwert gewesen.
 *
 * FOLGE: Wer eine Schwaeche im PDF-Lesen findet, muss BEIDE Stellen
 * korrigieren. Das ist ein Doppelgaenger im Sinne des CODE-INDEX,
 * Abschnitt 3 — und gehoert dort vermerkt.
 *
 * Zusammenfuehren waere spaeter moeglich (gemeinsame Datei unter
 * supabase/functions/_shared/), verlangt aber ein erneutes Deploy und
 * einen Test des Teuni-Imports. Erst wenn dieser Leseweg sich bewaehrt
 * hat, lohnt das.
 *
 * ============================================================
 * WAS DIESE DATEI NICHT TUT
 * ============================================================
 * Sie liest KEINE Betraege, Rechnungsnummern oder Positionen aus. Das
 * macht bewusst nur import-teuni-invoice, und zwar mit Pruefungen und
 * ohne zu schreiben. Hier geht es allein darum, WELCHES Objekt und
 * WELCHER Dokumenttyp gemeint sein koennte.
 *
 * Sie ruft keine KI. Der Abgleich ist ein Stichwortvergleich gegen die
 * Namen, die im System stehen — nachvollziehbar, kostenlos und ohne
 * Netzwerk. Was nicht angelegt ist, kann nicht gefunden werden.
 *
 * Scans ohne Textebene liefern keinen Text. Das wird gemeldet, nicht
 * verschwiegen.
 */

/* ================================================================
   TEIL 1 — PDF-Textextraktion (uebernommen, siehe Kopf)
   ================================================================ */

/**
 * ASCII85 dekodieren.
 *
 * ⚠️ ABWEICHUNG VOM ORIGINAL in import-teuni-invoice: Dort fehlt dieser
 * Schritt. Ein PDF mit /Filter [ /ASCII85Decode /FlateDecode ] — eine
 * Filterkette, die z. B. ReportLab erzeugt — liefert dort keinen Text.
 * Am 23.08.2026 an einem Testdokument nachgewiesen.
 *
 * Sollte bei Gelegenheit in die Teuni-Funktion zurueckfliessen. Bis dahin
 * koennen sich die beiden Fassungen an dieser Stelle unterschiedlich
 * verhalten — das ist der Preis der doppelten Ablage (siehe Dateikopf).
 */
function ascii85Decode(data: Uint8Array): Uint8Array {
  const txt = new TextDecoder('latin1').decode(data).replace(/\s/g, '');
  const kern = txt.replace(/^<~/, '').replace(/~>$/, '');
  const out: number[] = [];
  let gruppe: number[] = [];

  for (const ch of kern) {
    if (ch === 'z' && gruppe.length === 0) { out.push(0, 0, 0, 0); continue; }
    const c = ch.charCodeAt(0) - 33;
    if (c < 0 || c > 84) continue;
    gruppe.push(c);
    if (gruppe.length === 5) {
      let wert = 0;
      for (const g of gruppe) wert = wert * 85 + g;
      out.push((wert >>> 24) & 0xff, (wert >>> 16) & 0xff, (wert >>> 8) & 0xff, wert & 0xff);
      gruppe = [];
    }
  }

  // Unvollstaendige letzte Gruppe mit 'u' (84) auffuellen, dann kuerzen.
  if (gruppe.length > 1) {
    const fehlend = 5 - gruppe.length;
    for (let i = 0; i < fehlend; i++) gruppe.push(84);
    let wert = 0;
    for (const g of gruppe) wert = wert * 85 + g;
    const vier = [(wert >>> 24) & 0xff, (wert >>> 16) & 0xff, (wert >>> 8) & 0xff, wert & 0xff];
    out.push(...vier.slice(0, 4 - fehlend));
  }

  return new Uint8Array(out);
}

async function inflateAsync(data: Uint8Array): Promise<Uint8Array> {
  // PDF-FlateDecode ist zlib (mit Header). Falls das fehlschlaegt, ohne
  // Header versuchen — manche Erzeuger schreiben rohes deflate.
  for (const fmt of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([data as unknown as BlobPart]).stream()
        .pipeThrough(new DecompressionStream(fmt));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* naechstes Format */ }
  }
  throw new Error('Stream nicht dekomprimierbar');
}

interface PdfObjekt { dict: string; data: Uint8Array | null; }

/**
 * Alle indirekten Objekte einsammeln — direkte ("N 0 obj … endobj") UND die,
 * die in einem Objekt-Stream stecken.
 *
 * Wir gehen von der OBJEKTGRENZE aus, nicht per lastIndexOf("<<") — bei
 * verschachtelten Dictionaries traefe das sonst die falsche Klammer, und ein
 * "stream"-Vorkommen im bereits dekodierten Text wuerde faelschlich als
 * Streamanfang gewertet.
 */
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
    // Filter werden in der Reihenfolge angewandt, in der sie im Dictionary
    // stehen. ASCII85 kommt vor Flate, wenn beide vorhanden sind.
    if (/ASCII85Decode/.test(dict) && raw) {
      try { raw = ascii85Decode(raw); } catch { raw = null; }
    }
    if (/FlateDecode/.test(dict) && raw) {
      try { raw = await inflateAsync(raw); } catch { raw = null; }
    }
    objekte.set(o.num, { dict, data: raw });
  }

  // Objekt-Streams aufloesen: dort stecken bei neueren PDFs die
  // Font-Dictionaries. Aufbau: Kopf aus N Zahlenpaaren (Objektnummer,
  // Offset), danach ab /First die Objekt-Koerper hintereinander.
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

/**
 * ToUnicode-CMap lesen: uebersetzt Glyphennummer -> lesbares Zeichen.
 * Zwei Bauformen: einzelne Paare (bfchar) und Bereiche (bfrange, mit
 * fortlaufendem Ziel oder expliziter Liste).
 */
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

/**
 * Ressourcenname ("F0") -> Schrifteigenschaften.
 *
 * ZWEI PDF-BAUARTEN:
 *   (a) ALT — Schrift mit 1-Byte-Kodierung (WinAnsi). Ein Byte = ein Zeichen.
 *   (b) NEU — Type0/CID mit /Encoding /Identity-H. ZWEI Bytes = ein Zeichen,
 *       und die Zahl dahinter ist KEIN Unicode, sondern eine Glyphennummer.
 *       Uebersetzt wird sie ueber die eingebettete /ToUnicode-CMap.
 *
 * Erkannt wird am Font-Objekt, nicht geraten.
 */
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

/**
 * Contentstreams der Seiten: alles, was Textoperatoren enthaelt.
 * Bilder, Schriftdateien, Metadaten und CMaps werden ausgeschlossen.
 */
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

/**
 * Literal-String "(...)" in seine ROHEN Bytes zerlegen. Bewusst Bytes und
 * nicht Zeichen: erst die Schrift entscheidet, ob eins oder zwei Bytes ein
 * Zeichen ergeben.
 */
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

/** Hex-String "<...>" in rohe Bytes. */
function rohBytesAusHex(h: string): number[] {
  const clean = h.replace(/[^0-9A-Fa-f]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16));
  }
  return out;
}

/** Bytes -> Text, abhaengig von der aktiven Schrift. */
function dekodiere(bytesArr: number[], font: PdfFont | null): string {
  if (font?.twoByte) {
    let s = '';
    for (let i = 0; i + 1 < bytesArr.length; i += 2) {
      const code = (bytesArr[i] << 8) | bytesArr[i + 1];
      s += font.toUni?.get(code) ?? '';
    }
    return s;
  }
  // 1-Byte-Weg (Bauart a)
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
      const [a, b, c, d, e, f] = [3, 4, 5, 6, 7, 8].map((i) => parseFloat(m![i]));
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

  return lines.map((l) => {
    let s = l.sort((a, b) => a.x - b.x).map((f) => f.s).join(' ');
    // Der Tc-Operator (Zeichenabstand) zerlegt Woerter und Zahlen in
    // Einzelfragmente. Beim Zusammenfuegen entsteht "30 , 00" und
    // "G e s a m t b e t r a g" -> wieder zusammenziehen.
    s = s.replace(/(?<=\d) *([.,]) *(?=\d)/g, '$1');
    s = s.replace(/\b(?:[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df] ){2,}[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]\b/g,
                  (x: string) => x.replace(/ /g, ''));
    return s.replace(/ {2,}/g, ' ').trim();
  }).join('\n');
}

/** Liest den Text eines PDF. Wirft, wenn gar kein Textstream vorhanden ist. */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const objekte = await sammleObjekte(bytes);
  const fonts = baueFonts(objekte);
  const streams = contentStreams(objekte);
  if (streams.length === 0) {
    throw new Error('Kein lesbarer Text im PDF gefunden — vermutlich ein Scan ohne Textebene.');
  }

  const parts: string[] = [];
  for (const st of streams) {
    const f = extractFromStream(st, fonts);
    if (f.length) parts.push(fragsToLines(f));
  }
  return parts.join('\n');
}

/** Bequemer Einstieg fuer die Oberflaeche: Datei rein, Text raus. */
export async function leseDateiText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const text = await pdfToText(new Uint8Array(buf));
  if (!text.trim()) {
    throw new Error('Kein lesbarer Text im PDF gefunden — vermutlich ein Scan ohne Textebene.');
  }
  return text;
}

/* ================================================================
   TEIL 2 — Attribute im Text finden
   ================================================================ */

/** Ein Kandidat, gegen den der Text geprueft wird. */
export interface Kandidat {
  id: string;
  name: string;
}

/** Ein gefundener Treffer samt Begruendung. */
export interface Treffer {
  id: string;
  name: string;
  /** Je haeufiger und je mehrwortiger, desto hoeher. */
  punkte: number;
  /** Welche Begriffe wie oft vorkamen — fuer die Anzeige. */
  begriffe: Array<{ begriff: string; anzahl: number }>;
}

/**
 * Zerlegt einen Namen in suchbare Begriffe.
 *
 * "Boris (Borislav Pantelic)" ergibt "boris pantelic", "boris" und
 * "borislav pantelic" — der Klammerinhalt ist der buergerliche Name und
 * steht auf der Rechnung, der Kurzname im System.
 *
 * Woerter unter vier Zeichen fallen raus: "AG" oder "am" traefen sonst
 * in jedem zweiten Dokument.
 */
function begriffeAus(name: string): string[] {
  const roh = name.toLowerCase().trim();
  const menge = new Set<string>();

  // vollstaendiger Name ohne Klammern
  const ohneKlammern = roh.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (ohneKlammern.length >= 4) menge.add(ohneKlammern);

  // Klammerinhalt als eigener Begriff
  for (const k of roh.matchAll(/\(([^)]*)\)/g)) {
    const inhalt = k[1].trim();
    if (inhalt.length >= 4) menge.add(inhalt);
  }

  // Einzelwoerter, sofern lang genug
  for (const w of ohneKlammern.split(/[\s/,.-]+/)) {
    if (w.length >= 4) menge.add(w);
  }

  return [...menge];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Bewertet einen einzelnen Begriff im Text.
 *
 * ZWEI KORREKTUREN vom 23.08.2026, beide an einer echten Rechnung der
 * Marktgemeinde Neukirchen nachgewiesen. Dort gewann faelschlich der Typ
 * „Rechnung" gegen „Nächtigungsabgabe", obwohl letzteres als Ueberschrift
 * im Dokument steht:
 *
 *  (a) TEILWOERTER ZAEHLEN NUR HALB. „rechnung" traf zweimal — einmal
 *      davon in „RechnungsNUMMER". Aber jedes Dokument hat eine
 *      Rechnungsnummer; das ist kein Beleg dafuer, dass es eine Rechnung
 *      IST. Ein Treffer am Wortanfang mit Fortsetzung wiegt darum weniger
 *      als ein eigenstaendiges Wort.
 *
 *      Ganz ausschliessen waere falsch: deutsche Komposita. Steht im
 *      System „Wald Chalet" und im Dokument „Waldchalet", muss „wald"
 *      weiterhin treffen duerfen.
 *
 *  (b) LAENGERE BEGRIFFE WIEGEN SCHWERER. „Nächtigungsabgabe" kann kaum
 *      zufaellig auftauchen, „Rechnung" steht fast ueberall. Ohne diese
 *      Gewichtung gewinnt das haeufigere Allerweltswort gegen das
 *      seltene, aussagekraeftige.
 */
function bewerteBegriff(lower: string, begriff: string): { punkte: number; anzahl: number } {
  const b = escapeRe(begriff);

  /* WARUM NICHT \b:
     JavaScript zaehlt bei \b nur [A-Za-z0-9_] als Wortzeichen. Umlaute und
     ß gelten als Trennzeichen — in „Großvenediger" sieht \b darum eine
     Wortgrenze zwischen „Groß" und „venediger". Am 23.08.2026 an der
     Rechnung der Marktgemeinde nachgewiesen: „Venediger Chalet" bekam
     Punkte, obwohl im Dokument nur der ORTSNAME „Neukirchen am
     Großvenediger" stand. Mit \p{L} und /u stimmt die Grenze. */
  const VOR = '(?<![\\p{L}\\p{N}])';
  const NACH = '(?![\\p{L}\\p{N}])';

  const exakt = lower.match(new RegExp(`${VOR}${b}${NACH}`, 'gu'))?.length ?? 0;
  const alleAnfang = lower.match(new RegExp(`${VOR}${b}`, 'gu'))?.length ?? 0;
  const teil = Math.max(0, alleAnfang - exakt);

  if (exakt === 0 && teil === 0) return { punkte: 0, anzahl: 0 };

  // Wortanzahl und Zeichenlaenge bestimmen die Aussagekraft.
  // Bezug 10 Zeichen. Die Untergrenze 0.7 schuetzt kurze, aber echte Namen:
  // „Amela" hat nur fuenf Zeichen und darf deswegen nicht unter die
  // Nachweisschwelle rutschen.
  const gewicht = begriff.split(' ').length * Math.max(0.7, begriff.length / 10);

  return {
    punkte: (exakt + teil * 0.5) * gewicht,
    anzahl: exakt + teil,
  };
}

/**
 * Ab dieser Punktzahl gilt ein Treffer als vorschlagenswert.
 *
 * Ein EINZELNER Treffer, der nur am Wortanfang sitzt, kommt auf rund 0.45
 * und liegt damit darunter. Genau so ein Fall: „Venedigersiedlung" in Ulis
 * Anschrift liess „Venediger Chalet" aufscheinen, obwohl das Dokument ein
 * ganz anderes Objekt betraf. Ein exakter Treffer eines kurzen Namens
 * kommt auf 0.7 und bleibt erhalten.
 */
const MIN_PUNKTE = 0.6;

/**
 * Sucht alle Kandidaten im Text und gibt die Treffer sortiert zurueck.
 *
 * GEMEINSAME WOERTER ZAEHLEN NICHT. "Venediger Chalet" und "Wald Chalet"
 * teilen sich das Wort "chalet" — es kommt in jeder Rechnung vor, die eines
 * der Haeuser nennt, und unterscheidet deshalb nichts. Am 23.08.2026 im
 * Test beobachtet: beide Haeuser bekamen dieselbe Punktzahl, obwohl nur
 * eines gemeint war. Der VOLLE Name bleibt als Begriff erhalten, nur das
 * geteilte Einzelwort faellt weg.
 */
export function findeTreffer(text: string, kandidaten: Kandidat[]): Treffer[] {
  const lower = text.toLowerCase();

  // Zaehlen, in wie vielen Kandidatennamen jedes Einzelwort vorkommt.
  const wortZaehler = new Map<string, number>();
  for (const k of kandidaten) {
    for (const b of begriffeAus(k.name)) {
      if (b.includes(' ')) continue; // nur Einzelwoerter pruefen
      wortZaehler.set(b, (wortZaehler.get(b) ?? 0) + 1);
    }
  }

  return kandidaten
    .map((k) => {
      let punkte = 0;
      const begriffe: Array<{ begriff: string; anzahl: number }> = [];

      for (const b of begriffeAus(k.name)) {
        // Einzelwort, das mehrere Kandidaten teilen -> ueberspringen.
        if (!b.includes(' ') && (wortZaehler.get(b) ?? 0) > 1) continue;

        const { punkte: p, anzahl } = bewerteBegriff(lower, b);
        if (anzahl === 0) continue;
        punkte += p;
        begriffe.push({ begriff: b, anzahl });
      }

      // Auf eine Nachkommastelle runden — die Anzeige soll lesbar bleiben.
      return { id: k.id, name: k.name, punkte: Math.round(punkte * 10) / 10, begriffe };
    })
    .filter((t) => t.punkte >= MIN_PUNKTE)
    .sort((a, b) => b.punkte - a.punkte);
}

/** Kurzfassung der Begruendung fuer die Anzeige unter einem Feld. */
export function trefferBegruendung(t: Treffer): string {
  return t.begriffe
    .map((b) => `„${b.begriff}“ ${b.anzahl}×`)
    .join(', ');
}
