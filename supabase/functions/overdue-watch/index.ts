import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// ÜBERFÄLLIG-WÄCHTER (overdue-watch)
// ============================================================
//
// Zweck: Offene Workflows aufspüren, die auf eine Antwort warten,
// deren Frist (due_at) aber abgelaufen ist.
//
// Beispiel: Max hat Amela am Montag gefragt "Passt der Termin?".
// Dabei wurde gesetzt: status='wartet_provider', waiting_for='amela',
// due_at = Montag + 2 Tage. Antwortet Amela bis Mittwoch nicht, ist
// der Eintrag überfällig — und Uli soll das erfahren.
//
// Was der Wächter tut:
//   1. Sucht in max_actions alle Einträge mit
//      status = 'wartet_provider' AND due_at < jetzt
//   2. Setzt sie auf status = 'ueberfaellig' (das Frontend zeigt sie
//      dann als rotes "Überfällig"-Badge im Max-Aktionen-Fenster)
//   3. Ergänzt last_step um einen Hinweis
//
// Die Morgen-Übersicht kann diese Einträge dann anzeigen
// (morning-summary liest max_actions mit status='ueberfaellig').
//
// SICHERHEIT:
//   - dry_run (Testlauf) ist STANDARD: es wird NICHTS geändert, nur gemeldet.
//   - Echte Änderung nur bei { "dry_run": false }.
//   - Reine Status-Änderung in max_actions — es werden KEINE Nachrichten
//     versendet und keine Termine geändert. Ungefährlich.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let dryRun = true;
    try {
      const body = await req.json();
      if (body && body.dry_run === false) dryRun = false;
    } catch (_) { /* kein Body -> dry_run bleibt true */ }

    const nowIso = new Date().toISOString();
    console.log(`⏰ [overdue-watch] Start. dry_run=${dryRun}, jetzt=${nowIso}`);

    // 1. Überfällige Workflows finden:
    //    warten auf eine Provider-Antwort, Frist ist abgelaufen.
    const { data: overdue, error: findErr } = await supabase
      .from('max_actions')
      .select('id, action_type, status, guest_name, waiting_for, due_at, last_step, related_task_id, booking_id')
      .eq('status', 'wartet_provider')
      .lt('due_at', nowIso)
      .order('due_at', { ascending: true });

    if (findErr) {
      console.error('❌ Suche fehlgeschlagen:', findErr);
      throw findErr;
    }

    console.log(`🔎 ${overdue?.length || 0} überfällige(r) Workflow(s) gefunden.`);

    const results: any[] = [];
    let updatedCount = 0;

    for (const a of overdue || []) {
      const wer = a.waiting_for === 'amela' ? 'Amela'
        : a.waiting_for === 'teuni' ? 'Teuni'
        : (a.waiting_for || 'Dienstleister');

      const faelligSeit = a.due_at ? formatDateDE(String(a.due_at).split('T')[0]) : 'unbekannt';
      const hinweis = `${wer} hat nicht geantwortet (fällig war ${faelligSeit})`;

      const eintrag = {
        id: a.id,
        vorgang: a.action_type,
        gast: a.guest_name,
        wartet_auf: wer,
        faellig_seit: faelligSeit,
        bisheriger_schritt: a.last_step,
      };

      if (dryRun) {
        results.push({ ...eintrag, wuerde_setzen: 'ueberfaellig' });
      } else {
        const neuerStep = a.last_step
          ? `${a.last_step} → ${hinweis}`
          : hinweis;

        const { error: updErr } = await supabase
          .from('max_actions')
          .update({
            status: 'ueberfaellig',
            last_step: neuerStep,
            updated_at: nowIso,
          })
          .eq('id', a.id);

        if (updErr) {
          console.error(`❌ Update fehlgeschlagen für ${a.id}:`, updErr);
          results.push({ ...eintrag, fehler: updErr.message });
        } else {
          updatedCount++;
          results.push({ ...eintrag, gesetzt: 'ueberfaellig' });
          console.log(`⚠️ [overdue-watch] ${a.guest_name}: ${hinweis}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        modus: dryRun ? 'TESTLAUF (nichts geändert)' : 'echt',
        geprueft_am: nowIso,
        gefunden: overdue?.length || 0,
        auf_ueberfaellig_gesetzt: updatedCount,
        hinweis: (overdue?.length || 0) === 0
          ? 'Keine überfälligen Workflows — alle Antworten sind da oder noch in der Frist.'
          : 'Überfällige Workflows erscheinen im Max-Aktionen-Fenster als "Überfällig" (rot).',
        details: results,
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('❌ [overdue-watch] Fehler:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function formatDateDE(iso: string): string {
  try { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; } catch { return iso; }
}
