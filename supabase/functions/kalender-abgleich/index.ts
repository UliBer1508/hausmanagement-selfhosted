import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// KALENDER-ABGLEICH (kalender-abgleich)
// ============================================================
//
// Zweck: Prüfen, ob der eigene Kalender mit dem der Portale übereinstimmt.
// Konzept: docs/Konzept-iCal-Kollisionswarnung.md, Abschnitt 8 (Phase 4).
//
// WARUM ES DIESE FUNKTION GIBT
// ----------------------------
// Phase 1 (ical-sync) prüft nur ÜBERSCHNEIDUNGEN: Portal-Block gegen eigene
// Buchung. Am 18.07.2026 stellte sich heraus, dass die häufigere und teurere
// Gefahr die umgekehrte ist:
//
//   a) Cathrin Clausnitzer, 06.-13.02.2027, Booking.com — die Buchung fehlte
//      im System. Folge: keine Reinigung, keine Wäsche, kein Gästekontakt,
//      und der Zeitraum hätte direkt noch einmal vergeben werden können.
//      ical-sync hatte den Block korrekt eingelesen — nur nie gemeldet, weil
//      "Block ohne Buchung" für die alte Logik der Normalfall ist.
//
//   b) Booking.com sperrte 19.07.2027-18.01.2028 (183 Nächte) — ein halbes
//      Jahr Verfügbarkeit, ohne dass Uli davon wusste.
//
// Beide Fälle wurden von Hand per SQL gefunden. Diese Funktion macht daraus
// eine tägliche Prüfung.
//
// WARUM TAGESWEISE UND NICHT BLOCKWEISE
// -------------------------------------
// Ein 1:1-Vergleich Block gegen Buchung scheitert an zwei realen Mustern:
//
//   - Zusammengefasste Blocks: Booking.com meldet 25.12.2026-05.01.2027 als
//     EINEN Block. Dahinter stehen ZWEI Buchungen (Kerscher 25.-29.12.,
//     Fischer 29.12.-05.01.). Blockweise verglichen -> Fehlalarm.
//   - Wechseltage: Abreise 10:00, Anreise 15:00 am selben Kalendertag ist
//     Normalbetrieb.
//
// Deshalb: Jeder Kalendertag wird einzeln geprüft. Die Frage lautet
// "Ist dieser Tag im System durch IRGENDEINE Buchung gedeckt?" — nicht
// "Passt dieser Block zu genau dieser Buchung?".
//
// SICHERHEIT
// ----------
// Diese Funktion ist REIN LESEND. Sie ändert keine Buchung, keinen Block,
// keinen Status. Sie liefert nur Befunde zurück. Deshalb gibt es hier auch
// kein dry_run — es gibt nichts, wovor man sich schützen müsste.

// ---------------------------------------------------------------------------
// Datums-Helfer
// ---------------------------------------------------------------------------

// Schneidet einen Wert auf das reine Datum (YYYY-MM-DD).
// WARUM: external_blocks.start_date ist `date` (10 Zeichen), bookings.check_in
// ist `timestamptz` ("2027-01-05T09:00:00+00:00"). Ein direkter String-Vergleich
// wertet den Wechseltag falsch, weil "2027-01-05" ein Präfix des längeren
// Strings ist. Siehe ARBEITSWEISE-CLAUDE-LESSONS.md, Abschnitt 6.2.
const tag = (v: unknown): string => String(v ?? '').slice(0, 10);

const naechte = (von: unknown, bis: unknown): number =>
  Math.round((Date.parse(tag(bis)) - Date.parse(tag(von))) / 86400000);

// Alle Kalendertage eines Zeitraums [start, ende) — ENDE EXKLUSIV.
// Das entspricht sowohl iCal (DTEND = Abreisetag, nicht belegt) als auch
// der eigenen Buchung (check_out = Abreisetag, nicht belegt).
function tageIm(start: unknown, ende: unknown): string[] {
  const out: string[] = [];
  const d = new Date(tag(start) + 'T00:00:00Z');
  const bis = new Date(tag(ende) + 'T00:00:00Z');
  // Schutz gegen Endlosschleife bei kaputten Daten
  let guard = 0;
  while (d < bis && guard++ < 1000) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const naechsterTag = (t: string): string =>
  new Date(Date.parse(t) + 86400000).toISOString().slice(0, 10);

// Einzelne Tage zu zusammenhängenden Zeiträumen bündeln.
// Aus [06.02., 07.02., 08.02.] wird { von: 06.02., bis: 09.02. } — bis exklusiv,
// damit die Ausgabe demselben Format folgt wie Blocks und Buchungen.
function buendeln(tage: string[]): Array<{ von: string; bis: string }> {
  const sortiert = [...tage].sort();
  const out: Array<{ von: string; bis: string }> = [];
  let von: string | null = null;
  let prev: string | null = null;

  for (const t of sortiert) {
    if (von === null) { von = t; prev = t; continue; }
    if (t === naechsterTag(prev as string)) { prev = t; continue; }
    out.push({ von: von as string, bis: naechsterTag(prev as string) });
    von = t; prev = t;
  }
  if (von !== null) out.push({ von, bis: naechsterTag(prev as string) });
  return out;
}

const formatDE = (d: string): string => {
  const [j, m, t] = tag(d).split('-');
  return `${t}.${m}.${j}`;
};

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------
//
// Die Grenzwerte gehören NICHT hartcodiert: Uli vermietet in der Regel ab
// 4 Nächten, lässt saisonal aber auch 3 zu. Muster wie max_control_settings.

interface AbgleichSettings {
  min_naechte: number;   // kürzeste vermietbare Dauer
  max_naechte: number;   // längste vermietbare Dauer
  checks: {
    fehlende_buchung: boolean;
    langsperre: boolean;
    feed_fehler: boolean;
    direktbuchung_pruefen: boolean;
    kollision: boolean;
  };
  mail_enabled: boolean; // E-Mail bei neuen Befunden
  // Empfänger. In system_settings als Text ("a@x.de") ODER als Liste
  // (["a@x.de", "b@y.de"]) erlaubt — ergänzt 22.09.2026: Die Warnung ging
  // bisher nur an max.steinbock@gmail.com und kam bei Uli nicht an.
  mail_to: string[];
  // Wie lange nach Anlage/Änderung einer Direktbuchung gewartet wird, bevor
  // erinnert wird. Die Portale rufen den Feed alle 30 Min bis wenige Stunden ab.
  direktbuchung_karenz_stunden: number;
}

const DEFAULTS: AbgleichSettings = {
  min_naechte: 4,
  max_naechte: 30,
  checks: {
    fehlende_buchung: true, langsperre: true, feed_fehler: true,
    direktbuchung_pruefen: true, kollision: true,
  },
  mail_enabled: true,
  mail_to: ['max.steinbock@gmail.com'],
  direktbuchung_karenz_stunden: 24,
};

// Text oder Liste -> bereinigte Liste gültiger Adressen.
function leseEmpfaenger(v: unknown): string[] {
  const roh = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  const liste = roh
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.includes('@'));
  return [...new Set(liste)];
}

async function ladeSettings(supabase: any): Promise<AbgleichSettings> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'kalender_abgleich_settings')
      .maybeSingle();
    const v = data?.value;
    if (v && typeof v === 'object') {
      return {
        min_naechte: Number(v.min_naechte) || DEFAULTS.min_naechte,
        max_naechte: Number(v.max_naechte) || DEFAULTS.max_naechte,
        checks: { ...DEFAULTS.checks, ...(v.checks ?? {}) },
        mail_enabled: v.mail_enabled !== false,
        mail_to: leseEmpfaenger(v.mail_to).length > 0
          ? leseEmpfaenger(v.mail_to)
          : DEFAULTS.mail_to,
        direktbuchung_karenz_stunden:
          Number(v.direktbuchung_karenz_stunden) || DEFAULTS.direktbuchung_karenz_stunden,
      };
    }
  } catch (_e) {
    // Kein Eintrag vorhanden -> Standardwerte. Kein Fehlerfall.
  }
  return DEFAULTS;
}

// ---------------------------------------------------------------------------
// Befunde
// ---------------------------------------------------------------------------

type BefundArt =
  // Portal-Belegung überschneidet sich mit einer EIGENEN Buchung eines anderen
  // Kanals -> mögliche Doppelbuchung. Ermittelt von ical-sync
  // (external_blocks.collision_booking_id), hier nur ausgewiesen. NEU 22.09.2026:
  // Vorher tauchte eine Kollision nur einmal im Toast/in der Mail von ical-sync
  // auf und war danach nirgends mehr sichtbar.
  | 'kollision'
  // Neue/geänderte/stornierte Buchung oder Portal-Belegung, noch nicht als
  // "Gesehen" quittiert (Tabelle buchungs_aenderungen, SQL 56). Kein Problem,
  // sondern eine Information — NEU 22.09.2026.
  | 'aenderung'
  | 'fehlende_buchung'
  | 'langsperre'
  | 'feed_fehler'
  // Direktbuchung, bei der Uli noch nicht bestätigt hat, dass der Zeitraum in
  // den Portalen korrekt gesetzt ist. Zwei Ausprägungen, siehe unten.
  | 'direktbuchung_pruefen';

interface Befund {
  art: BefundArt;
  haus: string;
  house_id: string;
  platform: string;
  von?: string;
  bis?: string;
  naechte?: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Meldung — EINE Formulierung für alle Ausgabestellen (NEU 22.09.2026)
// ---------------------------------------------------------------------------
//
// WARUM: Am 22.09.2026 kam nachts eine Booking.com-Buchung herein. Die Mail
// dieser Funktion meldete "1 Buchung(en) fehlen im System", der Knopf
// "Jetzt synchronisieren" meldete gleichzeitig "keine Kollisionen" — zwei
// Stellen, zwei Aussagen, und die beruhigende war die sichtbare.
//
// Seitdem gilt: Überschriften, Hinweise und Zeilen werden NUR hier gebaut und
// als `meldung` zurückgegeben. Sync-Meldung (CalendarSyncCard), Banner in der
// Übersicht (CalendarAbgleichAlertBanner), Morgen-Übersicht und E-Mail zeigen
// genau diese Texte. Wer eine Formulierung ändern will, ändert sie hier.

type MeldungStufe = 'kritisch' | 'warnung' | 'hinweis';

interface MeldungGruppe {
  art: BefundArt;
  stufe: MeldungStufe;
  titel: string;     // z. B. "1 Buchung fehlt im System"
  hinweis: string;   // was zu tun ist
  zeilen: string[];  // "Venediger Chalet: 29.12.2026–03.01.2027 ist bei …"
}

interface Meldung {
  alles_ok: boolean;
  titel: string;     // Kurzfassung, z. B. für Betreff und Banner-Kopf
  gruppen: MeldungGruppe[];
}

const MELDUNG_TEXTE: Record<BefundArt, {
  stufe: MeldungStufe;
  titel: (n: number) => string;
  hinweis: string;
}> = {
  kollision: {
    stufe: 'kritisch',
    titel: (n) => n === 1 ? '1 mögliche Doppelbuchung' : `${n} mögliche Doppelbuchungen`,
    hinweis: 'Sofort im Portal prüfen und einen der beiden Kanäle sperren bzw. stornieren.',
  },
  fehlende_buchung: {
    stufe: 'kritisch',
    titel: (n) => n === 1 ? '1 Buchung fehlt in der Hausverwaltung' : `${n} Buchungen fehlen in der Hausverwaltung`,
    hinweis:
      'Im Portal nachsehen und die Buchung in der Hausverwaltung anlegen. Ohne Eintrag gibt es ' +
      'keine Reinigung, keine Wäsche und keinen Gästekontakt.',
  },
  aenderung: {
    stufe: 'hinweis',
    titel: (n) => n === 1 ? '1 neue Änderung bei den Buchungen' : `${n} neue Änderungen bei den Buchungen`,
    hinweis: 'Zur Kenntnis — in der Übersicht mit „Gesehen" bestätigen.',
  },
  feed_fehler: {
    stufe: 'warnung',
    titel: (n) => n === 1 ? '1 Portal-Feed meldet einen Fehler' : `${n} Portal-Feeds melden einen Fehler`,
    hinweis: 'Solange der Feed fehlschlägt, ist der Abgleich für dieses Haus nicht aktuell.',
  },
  direktbuchung_pruefen: {
    stufe: 'hinweis',
    titel: (n) => n === 1 ? '1 Direktbuchung in den Portalen prüfen' : `${n} Direktbuchungen in den Portalen prüfen`,
    hinweis: 'In Airbnb, Booking.com und VRBO kontrollieren und danach in der Buchungskarte abhaken.',
  },
  langsperre: {
    stufe: 'hinweis',
    titel: (n) => n === 1 ? '1 lange Sperre in einem Portal' : `${n} lange Sperren in den Portalen`,
    hinweis: 'Prüfen, ob die Sperre gewollt ist — sonst ist der Zeitraum unverkäuflich.',
  },
};

// Reihenfolge = Dringlichkeit.
const RANG: Record<BefundArt, number> = {
  kollision: 0, fehlende_buchung: 1, feed_fehler: 2, aenderung: 3, direktbuchung_pruefen: 4, langsperre: 5,
};

function baueMeldung(befunde: Befund[]): Meldung {
  const arten = [...new Set(befunde.map((b) => b.art))].sort((a, b) => RANG[a] - RANG[b]);
  const gruppen: MeldungGruppe[] = arten.map((art) => {
    const liste = befunde.filter((b) => b.art === art);
    const t = MELDUNG_TEXTE[art];
    return {
      art,
      stufe: t.stufe,
      titel: t.titel(liste.length),
      hinweis: t.hinweis,
      zeilen: liste.map((b) => `${b.haus}: ${b.text}`),
    };
  });

  const titel = gruppen.length === 0
    ? 'Kalender stimmt mit den Portalen überein'
    : gruppen.map((g) => g.titel).join(' · ');

  return { alles_ok: gruppen.length === 0, titel, gruppen };
}

// Einleitungssatz der Mail — abhängig vom Inhalt (NEU 24.09.2026).
// WARUM: Die Mail begann immer mit "Unterschiede zwischen den Portalen und der
// Hausverwaltung gefunden", auch wenn sie nur einen Änderungs-Hinweis enthielt
// (z. B. "Neue Buchung Jeroen De vos"). Dann gab es gar keinen Unterschied —
// der Satz war falsch und hat unnötig beunruhigt.
function nurAenderungen(m: Meldung): boolean {
  return m.gruppen.length > 0 && m.gruppen.every((g) => g.art === 'aenderung');
}

function einleitung(m: Meldung): { vor: string; fett: string; nach: string } {
  if (nurAenderungen(m)) {
    return { vor: 'Bei den Buchungen hat sich ', fett: 'etwas geändert', nach: ' (kein Abgleich-Problem)' };
  }
  return {
    vor: 'Der Kalender-Abgleich hat ',
    fett: 'Unterschiede zwischen den Portalen und der Hausverwaltung',
    nach: ' gefunden',
  };
}

// Textfassung (Fallback für Mailprogramme ohne HTML).
function meldungAlsText(m: Meldung): string {
  const teile = m.gruppen.map((g) => {
    const marke = g.stufe === 'kritisch' ? '‼️ ' : g.stufe === 'warnung' ? '⚠️ ' : 'ℹ️ ';
    return `${marke}${g.titel.toUpperCase()}\n${g.zeilen.map((z) => `• ${z}`).join('\n')}\n→ ${g.hinweis}`;
  });
  return (
    `${einleitung(m).vor}${einleitung(m).fett}${einleitung(m).nach}.\n\n` +
    `${teile.join('\n\n')}\n\n` +
    `Diese Mail kommt einmalig je Befund. In der Übersicht (Banner) und in der Morgen-Übersicht ` +
    `bleibt der Punkt sichtbar, bis er erledigt ist.`
  );
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// HTML-Fassung: kritische Punkte rot hinterlegt, ganz oben.
function meldungAlsHtml(m: Meldung): string {
  const farben: Record<MeldungStufe, { rand: string; grund: string; schrift: string }> = {
    kritisch: { rand: '#dc2626', grund: '#fef2f2', schrift: '#991b1b' },
    warnung:  { rand: '#d97706', grund: '#fffbeb', schrift: '#92400e' },
    hinweis:  { rand: '#2563eb', grund: '#eff6ff', schrift: '#1e40af' },
  };
  const bloecke = m.gruppen.map((g) => {
    const f = farben[g.stufe];
    const zeilen = g.zeilen.map((z) => `<li style="margin:4px 0">${esc(z)}</li>`).join('');
    return (
      `<div style="border-left:5px solid ${f.rand};background:${f.grund};padding:12px 16px;margin:0 0 16px;border-radius:6px">` +
      `<div style="font-size:17px;font-weight:bold;color:${f.schrift};margin-bottom:6px">${esc(g.titel)}</div>` +
      `<ul style="margin:0 0 8px;padding-left:20px;color:#111827;font-size:15px">${zeilen}</ul>` +
      `<div style="color:${f.schrift};font-size:14px"><strong>Was tun:</strong> ${esc(g.hinweis)}</div>` +
      `</div>`
    );
  }).join('');
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#111827">` +
    `<p style="font-size:15px">${esc(einleitung(m).vor)}<strong>${esc(einleitung(m).fett)}</strong>${esc(einleitung(m).nach)}:</p>` +
    bloecke +
    `<p style="font-size:12px;color:#6b7280">Diese Mail kommt einmalig je Befund. In der Übersicht (Banner) und in der ` +
    `Morgen-Übersicht bleibt der Punkt sichtbar, bis er erledigt ist.</p>` +
    `</div>`
  );
}

// Einordnung eines einzelnen Portal-Blocks.
//
// WOFUER: Die Belegungsliste in CalendarSyncCard.tsx zeigte bisher alle Blocks
// gleich — eine 183-Naechte-Sperre sah aus wie eine echte Buchung. Die
// Einordnung beantwortet je Block die Frage, die man beim Draufschauen hat:
// "Gehoert das zu einer Buchung, oder ist das eine Sperre?"
//
//   gedeckt   -> Zeitraum ist im System durch Buchung(en) belegt (Normalfall)
//   sperrzeit -> unter der Mindestdauer: Mindestaufenthalts-Sperre des Portals
//   langsperre-> ueber der Maximaldauer: Kalenderhorizont ODER vergessene Sperre
//   luecke    -> im Buchungsbereich, aber im System (teilweise) frei -> Achtung
type BlockArt = 'gedeckt' | 'sperrzeit' | 'langsperre' | 'luecke';

interface BlockInfo {
  house_id: string;
  platform: string;
  start_date: string;
  end_date: string;
  art: BlockArt;
  naechte: number;
  // Namen der Buchungen, die diesen Zeitraum abdecken. Mehrere sind normal:
  // Booking.com fasst aufeinanderfolgende Buchungen zu EINEM Block zusammen.
  buchungen: string[];
  // Wie viele Tage des Blocks im System NICHT gedeckt sind (0 = vollstaendig).
  offene_tage: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const settings = await ladeSettings(supabase);
    const heute = new Date().toISOString().slice(0, 10);
    const befunde: Befund[] = [];
    const bloecke: BlockInfo[] = [];

    // --- 1. Häuser mit aktivem Feed ---------------------------------------
    // Nur Häuser, für die überhaupt ein Feed hinterlegt ist. Wald Chalet läuft
    // ausschließlich über Belvilla, und Belvilla liefert keinen nutzbaren
    // iCal-Feed (Stand 18.07.2026) — solche Häuser werden übersprungen, nicht
    // als Fehler gemeldet.
    const { data: feeds, error: feedErr } = await supabase
      .from('ical_feeds')
      .select('id, house_id, platform, is_active, last_status, last_synced_at, houses(name)')
      .eq('is_active', true);

    if (feedErr) throw feedErr;

    if (!feeds?.length) {
      return new Response(JSON.stringify({
        success: true, geprueft: 0, befunde: [],
        hinweis: 'Keine aktiven iCal-Feeds hinterlegt.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 2. Prüfung 4: Feed-Fehler ----------------------------------------
    // Ein Feed, der beim letzten Lauf einen Fehler meldete, liefert veraltete
    // Daten. Dann sind auch alle anderen Prüfungen für dieses Haus unzuverlässig.
    if (settings.checks.feed_fehler) {
      for (const f of feeds) {
        if (typeof f.last_status === 'string' && f.last_status.startsWith('error')) {
          befunde.push({
            art: 'feed_fehler',
            haus: (f as any).houses?.name ?? 'Objekt',
            house_id: f.house_id,
            platform: f.platform,
            text: `Feed ${f.platform} meldet einen Fehler: ${f.last_status.slice(0, 120)}`,
          });
        }
      }
    }

    // --- 3. Je Haus abgleichen --------------------------------------------
    const hausIds: string[] = [...new Set<string>(feeds.map((f: any) => String(f.house_id)))];
    let gepruefteHaeuser = 0;

    for (const houseId of hausIds) {
      const hausName =
        (feeds.find((f: any) => f.house_id === houseId) as any)?.houses?.name ?? 'Objekt';

      // Externe Blocks: nur laufende und künftige
      const { data: blocks, error: blocksErr } = await supabase
        .from('external_blocks')
        .select('platform, start_date, end_date, summary, collision_booking_id')
        .eq('house_id', houseId)
        .gte('end_date', heute);

      // Eigene Buchungen: nur laufende und künftige, keine Stornos
      const { data: bookings, error: bookingsErr } = await supabase
        .from('bookings')
        .select('id, check_in, check_out, guests!bookings_guest_id_fkey(name)')
        .eq('house_id', houseId)
        .neq('status', 'cancelled')
        .gte('check_out', heute);

      // Ladefehler NICHT stillschweigend überspringen (ergänzt 22.09.2026):
      // Sonst sähe das Ergebnis aus wie "keine Unterschiede", obwohl gar
      // nicht verglichen wurde.
      if (blocksErr || bookingsErr) {
        const fehler = (blocksErr ?? bookingsErr)?.message ?? 'unbekannter Fehler';
        console.error('[kalender-abgleich] Laden fehlgeschlagen:', hausName, blocksErr ?? bookingsErr);
        befunde.push({
          art: 'feed_fehler',
          haus: hausName, house_id: houseId, platform: 'hausverwaltung',
          text: `Abgleich nicht möglich — ${blocksErr ? 'Portal-Belegungen' : 'Buchungen'} konnten nicht geladen werden (${fehler.slice(0, 120)}).`,
        });
        continue;
      }

      if (!blocks?.length) continue;
      gepruefteHaeuser++;

      // Belegte Tage aus eigenen Buchungen.
      // Map statt Set, damit zu jedem Tag auch der Gastname bekannt ist — die
      // Belegungsliste soll zeigen, WELCHE Buchung hinter einem Block steht.
      const belegtVon = new Map<string, string>();
      for (const b of bookings ?? []) {
        for (const t of tageIm(b.check_in, b.check_out)) {
          // Gastname aus der guests-Relation (Etappe 4, Block 1)
          belegtVon.set(t, (b as any).guests?.name ?? b.guest_name ?? 'Buchung');
        }
      }
      const belegt = { has: (t: string) => belegtVon.has(t) };

      // --- Einordnung je Block (fuer die Belegungsliste) ------------------
      for (const b of blocks) {
        const n = naechte(b.start_date, b.end_date);
        const tage = tageIm(b.start_date, b.end_date);
        const namen = new Set<string>();
        let offen = 0;
        for (const t of tage) {
          const g = belegtVon.get(t);
          if (g) namen.add(g); else offen++;
        }

        let art: BlockArt;
        if (n > settings.max_naechte) art = 'langsperre';
        else if (n < settings.min_naechte) art = 'sperrzeit';
        else if (offen === 0) art = 'gedeckt';
        else if (offen >= settings.min_naechte) art = 'luecke';
        // Weniger offene Tage als die Mindestdauer: Randstueck, keine Luecke —
        // z.B. wenn ein Portal einen Tag grosszuegiger sperrt als die Buchung
        // lang ist. Das ist gedeckt genug.
        else art = 'gedeckt';

        bloecke.push({
          house_id: houseId, platform: b.platform,
          start_date: tag(b.start_date), end_date: tag(b.end_date),
          art, naechte: n, buchungen: [...namen], offene_tage: offen,
        });
      }

      // --- Prüfung 0: Kollisionen (mögliche Doppelbuchung) ----------------
      // Die Entscheidung "Kollision ja/nein" trifft ical-sync (Herkunfts-,
      // Rückspiegelungs- und Wechseltagsregel liegen dort). Hier wird sie nur
      // ausgewiesen, damit sie überall sichtbar bleibt, bis sie aufgelöst ist.
      if (settings.checks.kollision) {
        for (const b of blocks) {
          const bid = (b as any).collision_booking_id as string | null;
          if (!bid) continue;
          const eigene = (bookings ?? []).find((x: any) => x.id === bid) as any;
          const eigeneText = eigene
            ? ` mit der Buchung „${eigene.guests?.name ?? 'ohne Namen'}" (${formatDE(eigene.check_in)}–${formatDE(eigene.check_out)})`
            : ' mit einer eigenen Buchung';
          befunde.push({
            art: 'kollision',
            haus: hausName, house_id: houseId, platform: b.platform,
            von: tag(b.start_date), bis: tag(b.end_date),
            naechte: naechte(b.start_date, b.end_date),
            text: `${b.platform} meldet ${formatDE(b.start_date)}–${formatDE(b.end_date)} als belegt – überschneidet sich${eigeneText}.`,
          });
        }
      }

      // --- Prüfung 5: Langsperren ----------------------------------------
      // Blocks über der Maximaldauer können keine Buchung sein. Sie werden
      // aber NICHT stillschweigend gefiltert: Der 183-Nächte-Block vom
      // 18.07.2026 war eine vergessene Sperre, kein Kalenderhorizont.
      // In den Daten sind beide Fälle nicht unterscheidbar — nur Uli kann das
      // entscheiden. Deshalb melden, aber als Frage formuliert.
      if (settings.checks.langsperre) {
        for (const b of blocks) {
          const n = naechte(b.start_date, b.end_date);
          if (n <= settings.max_naechte) continue;
          befunde.push({
            art: 'langsperre',
            haus: hausName, house_id: houseId, platform: b.platform,
            von: tag(b.start_date), bis: tag(b.end_date), naechte: n,
            text: `${b.platform} sperrt ${formatDE(b.start_date)}–${formatDE(b.end_date)} (${n} Nächte). Ist das gewollt?`,
          });
        }
      }

      // --- Prüfung 1: Portal belegt, System frei -------------------------
      if (settings.checks.fehlende_buchung) {
        // Blocks unter dem Minimum sind Mindestaufenthalts-Sperren: Liegen
        // zwischen zwei Buchungen weniger freie Nächte als die kürzeste
        // vermietbare Dauer, sperren die Portale diese Tage automatisch, weil
        // sie unverkäuflich sind. Blocks über dem Maximum sind oben behandelt.
        const relevant = blocks.filter((b: any) => {
          const n = naechte(b.start_date, b.end_date);
          return n >= settings.min_naechte && n <= settings.max_naechte;
        });

        // Tag -> welche Plattformen melden ihn als belegt
        const offen = new Map<string, Set<string>>();
        for (const b of relevant) {
          for (const t of tageIm(b.start_date, b.end_date)) {
            if (belegt.has(t)) continue;
            if (!offen.has(t)) offen.set(t, new Set());
            offen.get(t)!.add(b.platform);
          }
        }

        for (const z of buendeln([...offen.keys()])) {
          const n = naechte(z.von, z.bis);
          // Nach dem Bündeln erneut prüfen: Ein Rest unterhalb des Minimums ist
          // ein Randstück (z.B. ein Tag Überhang, weil ein Portal großzügiger
          // sperrt als die Buchung lang ist) — keine fehlende Buchung.
          if (n < settings.min_naechte) continue;

          const plats = new Set<string>();
          for (const t of tageIm(z.von, z.bis)) {
            (offen.get(t) ?? new Set()).forEach((p) => plats.add(p));
          }
          const platListe = [...plats].join(', ');

          befunde.push({
            art: 'fehlende_buchung',
            haus: hausName, house_id: houseId, platform: platListe,
            von: z.von, bis: z.bis, naechte: n,
            text: `${formatDE(z.von)}–${formatDE(z.bis)} ist bei ${platListe} belegt, in der Hausverwaltung aber frei (${n} Nächte).`,
          });
        }
      }
    }

    // --- Prüfung 6: Direktbuchungen in den Portalen kontrollieren ---------
    //
    // WARUM DAS NICHT AUTOMATISCH GEHT (belegt am 19.07.2026):
    // Direktbuchungen gehen über ical-export an alle Portale, und die blocken
    // sie auch — im Portal-Kalender sichtbar. Über ihren eigenen iCal-Export
    // geben die Portale importierte Blocks aber NICHT zurück (jedes Portal
    // exportiert nur eigene Buchungen, dieselbe Regel wie unser Export).
    //
    // Konkret: Die Direktbuchung "Luca" (16.-23.08.2026) war in Airbnb,
    // Booking.com und VRBO sichtbar geblockt — und tauchte in keinem einzigen
    // Portal-Feed auf. Eine automatische Prüfung "System belegt, Portal frei"
    // würde daher bei JEDER Direktbuchung Alarm schlagen, obwohl alles stimmt.
    //
    // Deshalb: Erinnerung mit Quittung statt Automatik. Uli prüft in den
    // Portalen und hakt in der Buchungskarte ab
    // (bookings.portale_geprueft_am, SQL 36_...).
    //
    // ZWEI RICHTUNGEN:
    //   aktiv     -> Zeitraum MUSS in den Portalen geblockt sein
    //   storniert -> Blockade MUSS zurückgenommen werden, sonst bleibt der
    //                Zeitraum unverkäuflich (vgl. 183-Nächte-Sperre 18.07.)
    if (settings.checks.direktbuchung_pruefen) {
      // Karenzzeit: Vorher haben die Portale den Feed womöglich noch nicht
      // abgerufen, und Uli würde vergeblich nachsehen.
      const karenzGrenze = new Date(
        Date.now() - settings.direktbuchung_karenz_stunden * 3600_000,
      ).toISOString();

      const { data: direkt } = await supabase
        .from('bookings')
        .select('id, check_in, check_out, status, platform, house_id, updated_at, portale_geprueft_am, houses(name), guests!bookings_guest_id_fkey(name)')
        // Großzügiger Filter — ALLES, was kein eindeutiges Portal ist:
        //   null      "Keine Angabe" im Formular
        //   direct    ausdrücklich als Direktbuchung angelegt
        //   website   aus einer Anfrage über steinbockchalets.com
        //   other     "Sonstige" im Formular
        //   unknown   aus einem Import ohne Herkunft
        //
        // 'other' und 'unknown' sind absichtlich dabei, obwohl dahinter auch
        // eine Portal-Buchung stecken kann (Christian Mueller: unknown, aber
        // Booking.com). Uli hat das so entschieden: Lieber einmal zu viel
        // erinnert und dabei die Plattform korrigiert, als eine Direktbuchung
        // übersehen, die in keinem Portal geblockt ist.
        //
        // ACHTUNG — ical-export nutzt einen ENGEREN Filter (nur null/direct/
        // website). Dort wäre eine Portal-Buchung im eigenen Feed schädlich:
        // Das Portal bekäme seine eigene Buchung zurückgespiegelt
        // (Endlosschleifen-Regel, Konzept §3).
        .or('platform.is.null,platform.eq.direct,platform.eq.website,platform.eq.other,platform.eq.unknown')
        .gte('check_out', heute)
        .is('portale_geprueft_am', null)
        // Nur Buchungen, die lange genug bestehen. updated_at ändert sich auch
        // bei Datums- oder Statusänderung — dann beginnt die Frist neu, was
        // richtig ist: Ein verschobener Zeitraum ist ein neuer Zeitraum.
        .lt('updated_at', karenzGrenze);

      for (const b of direkt ?? []) {
        const hausName = (b as any).houses?.name ?? 'Objekt';
        const zeitraum = `${formatDE(b.check_in)}–${formatDE(b.check_out)}`;
        const storniert = b.status === 'cancelled';

        befunde.push({
          art: 'direktbuchung_pruefen',
          haus: hausName,
          house_id: b.house_id,
          platform: 'direkt',
          von: tag(b.check_in),
          bis: tag(b.check_out),
          text: storniert
            ? `Direktbuchung „${(b as any).guests?.name || b.guest_name}" (${zeitraum}) wurde storniert — bitte in Airbnb, Booking.com und VRBO prüfen, ob der Zeitraum wieder freigegeben ist, und in der Buchungskarte abhaken.`
            : `Direktbuchung „${(b as any).guests?.name || b.guest_name}" (${zeitraum}) — bitte in Airbnb, Booking.com und VRBO prüfen, ob der Zeitraum geblockt ist, und in der Buchungskarte abhaken.`,
        });
      }
    }

    // Wichtigstes zuerst (Reihenfolge siehe RANG oben).
    befunde.sort((a, b) => RANG[a.art] - RANG[b.art] || (a.von ?? '').localeCompare(b.von ?? ''));

    // --- Offene Änderungen (SQL 56, NEU 22.09.2026) -----------------------
    // Nicht Teil von `befunde` (die bleiben reine Abgleich-Befunde, z. B. für
    // Max' Tool check_kalender_abgleich), aber Teil der `meldung` — damit
    // Sync-Meldung, Morgen-Übersicht und Mail sie mit demselben Text zeigen
    // wie der Banner. Fehlt die Tabelle noch, bleibt die Liste leer.
    const aenderungBefunde: Array<Befund & { id: string; gemailt: boolean }> = [];
    {
      const { data: offen, error: aendErr } = await supabase
        .from('buchungs_aenderungen')
        .select('id, house_id, platform, von, bis, text, gemailt_am, houses(name)')
        .is('gesehen_am', null)
        .order('erkannt_am', { ascending: true })
        .limit(50);
      if (aendErr) console.error('[kalender-abgleich] buchungs_aenderungen:', aendErr);
      for (const a of offen ?? []) {
        aenderungBefunde.push({
          id: (a as any).id,
          gemailt: !!(a as any).gemailt_am,
          art: 'aenderung',
          haus: (a as any).houses?.name ?? 'Objekt',
          house_id: (a as any).house_id,
          platform: (a as any).platform ?? '',
          von: (a as any).von ?? undefined,
          bis: (a as any).bis ?? undefined,
          text: (a as any).text,
        });
      }
    }

    const meldung = baueMeldung([...befunde, ...aenderungBefunde]);

    // --- E-Mail bei NEUEN Befunden ----------------------------------------
    //
    // WARUM NUR BEI NEUEN: Eine fehlende Buchung bleibt bestehen, bis Uli sie
    // nachträgt — das kann Tage dauern. Ohne Merk-Logik käme jeden Morgen
    // dieselbe Mail, und nach der dritten würde sie ignoriert. Genau dann geht
    // die nächste, wirklich neue unter.
    //
    // Der Befund wird über Haus + Art + Plattform + Zeitraum identifiziert
    // (Tabelle kalender_abgleich_meldungen, SQL 35_...). Verschiebt sich der
    // Zeitraum, ist es ein anderer Befund und wird erneut gemeldet — richtig so,
    // denn dahinter steckt dann eine andere Belegung.
    //
    // Die Morgen-Übersicht zeigt weiterhin ALLE offenen Befunde, auch die schon
    // gemeldeten. Nur die Mail ist einmalig.
    let mailGesendet = false;
    let neueBefunde = 0;

    const aenderungenUngemailt = aenderungBefunde.filter((a) => !a.gemailt);
    if (settings.mail_enabled && (befunde.length > 0 || aenderungenUngemailt.length > 0)) {
      const neu: Befund[] = [];

      for (const b of befunde) {
        // Vorhandene Meldung suchen. Bei feed_fehler sind von/bis leer.
        let q = supabase
          .from('kalender_abgleich_meldungen')
          .select('id')
          .eq('house_id', b.house_id)
          .eq('art', b.art)
          .eq('platform', b.platform);
        q = b.von ? q.eq('von', b.von) : q.is('von', null);
        q = b.bis ? q.eq('bis', b.bis) : q.is('bis', null);
        const { data: schonGemeldet } = await q.maybeSingle();

        if (schonGemeldet) {
          // Nur den Zeitstempel auffrischen — der Befund besteht weiter.
          await supabase
            .from('kalender_abgleich_meldungen')
            .update({ zuletzt_am: new Date().toISOString() })
            .eq('id', schonGemeldet.id);
        } else {
          neu.push(b);
        }
      }

      neueBefunde = neu.length;

      if (neu.length > 0 || aenderungenUngemailt.length > 0) {
        // Die Mail enthält nur die NEUEN Befunde und noch nicht gemailten
        // Änderungen, aber in derselben Formulierung wie Banner,
        // Sync-Meldung und Morgen-Übersicht.
        const neuMeldung = baueMeldung([...neu, ...aenderungenUngemailt]);
        const kritisch = neuMeldung.gruppen.some((g) => g.stufe === 'kritisch');
        // Betreff wie die Einleitung: reine Änderungs-Hinweise nicht als
        // "Kalender-Abgleich" ausgeben (NEU 24.09.2026).
        const betreff = nurAenderungen(neuMeldung)
          ? `ℹ️ Buchungen: ${neuMeldung.titel}`
          : `${kritisch ? '‼️' : 'ℹ️'} Kalender-Abgleich: ${neuMeldung.titel}`;

        try {
          // ACHTUNG bei der Schnittstelle: send-guest-email erwartet
          // `recipients` (Array von { email }), `subjectTemplate` und
          // `bodyTemplate` — NICHT to/subject/body. Ein Aufruf mit den
          // naheliegenden Namen wird mit HTTP 400 abgelehnt und die Mail geht
          // nie raus. (Geprüft am 19.07.2026 in send-guest-email/index.ts.)
          // `htmlTemplate` ist optional (ergänzt 22.09.2026) — ältere Aufrufer
          // ohne HTML funktionieren unverändert.
          const { data: mailRes, error: mailErr } = await supabase.functions.invoke('send-guest-email', {
            body: {
              // Nur `email` — die weiteren Recipient-Felder dienen der
              // Platzhalter-Ersetzung und werden hier nicht gebraucht.
              recipients: settings.mail_to.map((email) => ({ email })),
              subjectTemplate: betreff,
              bodyTemplate: meldungAlsText(neuMeldung),
              htmlTemplate: meldungAlsHtml(neuMeldung),
            },
          });
          // send-guest-email antwortet auch dann mit HTTP 200, wenn der
          // SMTP-Versand für JEDEN Empfänger scheiterte ({ sent: 0, failed }).
          // Nur mailErr zu prüfen hieße: Befund als "gemeldet" merken, obwohl
          // keine Mail rausging — und nie wieder versuchen.
          const gesendet = Number(mailRes?.sent ?? 0);
          if (mailErr || gesendet === 0) {
            console.error('[kalender-abgleich] Mail fehlgeschlagen:', mailErr ?? mailRes?.failed);
          } else {
            if (Array.isArray(mailRes?.failed) && mailRes.failed.length > 0) {
              console.error('[kalender-abgleich] Mail teilweise fehlgeschlagen:', mailRes.failed);
            }
            mailGesendet = true;
            // Erst NACH erfolgreichem Versand merken. Schlägt die Mail fehl,
            // wird beim nächsten Lauf erneut versucht — besser eine Mail zu viel
            // als eine fehlende Buchung, von der niemand erfährt.
            if (neu.length > 0) {
              await supabase.from('kalender_abgleich_meldungen').insert(
                neu.map((b) => ({
                  house_id: b.house_id, art: b.art, platform: b.platform,
                  von: b.von ?? null, bis: b.bis ?? null, text: b.text,
                })),
              );
            }
            if (aenderungenUngemailt.length > 0) {
              await supabase.from('buchungs_aenderungen')
                .update({ gemailt_am: new Date().toISOString() })
                .in('id', aenderungenUngemailt.map((a) => a.id));
            }
          }
        } catch (e) {
          console.error('[kalender-abgleich] Mail-Ausnahme:', e);
        }
      }
    }

    // Erledigte Befunde vergessen: Was seit 7 Tagen nicht mehr auftaucht, ist
    // behoben. Taucht dasselbe Problem später erneut auf, wird es wieder
    // gemeldet — das ist gewollt.
    try {
      const grenze = new Date(Date.now() - 7 * 86400000).toISOString();
      await supabase
        .from('kalender_abgleich_meldungen')
        .delete()
        .lt('zuletzt_am', grenze);
    } catch (_e) {
      // Aufräumen ist Kür — ein Fehler hier darf den Abgleich nicht stoppen.
    }

    return new Response(JSON.stringify({
      success: true,
      geprueft_am: new Date().toISOString(),
      haeuser_geprueft: gepruefteHaeuser,
      feeds_aktiv: feeds.length,
      grenzen: { min_naechte: settings.min_naechte, max_naechte: settings.max_naechte },
      anzahl: befunde.length,
      neue_befunde: neueBefunde,
      mail_gesendet: mailGesendet,
      alles_ok: befunde.length === 0,
      befunde,
      // Offene (nicht quittierte) Änderungen — Anzeige im Banner mit
      // "Gesehen"-Knopf (BookingChangesAlertBanner).
      aenderungen: aenderungBefunde.map(({ gemailt: _g, ...rest }) => rest),
      // Fertig formulierte Meldung — Quelle für Sync-Meldung, Banner,
      // Morgen-Übersicht und Mail (siehe baueMeldung).
      meldung,
      // Einordnung JEDES Blocks — fuer die Belegungsliste in CalendarSyncCard.
      bloecke,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[kalender-abgleich]', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
