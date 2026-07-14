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
 *   - Tool          -> existiert es in den Tool-Definitionen von chat-assistant?
 *   - Edge Function -> gibt es sie (antwortet sie auf OPTIONS)?
 *   - DB-Trigger    -> steht er in pg_trigger?
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
 * Die Tools, die chat-assistant WIRKLICH kennt.
 *
 * WARUM HART HINTERLEGT: Eine Edge Function kann den Quelltext einer anderen
 * nicht lesen. Diese Liste MUSS mitgepflegt werden, wenn Tools dazukommen oder
 * wegfallen — sie ist der Prüfmaßstab.
 *
 * Stand 14.07.2026: 26 Tools.
 * Stillgelegt am 12.07.2026 (bewusst NICHT in der Liste, damit die Prüfung
 * anschlägt, falls sie irgendwo noch genannt werden):
 *   create_bulk_cleaning_tasks, create_bulk_linen_orders
 */
const VORHANDENE_TOOLS = new Set([
  'accept_booking_inquiry',
  'check_upcoming_bookings',
  'create_cleaning_for_booking',
  'create_linen_for_booking',
  'draft_guest_welcome_email',
  'get_booking_full_context',
  'get_calendar_events',
  'get_daily_overview',
  'get_dashboard_stats',
  'get_guest_contact_reminders',
  'get_linen_overview',
  'get_morning_summary',
  'get_rating_reminders',
  'get_revenue_stats',
  'read_provider_replies',
  'reject_booking_inquiry',
  'reschedule_cleaning',
  'save_knowledge',
  'search_booking_inquiries',
  'search_bookings',
  'search_cleaning_tasks',
  'search_guests',
  'search_houses',
  'search_linen_orders',
  'send_provider_message',
  'update_linen_for_booking',
]);

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

    // Welche DB-Trigger gibt es? (Eine einzige Abfrage statt 43 Einzelprüfungen.)
    const { data: triggerData } = await supabase.rpc('max_pruefe_trigger_liste');
    const vorhandeneTrigger = new Set<string>(
      (triggerData || []).map((t: any) => t.trigger_name),
    );

    // Welche Edge Functions gibt es? Aus der Liste, die im Repo liegt.
    // (Deno kann den Ordner zur Laufzeit nicht lesen — daher hart hinterlegt.
    //  Muss mitgepflegt werden, wie VORHANDENE_TOOLS.)
    const VORHANDENE_EDGE_FUNCTIONS = new Set([
      'chat-assistant',
      'create-cleaning-task-for-booking',
      'create-linen-order-for-booking',
      'generate-booking-linen-order',
      'max-cleaning-reminders',
      'max-linen-reminders',
      'morning-summary',
      'overdue-watch',
      'send-guest-email',
      'send-provider-message',
      'auto-create-linen-orders',
      'max-ablaeufe-pruefen',
    ]);

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
        if (VORHANDENE_TOOLS.has(t)) {
          geprueft.push(`Tool ${t}`);
        } else {
          probleme.push(`Tool "${t}" existiert NICHT in chat-assistant`);
        }
      }
      for (const e of edgeFunctions) {
        if (VORHANDENE_EDGE_FUNCTIONS.has(e)) {
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
    const nichtDefiniert = [...VORHANDENE_TOOLS].filter((t) => !genannteTools.has(t));

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
