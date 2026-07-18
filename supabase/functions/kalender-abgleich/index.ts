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
  };
  mail_enabled: boolean; // E-Mail bei neuen Befunden
  mail_to: string;
}

const DEFAULTS: AbgleichSettings = {
  min_naechte: 4,
  max_naechte: 30,
  checks: { fehlende_buchung: true, langsperre: true, feed_fehler: true },
  mail_enabled: true,
  mail_to: 'max.steinbock@gmail.com',
};

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
        mail_to: typeof v.mail_to === 'string' && v.mail_to ? v.mail_to : DEFAULTS.mail_to,
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

type BefundArt = 'fehlende_buchung' | 'langsperre' | 'feed_fehler';

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
    const hausIds = [...new Set(feeds.map((f: any) => f.house_id))];
    let gepruefteHaeuser = 0;

    for (const houseId of hausIds) {
      const hausName =
        (feeds.find((f: any) => f.house_id === houseId) as any)?.houses?.name ?? 'Objekt';

      // Externe Blocks: nur laufende und künftige
      const { data: blocks } = await supabase
        .from('external_blocks')
        .select('platform, start_date, end_date, summary')
        .eq('house_id', houseId)
        .gte('end_date', heute);

      // Eigene Buchungen: nur laufende und künftige, keine Stornos
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out')
        .eq('house_id', houseId)
        .neq('status', 'cancelled')
        .gte('check_out', heute);

      if (!blocks?.length) continue;
      gepruefteHaeuser++;

      // Belegte Tage aus eigenen Buchungen.
      // Map statt Set, damit zu jedem Tag auch der Gastname bekannt ist — die
      // Belegungsliste soll zeigen, WELCHE Buchung hinter einem Block steht.
      const belegtVon = new Map<string, string>();
      for (const b of bookings ?? []) {
        for (const t of tageIm(b.check_in, b.check_out)) {
          belegtVon.set(t, b.guest_name ?? 'Buchung');
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
            text: `${formatDE(z.von)}–${formatDE(z.bis)} ist bei ${platListe} belegt, im System aber frei (${n} Nächte).`,
          });
        }
      }
    }

    // Wichtigstes zuerst: fehlende Buchungen vor Langsperren vor Feed-Fehlern.
    const rang: Record<BefundArt, number> = {
      fehlende_buchung: 0, langsperre: 1, feed_fehler: 2,
    };
    befunde.sort((a, b) => rang[a.art] - rang[b.art] || (a.von ?? '').localeCompare(b.von ?? ''));

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

    if (settings.mail_enabled && befunde.length > 0) {
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

      if (neu.length > 0) {
        // Fehlende Buchungen sind dringender als Hinweise: Dahinter steckt ein
        // Gast, der anreist, ohne dass Reinigung und Wäsche geplant sind.
        const fehlende = neu.filter((b) => b.art === 'fehlende_buchung');
        const betreff = fehlende.length > 0
          ? `⚠️ ${fehlende.length} Buchung(en) fehlen im System`
          : `Kalender-Abgleich: ${neu.length} neue(r) Hinweis(e)`;

        const zeilen = neu.map((b) => `• ${b.haus}: ${b.text}`).join('\n');
        const body =
          (fehlende.length > 0
            ? `Der Kalender-Abgleich hat ${fehlende.length} Zeitraum/Zeiträume gefunden, ` +
              `die bei einem Portal belegt sind, im System aber nicht.\n\n` +
              `Dahinter steckt in der Regel eine Buchung, die noch nicht nachgetragen wurde: ` +
              `Ohne Eintrag gibt es keine Reinigung, keine Wäsche und keinen Gästekontakt — ` +
              `und der Zeitraum könnte versehentlich noch einmal vergeben werden.\n\n`
            : `Der Kalender-Abgleich hat neue Hinweise gefunden.\n\n`) +
          `${zeilen}\n\n` +
          `Bitte im jeweiligen Portal nachsehen. Diese Meldung kommt einmalig je Befund; ` +
          `in der Morgen-Übersicht bleibt sie sichtbar, bis sie erledigt ist.`;

        try {
          // ACHTUNG bei der Schnittstelle: send-guest-email erwartet
          // `recipients` (Array von { email }), `subjectTemplate` und
          // `bodyTemplate` — NICHT to/subject/body. Ein Aufruf mit den
          // naheliegenden Namen wird mit HTTP 400 abgelehnt und die Mail geht
          // nie raus. (Geprüft am 19.07.2026 in send-guest-email/index.ts.)
          const { error: mailErr } = await supabase.functions.invoke('send-guest-email', {
            body: {
              // Nur `email` — die weiteren Recipient-Felder dienen der
              // Platzhalter-Ersetzung und werden hier nicht gebraucht.
              recipients: [{ email: settings.mail_to }],
              subjectTemplate: betreff,
              bodyTemplate: body,
            },
          });
          if (mailErr) {
            console.error('[kalender-abgleich] Mail fehlgeschlagen:', mailErr);
          } else {
            mailGesendet = true;
            // Erst NACH erfolgreichem Versand merken. Schlägt die Mail fehl,
            // wird beim nächsten Lauf erneut versucht — besser eine Mail zu viel
            // als eine fehlende Buchung, von der niemand erfährt.
            await supabase.from('kalender_abgleich_meldungen').insert(
              neu.map((b) => ({
                house_id: b.house_id, art: b.art, platform: b.platform,
                von: b.von ?? null, bis: b.bis ?? null, text: b.text,
              })),
            );
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
