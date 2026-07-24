import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getDocument } from "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

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
  MW3:     { feld: 'bedding',       hinweis: 'Paket 5 Tlg — enthält Kissenbezug und Spannleintuch' },
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

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Items nach Zeilen gruppieren (y-Koordinate), damit Tabellenzeilen
    // zusammenbleiben — pdfjs liefert sonst lose Fragmente.
    const zeilen: Record<string, { x: number; s: string }[]> = {};
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      (zeilen[y] ??= []).push({ x: it.transform[4], s: it.str });
    }
    const ys = Object.keys(zeilen).map(Number).sort((a, b) => b - a);
    for (const y of ys) {
      out += zeilen[y].sort((a, b) => a.x - b.x).map(t => t.s).join(' ')
        .replace(/\s+/g, ' ').trim() + '\n';
    }
  }
  return out;
}

const RE_HEADER = /Rechnung\s+Nr\.\s*(\S+)\s+vom\s+(\d{2})\.(\d{2})\.(\d{4})/;
const RE_DUE    = /Zahlung bis sp\u00e4testens\s+(\d{2})\.(\d{2})\.(\d{4})/;
const RE_TOTAL  = /Gesamtbetrag\s+Netto:\s*([\d.,]+)\s*\u20ac/;
const RE_POS    = /^(\d{1,3})\s+([A-Z0-9]{2,10})\s+(.+?)\s+([\d.,]+)\s+(Stk\.|kg)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*\u20ac\s+(\d+)%$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { pdf_base64, house_id } = await req.json();
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

    let prices: Record<string, number> | null = null;
    if (house_id) {
      const { data } = await supabase
        .from('ai_linen_settings').select('prices').eq('house_id', house_id).maybeSingle();
      prices = (data?.prices as any) ?? null;
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
      .select('id, bruttobetrag, status')
      .eq('rechnungsnummer', rechnungsnummer)
      .eq('rechnungsdatum', rechnungsdatum)
      .maybeSingle();

    if (vorhanden) {
      warnungen.push(`Rechnung ${rechnungsnummer} vom ${rechnungsdatum} ist bereits erfasst (Status ${vorhanden.status}, ${vorhanden.bruttobetrag} EUR)`);
    }

    return new Response(JSON.stringify({
      ok: true,
      bereits_erfasst: !!vorhanden,
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
