import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Etappe 3 — Max prüft täglich anstehende Reinigungen und fragt Amela/Teuni,
// ob der Termin passt. Informiert dabei auch, ob die Wäsche schon geliefert ist.
//
// SICHERHEIT:
//  - dry_run (Testlauf) ist STANDARD: es wird NICHTS gesendet, nur simuliert.
//    Echtes Senden nur, wenn im Body { "dry_run": false } übergeben wird
//    UND max_reminder_enabled in den Einstellungen true ist.
//  - Spam-Schutz: pro Reinigung (related_task_id) wird höchstens EINE Frage
//    gesendet. Wurde schon gefragt, wird die Reinigung übersprungen.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // dry_run-Standard: true. Nur explizit false erlaubt echtes Senden.
    let dryRun = true;
    try {
      const body = await req.json();
      if (body && body.dry_run === false) dryRun = false;
    } catch (_) {
      // kein Body -> dry_run bleibt true
    }

    console.log(`🤖 [max-cleaning-reminders] Start. dry_run=${dryRun}`);

    // 1. Einstellungen laden
    const { data: settings, error: settingsError } = await supabase
      .from('cleaning_automation_settings')
      .select('*')
      .single();

    if (settingsError) {
      console.error('❌ Einstellungen konnten nicht geladen werden:', settingsError);
      throw settingsError;
    }

    const daysBefore = settings?.max_reminder_days_before ?? 3;
    const reminderEnabled = settings?.max_reminder_enabled === true;

    // Beim echten Senden muss die Automatik in den Einstellungen aktiv sein.
    if (!dryRun && !reminderEnabled) {
      console.log('⏸️ Automatik ist in den Einstellungen deaktiviert. Kein echtes Senden.');
      return json({
        success: true,
        modus: 'echt-aber-deaktiviert',
        hinweis: 'max_reminder_enabled ist false. Bitte in der Hausverwaltung aktivieren.',
        gesendet: 0,
      });
    }

    // 2. Zeitfenster berechnen: heute bis heute+daysBefore
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + daysBefore);

    const todayStr = today.toISOString().split('T')[0];
    const windowEndStr = windowEnd.toISOString().split('T')[0];

    console.log(`📅 Fenster: ${todayStr} bis ${windowEndStr} (${daysBefore} Tage vorher)`);

    // 3. Anstehende Reinigungen im Fenster finden (nur geplante, mit Provider und Buchung)
    const { data: cleanings, error: cleaningsError } = await supabase
      .from('service_tasks')
      .select(`
        id, booking_id, scheduled_date, scheduled_time, status, provider_id, house_id,
        service_providers!service_tasks_provider_id_fkey(id, name),
        houses(name),
        bookings(guest_name, check_in, check_out, status)
      `)
      .eq('service_type', 'cleaning')
      .eq('status', 'scheduled')
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', windowEndStr)
      .order('scheduled_date', { ascending: true });

    if (cleaningsError) {
      console.error('❌ Reinigungen konnten nicht geladen werden:', cleaningsError);
      throw cleaningsError;
    }

    console.log(`🧹 ${cleanings?.length || 0} anstehende Reinigung(en) im Fenster.`);

    const results: any[] = [];
    let sentCount = 0;
    let skippedAlreadyAsked = 0;

    for (const task of cleanings || []) {
      const provider = (task as any).service_providers;
      const booking = (task as any).bookings;
      const house = (task as any).houses;

      // Buchung muss aktiv sein (nicht storniert/abgeschlossen)
      if (!booking || booking.status !== 'confirmed') {
        continue;
      }
      if (!provider?.id) {
        continue;
      }

      // 4. Spam-Schutz: schon zu dieser Reinigung gefragt?
      const { data: existing, error: existingError } = await supabase
        .from('provider_messages')
        .select('id')
        .eq('related_task_id', task.id)
        .eq('sender_type', 'assistant')
        .limit(1);

      if (existingError) {
        console.error('❌ Prüfung "schon gefragt" fehlgeschlagen:', existingError);
        continue;
      }
      if (existing && existing.length > 0) {
        skippedAlreadyAsked++;
        continue;
      }

      // 5. Wäsche-Status für diese Buchung ermitteln (muss VOR der Reinigung da sein)
      let laundryInfo = 'Zur Wäsche liegt mir aktuell keine Info vor.';
      if (task.booking_id) {
        const { data: linen } = await supabase
          .from('linen_orders')
          .select('status, delivery_date')
          .eq('booking_id', task.booking_id)
          .order('delivery_date', { ascending: true });

        if (linen && linen.length > 0) {
          const delivered = linen.find((l: any) => l.status === 'delivered');
          if (delivered) {
            laundryInfo = `Die frische Wäsche ist bereits geliefert${delivered.delivery_date ? ` (am ${formatDate(delivered.delivery_date)})` : ''}.`;
          } else {
            const next = linen[0];
            if (next?.delivery_date) {
              const beforeCleaning = next.delivery_date <= task.scheduled_date;
              laundryInfo = beforeCleaning
                ? `Die Wäsche soll am ${formatDate(next.delivery_date)} geliefert werden – also vor der Reinigung.`
                : `Achtung: Die Wäsche soll erst am ${formatDate(next.delivery_date)} geliefert werden – das wäre NACH der Reinigung.`;
            } else {
              laundryInfo = 'Die Wäsche ist bestellt, aber noch ohne festes Lieferdatum.';
            }
          }
        }
      }

      // 6. Nachricht formulieren
      const houseName = house?.name || 'das Objekt';
      const guestName = booking?.guest_name || 'den nächsten Gast';
      const dateStr = formatDate(task.scheduled_date);
      const timeStr = task.scheduled_time ? ` um ${task.scheduled_time.slice(0, 5)} Uhr` : '';

      const message =
        `Hallo ${provider.name}, ich bin Max, der KI-Assistent von Uli. ` +
        `Am ${dateStr}${timeStr} steht die Reinigung im ${houseName} an (für Gast ${guestName}). ` +
        `${laundryInfo} ` +
        `Passt dir der Termin, oder sollen wir ihn ändern?`;

      if (dryRun) {
        // Testlauf: nur zeigen, nichts senden
        results.push({
          wuerde_senden_an: provider.name,
          reinigung: `${dateStr}${timeStr} – ${houseName}`,
          gast: guestName,
          nachricht: message,
          related_task_id: task.id,
        });
      } else {
        // Echtes Senden
        const { error: insErr } = await supabase
          .from('provider_messages')
          .insert({
            provider_id: provider.id,
            sender_type: 'assistant',
            message,
            related_task_id: task.id,
            is_read: false,
          });
        if (insErr) {
          console.error(`❌ Senden an ${provider.name} fehlgeschlagen:`, insErr);
          results.push({ fehler: insErr.message, an: provider.name, reinigung: dateStr });
        } else {
          sentCount++;
          results.push({ gesendet_an: provider.name, reinigung: `${dateStr} – ${houseName}`, gast: guestName });

          // Workflow eröffnen: die Terminfrage wartet jetzt auf den Provider.
          // due_at +24 h -> danach erkennt der Wächter "keine Antwort" (Ablauf provider_keine_antwort).
          try {
            const dueAt = new Date();
            dueAt.setHours(dueAt.getHours() + 24);
            const waitingFor = /teuni/i.test(provider.name) ? 'teuni' : /amela/i.test(provider.name) ? 'amela' : 'provider';
            await supabase.from('max_actions').insert({
              action_type: 'cleaning_termin_check',
              status: 'wartet_provider',
              booking_id: task.booking_id ?? null,
              guest_name: guestName,
              related_task_id: task.id,
              waiting_for: waitingFor,
              last_step: `Terminfrage an ${provider.name} gesendet (${dateStr})`,
              due_at: dueAt.toISOString(),
              details: { reinigung: `${dateStr}${timeStr} – ${houseName}`, an: provider.name },
              created_by: 'max',
            });
          } catch (logErr) {
            console.error('max_actions-Log (cleaning) fehlgeschlagen:', logErr);
          }
        }
      }
    }

    return json({
      success: true,
      modus: dryRun ? 'TESTLAUF (nichts gesendet)' : 'echt',
      fenster: `${todayStr} bis ${windowEndStr}`,
      tage_vorher: daysBefore,
      gefundene_reinigungen: cleanings?.length || 0,
      uebersprungen_schon_gefragt: skippedAlreadyAsked,
      gesendet: sentCount,
      details: results,
    });
  } catch (error) {
    console.error('❌ Fehler:', error);
    return json({ success: false, error: String(error) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return iso;
  }
}
