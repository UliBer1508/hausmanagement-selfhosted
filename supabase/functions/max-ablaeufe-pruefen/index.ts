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
const CHAT_ASSISTANT_URL =
  'https://raw.githubusercontent.com/UliBer1508/hausmanagement-selfhosted/main/supabase/functions/chat-assistant/index.ts';

async function ladeVorhandeneTools(): Promise<Set<string> | null> {
  try {
    const res = await fetch(CHAT_ASSISTANT_URL, { cache: 'no-store' });
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

/** Zerlegt das Freitext-Feld `funktion` in prüfbare Bausteine. */
function extrahiereBausteine(funktion: string) {
  const f = funktion || '';
  return {
    tools: [...f.matchAll(/\bTool\s+(\w+)/g)].map((m) => m[1]),
    edgeFunctions: [...f.matchAll(/Edge Function\s+([\w-]+)/g)].map((m) => m[1]),
    trigger: [...f.matchAll(/(?:DB-)?Trigger\s+(\w+)/g)].map((m) => m[1]),
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
    const { data: zeilen, error } = await supabase
      .from('max_ablaeufe')
      .select('id, aktion, aktion_label, variante, schritt_nr, funktion, umsetzung');

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

    const ergebnis = {
      geprueft_am: jetzt,
      zeilen_gesamt: (zeilen || []).length,
      ok: okZahl,
      fehler: fehlerZahl,
      menschliche_schritte: ohneBezug,
      befunde,
      tools_ohne_ablauf: nichtDefiniert,
      hinweis:
        nichtDefiniert.length > 0
          ? `${nichtDefiniert.length} Tools existieren, kommen aber in keinem Ablauf vor. ` +
            'Entweder fehlt die Ablauf-Definition, oder das Tool wird nicht gebraucht.'
          : 'Alle vorhandenen Tools sind einem Ablauf zugeordnet.',
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
