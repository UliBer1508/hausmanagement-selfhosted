import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/**
 * =============================================================================
 * max-ablaeufe-pruefen — Wahrheitsprüfung der Ablauf-Definition
 * =============================================================================
 *
 * DAS PROBLEM (14.07.2026, von Uli benannt):
 * Die Tabelle max_ablaeufe hatte keinen Bezug zur Wirklichkeit. Das Feld
 * `umsetzung` wurde VON HAND auf "umgesetzt" gesetzt — ohne dass irgendjemand
 * prüfte, ob es stimmt. Und `funktion` ist reiner Text: Steht dort
 * "Tool search_bookings", weiß niemand, ob dieses Tool noch existiert.
 *
 * Belegt: Der System-Prompt verwies bis zum 14.07. auf create_bulk_cleaning_tasks
 * — ein Tool, das am 12.07. stillgelegt wurde. VIER TAGE lang stand da eine
 * Anweisung ins Leere, und keine Prüfung schlug an.
 *
 * WAS DIESE FUNKTION TUT:
 * Sie liest die Tabelle, extrahiert aus `funktion` alle genannten Bausteine
 * (Tools, Edge Functions, DB-Trigger) und prüft JEDEN einzeln gegen die
 * Wirklichkeit:
 *
 *   - Tool          -> steht es im ECHTEN chat-assistant-Code? (wird von GitHub
 *                      geladen und ausgelesen — keine Handliste)
 *   - Edge Function -> gibt es den Ordner im Repo? (GitHub-API)
 *   - DB-Trigger    -> steht er in pg_trigger? (RPC max_pruefe_trigger_liste)
 *
 * KEINE HANDLISTEN (14.07.2026 umgebaut): Früher standen Tools und Edge Functions
 * in fest einprogrammierten Listen. Die veralteten genau so, wie es diese Prüfung
 * verhindern soll — reject_reschedule wurde gebaut und deployt, die Prüfung meldete
 * es trotzdem als "existiert NICHT". Und in der Edge-Function-Liste stand eine
 * Function, die es gar nicht gibt. Eine Wahrheitsprüfung, die selbst Unwahrheiten
 * pflegt, ist wertlos. Jetzt wird beides aus der Quelle gelesen.
 *
 * Das Ergebnis landet in max_ablaeufe.geprueft_am / geprueft_status /
 * geprueft_befund. Damit ist `umsetzung` nicht mehr Ulis Behauptung, sondern
 * ein Befund des Systems.
 *
 * AUFRUF:
 *   POST /functions/v1/max-ablaeufe-pruefen
 *   -> läuft auch per Cron (täglich) und über den Knopf im Ablauf-Panel.
 * =============================================================================
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

/**
 * Liest die Werkzeuge DIREKT aus dem echten chat-assistant-Code.
 *
 * WARUM (14.07.2026 geändert):
 * Vorher stand hier eine von Hand gepflegte Liste. Die veraltete genau so, wie es
 * diese Prüfung eigentlich verhindern soll: reject_reschedule wurde gebaut und
 * deployt — die Prüfung meldete es trotzdem als "existiert NICHT", weil niemand
 * die Liste nachgezogen hatte. Eine Wahrheitsprüfung, die selbst eine
 * Unwahrheit pflegt, ist wertlos.
 *
 * Jetzt holt sie die Quelldatei von GitHub (das Repo ist öffentlich) und liest
 * die Tool-Namen aus den echten Definitionen. Dieselbe Idee wie bei den
 * DB-Triggern, die schon immer dynamisch geprüft wurden.
 *
 * FALLBACK: Ist GitHub nicht erreichbar, wird NICHT geraten — die Tool-Prüfung
 * wird dann übersprungen (Status 'unbekannt' statt 'fehler'). Lieber keine
 * Aussage als eine falsche.
 */
// WICHTIG: raw.githubusercontent.com hat ein CDN, das aggressiv cacht — es liefert
// je nach Knoten MINUTENLANG einen alten Stand. Das ließ die Prüfung reject_reschedule
// als "existiert NICHT" melden, obwohl es längst im Code stand. `cache: 'no-store'`
// hilft NICHT (steuert nur den lokalen Fetch, nicht das CDN). Lösung: ein
// Cache-Buster (Zeitstempel als Query-Parameter) zwingt frisches Laden.
const CHAT_ASSISTANT_BASE =
  'https://raw.githubusercontent.com/UliBer1508/hausmanagement-selfhosted/main/supabase/functions/chat-assistant/index.ts';

async function ladeVorhandeneTools(): Promise<Set<string> | null> {
  try {
    // Cache-Buster: erzwingt den aktuellen main-Stand (siehe Kommentar oben).
    const url = `${CHAT_ASSISTANT_BASE}?cb=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error('chat-assistant-Quelle nicht ladbar:', res.status);
      return null;
    }
    const code = await res.text();

    // Tool-Definitionen haben die Form:  name: "search_bookings",
    const treffer = [...code.matchAll(/name:\s*"([a-z_]+)"\s*,/g)].map((m) => m[1]);

    // Nur echte Tool-Namen: sie tauchen zusätzlich im Dispatcher auf (case '...':)
    const tools = new Set<string>();
    for (const t of treffer) {
      if (code.includes(`case '${t}':`)) tools.add(t);
    }

    console.log(`${tools.size} Werkzeuge aus dem echten Code gelesen.`);
    return tools.size > 0 ? tools : null;
  } catch (e) {
    console.error('Fehler beim Laden der chat-assistant-Quelle:', e);
    return null;
  }
}

/**
 * Liest die vorhandenen Edge Functions DIREKT aus dem Repo (GitHub-API).
 * Grund wie bei den Tools: Die Handliste war bereits veraltet.
 * FALLBACK: null -> Prüfung wird übersprungen, statt Falsches zu melden.
 */
const FUNCTIONS_API =
  'https://api.github.com/repos/UliBer1508/hausmanagement-selfhosted/contents/supabase/functions?ref=main';

async function ladeVorhandeneEdgeFunctions(): Promise<Set<string> | null> {
  try {
    const res = await fetch(FUNCTIONS_API, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'max-ablaeufe-pruefen' },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('Edge-Function-Liste nicht ladbar:', res.status);
      return null;
    }
    const eintraege = await res.json();
    const namen = new Set<string>(
      (Array.isArray(eintraege) ? eintraege : [])
        .filter((e: any) => e.type === 'dir' && !e.name.startsWith('_'))
        .map((e: any) => e.name as string),
    );
    console.log(`${namen.size} Edge Functions aus dem Repo gelesen.`);
    return namen.size > 0 ? namen : null;
  } catch (e) {
    console.error('Fehler beim Laden der Edge-Function-Liste:', e);
    return null;
  }
}

/**
 * Zerlegt das Freitext-Feld `funktion` in prüfbare Bausteine.
 *
 * FALSCH-POSITIVE (behoben 18.07.2026): Das frühere Muster /\bTool\s+(\w+)/
 * griff bei JEDEM Wort nach "Tool" — auch in Fließtext wie
 * "(kein weiteres Tool noetig)". Daraus wurde der Toolname "noetig"
 * extrahiert und als fehlend gemeldet. Die Kontrollinstanz produzierte damit
 * einen Dauerfehler, der in der Morgen-Übersicht als Systemfehler erschien.
 *
 * Eine Kontrolle, der man nicht trauen kann, ist wertlos: Wer den täglichen
 * Fehlalarm wegklickt, übersieht irgendwann den echten.
 *
 * KORREKTUR: Echte Bezeichner in diesem System sind ausnahmslos snake_case und
 * enthalten mindestens einen Unterstrich (search_bookings, reject_reschedule,
 * notify_amela_on_cleaning_release). Deutsche Fließtextwörter wie "noetig",
 * "nötig" oder "aufrufen" haben keinen. Der Unterstrich ist deshalb ein
 * verlässliches Unterscheidungsmerkmal.
 *
 * Edge Functions dürfen zusätzlich Bindestriche enthalten (create-linen-order),
 * daher dort eine eigene Prüfung auf `-` ODER `_`.
 */
function extrahiereBausteine(funktion: string) {
  const f = funktion || '';

  // Bezeichner-Test: muss einen Unterstrich enthalten (snake_case).
  const istBezeichner = (w: string) => w.includes('_');
  // Edge Functions: Bindestrich ODER Unterstrich.
  const istFunktionsname = (w: string) => w.includes('-') || w.includes('_');

  return {
    tools: [...f.matchAll(/\bTool\s+([a-z][a-z0-9_]*)/gi)]
      .map((m) => m[1])
      .filter(istBezeichner),
    edgeFunctions: [...f.matchAll(/Edge Function\s+([a-z][a-z0-9_-]*)/gi)]
      .map((m) => m[1])
      .filter(istFunktionsname),
    trigger: [...f.matchAll(/(?:DB-)?Trigger\s+([a-z][a-z0-9_]*)/gi)]
      .map((m) => m[1])
      .filter(istBezeichner),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ---- 1. Wirklichkeit erheben -------------------------------------------

    // Welche Werkzeuge gibt es? Direkt aus dem echten chat-assistant-Code.
    // null = Quelle nicht erreichbar -> Tool-Prüfung wird übersprungen (siehe unten).
    const VORHANDENE_TOOLS = await ladeVorhandeneTools();

    // Welche DB-Trigger gibt es? (Eine einzige Abfrage statt 43 Einzelprüfungen.)
    const { data: triggerData } = await supabase.rpc('max_pruefe_trigger_liste');
    const vorhandeneTrigger = new Set<string>(
      (triggerData || []).map((t: any) => t.trigger_name),
    );

    // Welche Edge Functions gibt es? Direkt aus dem echten Repo (GitHub-API).
    // Vorher stand hier eine Handliste — sie war bereits falsch: 'send-provider-message'
    // war eingetragen, existiert aber nicht; über 20 echte Functions fehlten.
    // null = nicht erreichbar -> keine Aussage treffen (siehe unten).
    const VORHANDENE_EDGE_FUNCTIONS = await ladeVorhandeneEdgeFunctions();

    // ---- 2. Jede Zeile prüfen ----------------------------------------------
    //
    // AUSGENOMMEN: die eigene Ergebniszeile (aktion='systempruefung'). Sie
    // beschreibt keinen Arbeitsablauf, sondern haelt das Ergebnis DIESER Pruefung
    // fest (siehe Schritt 3c). Wuerde sie mitgeprueft, setzte Schritt 2 ihren
    // Status auf 'ok' (ihr funktion-Text nennt eine existierende Edge Function) —
    // Schritt 3c korrigierte ihn kurz darauf wieder. Das Endergebnis waere zwar
    // richtig, aber die Zaehler ok/fehler zaehlten die Pruefung selbst mit und
    // meldeten dauerhaft eine Zeile zu viel.
    const { data: zeilen, error } = await supabase
      .from('max_ablaeufe')
      .select('id, aktion, aktion_label, variante, schritt_nr, funktion, umsetzung')
      .neq('aktion', 'systempruefung');

    if (error) throw error;

    const jetzt = new Date().toISOString();
    let okZahl = 0;
    let fehlerZahl = 0;
    let ohneBezug = 0;
    const befunde: any[] = [];

    for (const z of zeilen || []) {
      const { tools, edgeFunctions, trigger } = extrahiereBausteine(z.funktion || '');
      const probleme: string[] = [];
      const geprueft: string[] = [];

      for (const t of tools) {
        if (VORHANDENE_TOOLS === null) {
          // Quelle nicht erreichbar -> keine Aussage treffen (lieber nichts als Falsches).
          geprueft.push(`Tool ${t} (nicht prüfbar: Quelle nicht erreichbar)`);
        } else if (VORHANDENE_TOOLS.has(t)) {
          geprueft.push(`Tool ${t}`);
        } else {
          probleme.push(`Tool "${t}" existiert NICHT in chat-assistant`);
        }
      }
      for (const e of edgeFunctions) {
        if (VORHANDENE_EDGE_FUNCTIONS === null) {
          geprueft.push(`Edge Function ${e} (nicht prüfbar: Repo nicht erreichbar)`);
        } else if (VORHANDENE_EDGE_FUNCTIONS.has(e)) {
          geprueft.push(`Edge Function ${e}`);
        } else {
          probleme.push(`Edge Function "${e}" existiert NICHT`);
        }
      }
      for (const g of trigger) {
        // Trigger werden mal mit, mal ohne trg_-Präfix genannt — beides zulassen.
        const gefunden =
          vorhandeneTrigger.has(g) ||
          vorhandeneTrigger.has(`trg_${g}`) ||
          vorhandeneTrigger.has(g.replace(/^trg_/, ''));
        if (gefunden) {
          geprueft.push(`Trigger ${g}`);
        } else {
          probleme.push(`DB-Trigger "${g}" existiert NICHT in der Datenbank`);
        }
      }

      // Status bestimmen.
      let status: string;
      let befund: string;

      if (tools.length === 0 && edgeFunctions.length === 0 && trigger.length === 0) {
        // Reine Prosa ("Uli im Chat", "Uli wählt im Chat") — das ist eine
        // MENSCHLICHE Handlung, kein Code. Nicht prüfbar, und das ist in Ordnung.
        status = 'kein_code';
        befund = 'Menschlicher Schritt — kein Code zu prüfen.';
        ohneBezug++;
      } else if (probleme.length > 0) {
        status = 'fehler';
        befund = probleme.join(' | ');
        fehlerZahl++;
      } else {
        status = 'ok';
        befund = `Geprüft: ${geprueft.join(', ')}`;
        okZahl++;
      }

      await supabase
        .from('max_ablaeufe')
        .update({
          geprueft_am: jetzt,
          geprueft_status: status,
          geprueft_befund: befund,
        })
        .eq('id', z.id);

      if (status === 'fehler') {
        befunde.push({
          ablauf: z.aktion_label || z.aktion,
          variante: z.variante,
          schritt: z.schritt_nr,
          umsetzung_behauptet: z.umsetzung,
          problem: befund,
        });
      }
    }

    // ---- 3. Verwaiste Tools: existieren, kommen aber in keinem Ablauf vor ----
    const genannteTools = new Set<string>();
    for (const z of zeilen || []) {
      extrahiereBausteine(z.funktion || '').tools.forEach((t) => genannteTools.add(t));
    }
    const nichtDefiniert = VORHANDENE_TOOLS === null
      ? []
      : [...VORHANDENE_TOOLS].filter((t) => !genannteTools.has(t));

    // ---- 3b. Trennung schreibend / lesend (NEU 22.07.2026) -------------------
    //
    // WARUM DIESE TRENNUNG NOETIG IST:
    // Am 22.07.2026 zeigte ein Abgleich: 15 der 30 Tools kamen in keinem Ablauf
    // vor. Die Funktion hatte das laengst berechnet (tools_ohne_ablauf) — nur
    // stand das Ergebnis ausschliesslich im Log und im JSON-Response. In die
    // Morgen-Uebersicht wandern nur Zeilen mit geprueft_status='fehler', und die
    // entstehen allein beim Blick von max_ablaeufe ZUM Code. Die Gegenrichtung
    // ("gibt es zu diesem Tool einen Ablauf?") sah niemand.
    //
    // Es reicht aber nicht, die Liste einfach sichtbar zu machen: Die meisten
    // dieser Tools sind reine Lesewerkzeuge (search_bookings, get_dashboard_stats
    // usw.). Fuer sie gibt es zu Recht keinen Ablauf — es gibt keinen Prozess,
    // nur eine Auskunft. Wuerden sie taeglich gemeldet, entstuende genau der
    // Dauerfehlalarm, den der Kommentar zu extrahiereBausteine beschreibt: Wer
    // die Meldung jeden Morgen wegklickt, uebersieht irgendwann die echte.
    //
    // Gemeldet wird deshalb nur, was SCHREIBT — also Vorgaenge mit bleibender
    // Wirkung. Fuer die gilt: kein Ablauf = keine Freigabestufe definiert =
    // echte Luecke.
    //
    // BEWUSST EINE FESTE LISTE, KEINE HEURISTIK:
    // Ein Test auf Namenspraefixe (get_, search_) trifft daneben —
    // draft_guest_welcome_email schreibt nichts (nur ein Entwurf im Chat),
    // check_upcoming_bookings meldet nur. Ein Test auf .insert/.update im Code
    // trifft ebenfalls daneben: check_kalender_abgleich ruft eine Edge Function,
    // die ausschliesslich liest, und update_provider_action schreibt ueber den
    // Helfer updateMaxAction, was ein Textabgleich nicht sieht.
    //
    // Diese Liste ist Handarbeit und veraltet damit prinzipiell — genau der
    // Fehler, den diese Funktion sonst bekaempft. Der Unterschied: Ein neues
    // schreibendes Tool, das hier fehlt, wird lediglich NICHT gemeldet. Das ist
    // eine verpasste Warnung, kein Fehlalarm. Bei einem neuen Tool gehoert der
    // Name hier ergaenzt.
    const SCHREIBENDE_TOOLS = new Set<string>([
      'accept_booking_inquiry',
      'create_cleaning_for_booking',
      'create_linen_for_booking',
      'reject_booking_inquiry',
      'reject_reschedule',
      'reschedule_cleaning',
      'reschedule_linen_delivery',
      'save_knowledge',
      'send_provider_message',
      'update_linen_for_booking',
      'update_provider_action',
    ]);

    const schreibendOhneAblauf = nichtDefiniert.filter((t) => SCHREIBENDE_TOOLS.has(t));
    const lesendOhneAblauf = nichtDefiniert.filter((t) => !SCHREIBENDE_TOOLS.has(t));

    // ---- 3c. Befund festhalten, damit er sichtbar wird ----------------------
    //
    // Ohne diesen Schritt bliebe der Befund im Log stehen. Die Morgen-Uebersicht
    // liest max_ablaeufe (geprueft_status='fehler') — dort muss der Eintrag also
    // landen, um anzukommen.
    //
    // Getragen wird er von einer eigenen Zeile mit aktion='systempruefung'. Sie
    // beschreibt keinen Arbeitsablauf, sondern haelt das Ergebnis der Pruefung
    // selbst fest. schritt_nr=0 grenzt sie sichtbar von echten Ablaufschritten ab.
    //
    // Der Eintrag wird bei JEDEM Lauf aktualisiert: Gibt es keine Luecke mehr,
    // wechselt der Status zurueck auf 'ok' und die Meldung verschwindet von
    // selbst aus der Morgen-Uebersicht. Kein Aufraeumen von Hand noetig.
    try {
      const luecke = schreibendOhneAblauf.length > 0;
      const zeile = {
        aktion: 'systempruefung',
        aktion_label: 'Selbstpruefung: Tools ohne Ablauf',
        variante: 'automatik',
        schritt_nr: 0,
        akteur: 'system',
        schritt: 'Prueft, ob es zu jedem schreibenden Werkzeug einen definierten Ablauf gibt',
        umsetzung: 'umgesetzt',
        weg: 'system',
        funktion: 'Edge Function max-ablaeufe-pruefen (Gegenrichtung: Tool -> Ablauf)',
        notiz: `Lesewerkzeuge ohne Ablauf (unkritisch, ${lesendOhneAblauf.length}): ${lesendOhneAblauf.join(', ') || 'keine'}`,
        geprueft_am: jetzt,
        geprueft_status: luecke ? 'fehler' : 'ok',
        geprueft_befund: luecke
          ? `${schreibendOhneAblauf.length} schreibende(s) Werkzeug(e) ohne Ablauf-Definition: ${schreibendOhneAblauf.join(', ')}`
          : 'Jedes schreibende Werkzeug hat einen Ablauf.',
      };

      const { data: vorhanden } = await supabase
        .from('max_ablaeufe')
        .select('id')
        .eq('aktion', 'systempruefung')
        .eq('schritt_nr', 0)
        .maybeSingle();

      if (vorhanden) {
        await supabase.from('max_ablaeufe').update(zeile).eq('id', vorhanden.id);
      } else {
        await supabase.from('max_ablaeufe').insert(zeile);
      }
    } catch (e) {
      // Fehlertolerant: Schlaegt das Festhalten fehl, soll die eigentliche
      // Pruefung trotzdem ihr Ergebnis zurueckgeben.
      console.error('[max-ablaeufe-pruefen] Befund konnte nicht gespeichert werden:', e);
    }

    const ergebnis = {
      geprueft_am: jetzt,
      zeilen_gesamt: (zeilen || []).length,
      ok: okZahl,
      fehler: fehlerZahl,
      menschliche_schritte: ohneBezug,
      befunde,
      tools_ohne_ablauf: nichtDefiniert,
      tools_ohne_ablauf_schreibend: schreibendOhneAblauf,
      tools_ohne_ablauf_lesend: lesendOhneAblauf,
      hinweis:
        schreibendOhneAblauf.length > 0
          ? `${schreibendOhneAblauf.length} SCHREIBENDE(S) Werkzeug(e) ohne Ablauf-Definition: ` +
            `${schreibendOhneAblauf.join(', ')}. Das ist eine echte Luecke — fuer diese Vorgaenge ` +
            'ist keine Freigabestufe definiert. Erscheint in der Morgen-Uebersicht.'
          : `Alle schreibenden Werkzeuge haben einen Ablauf. ` +
            `${lesendOhneAblauf.length} Lesewerkzeug(e) ohne Ablauf — das ist in Ordnung ` +
            '(keine Prozesse, nur Auskuenfte).',
    };

    console.log('[max-ablaeufe-pruefen]', JSON.stringify(ergebnis, null, 2));

    return new Response(JSON.stringify(ergebnis, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[max-ablaeufe-pruefen] Fehler:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
