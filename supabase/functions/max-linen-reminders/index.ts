import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Max erinnert Teuni (Wäsche), die Wäsche rechtzeitig VOR der Reinigung zu liefern.
// Gespiegelte Logik zu max-cleaning-reminders (Amela):
//  - geht anstehende Reinigungen im Vorlauf-Fenster durch
//  - erinnert Teuni NUR, wenn die zugehörige Wäsche noch NICHT geliefert ist
//    (ist sie schon geliefert, gibt es nichts zu tun -> überspringen)
//
// SICHERHEIT (identisch zu Amela):
//  - dry_run (Testlauf) ist STANDARD: nichts wird gesendet, nur simuliert.
//    Echtes Senden nur bei { "dry_run": false } UND max_linen_reminder_enabled=true.
//  - Spam-Schutz: pro WÄSCHEBESTELLUNG (related_linen_order_id) höchstens EINE
//    Erinnerung. Bis 05.08.2026 lief er über die Reinigung (related_task_id) —
//    siehe die ausführliche Begründung unten im Schleifenkörper.

const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';

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

    console.log(`🤖 [max-linen-reminders] Start. dry_run=${dryRun}`);

    // 1. Einstellungen laden (eigene Teuni-Felder, unabhängig von Amela)
    const { data: settings, error: settingsError } = await supabase
      .from('cleaning_automation_settings')
      .select('*')
      .single();

    if (settingsError) {
      console.error('❌ Einstellungen konnten nicht geladen werden:', settingsError);
      throw settingsError;
    }

    const daysBefore = settings?.max_linen_reminder_days_before ?? 5;
    const reminderEnabled = settings?.max_linen_reminder_enabled === true;

    if (!dryRun && !reminderEnabled) {
      console.log('⏸️ Teuni-Automatik ist deaktiviert. Kein echtes Senden.');
      return json({
        success: true,
        modus: 'echt-aber-deaktiviert',
        hinweis: 'max_linen_reminder_enabled ist false. Bitte in der Hausverwaltung aktivieren.',
        gesendet: 0,
      });
    }

    // 2. Zeitfenster: heute bis heute+daysBefore
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + daysBefore);
    const todayStr = today.toISOString().split('T')[0];
    const windowEndStr = windowEnd.toISOString().split('T')[0];

    console.log(`📅 Fenster: ${todayStr} bis ${windowEndStr} (${daysBefore} Tage vorher)`);

    // 3. Anstehende Reinigungen im Fenster (die Wäsche muss vorher da sein)
    const { data: cleanings, error: cleaningsError } = await supabase
      .from('service_tasks')
      .select(`
        id, booking_id, scheduled_date, scheduled_time, status, house_id,
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
    let skippedDelivered = 0;
    let ohneBestellung = 0;   // Reinigung mit Buchung, aber ohne Wäschebestellung

    for (const task of cleanings || []) {
      const booking = (task as any).bookings;
      const house = (task as any).houses;

      if (!booking || booking.status !== 'confirmed') continue;
      if (!task.booking_id) continue;

      // ============================================================
      // BEZUG: die WÄSCHEBESTELLUNG, nicht die Reinigung (korrigiert 05.08.2026)
      // ============================================================
      // Bis hierher trugen Nachricht UND max_actions-Vorgang related_task_id —
      // also die Reinigung. Das war falsch und hatte zwei Folgen:
      //
      //  (1) KOLLISION: max-cleaning-reminders legt zur SELBEN Reinigung einen
      //      Vorgang mit derselben related_task_id an. Der Reply-Trigger
      //      (max_actions_on_provider_reply) sucht ohne Anbieter-Filter und
      //      nimmt den NEUESTEN Treffer — antwortet einer der beiden, wurde
      //      womöglich der Vorgang des anderen als "beantwortet" markiert.
      //
      //  (2) VERDECKUNG: Die Spam-Prüfung in max-cleaning-reminders filtert
      //      nur auf related_task_id (ohne provider_id). Teunis Nachricht ging
      //      wegen des größeren Vorlaufs (5 statt 3 Tage) zwei Tage früher raus
      //      und galt dort als "schon gefragt" — der Reinigungsdienstleister
      //      wurde nie gefragt, ohne Fehlermeldung.
      //
      // Beide Ketten hängen jetzt an getrennten Schlüsseln:
      //      Reinigung  -> related_task_id        (service_tasks)
      //      Wäsche     -> related_linen_order_id (linen_orders)
      //
      // Das entspricht dem Trigger 23_max_provider_reply_linen.sql, dem
      // Teuni-Portal (usePortalMessages.ts gibt beide Bezüge weiter und nennt
      // related_linen_order_id ausdrücklich als Teunis Regelfall) und der
      // SOLL-Definition in max_ablaeufe.
      //
      // REIHENFOLGE GEÄNDERT: Die Wäschebestellung muss VOR der Spam-Prüfung
      // bekannt sein, weil sie jetzt der Schlüssel dafür ist.

      // 4. Wäsche-Status prüfen. Nur erinnern, wenn NOCH NICHT geliefert.
      //    'id' wird neu benötigt (Bezugsfeld) und muss deshalb neu angefordert
      //    werden — ein nicht selektiertes Feld wäre stumm undefined.
      //    Stornierte Bestellungen bleiben außen vor: an eine abgesagte
      //    Lieferung darf sich kein Vorgang hängen.
      const { data: linen } = await supabase
        .from('linen_orders')
        .select('id, status, delivery_date')
        .eq('booking_id', task.booking_id)
        .neq('status', 'cancelled')
        .order('delivery_date', { ascending: true });

      const hasDelivered = (linen || []).some((l: any) => l.status === 'delivered');
      if (hasDelivered) { skippedDelivered++; continue; }  // schon geliefert -> nichts zu tun

      const next = (linen || [])[0];

      // Ohne Wäschebestellung gibt es keinen Bezug — und ohne Bezug entstünde
      // ein Vorgang, den niemand je zuordnen oder abschließen kann (genau die
      // Falle, gegen die send_provider_message seit 12.07. sperrt).
      // Deshalb hier NICHT senden. Der Fall ist kein Wäsche-Thema, sondern eine
      // fehlende Bestellung — dafür ist der Wächter check_upcoming_bookings
      // zuständig, der Uli genau das meldet ("keine Wäsche bestellt").
      // Er wird sichtbar gezählt und im Ergebnis benannt, damit er nicht
      // stillschweigend verschwindet.
      if (!next?.id) {
        ohneBestellung++;
        results.push({
          uebersprungen: 'keine Wäschebestellung vorhanden',
          reinigung: `${formatDate(task.scheduled_date)} – ${house?.name || 'Objekt'}`,
          gast: booking?.guest_name || null,
          hinweis: 'Ohne Bestellung gibt es keinen Bezug. check_upcoming_bookings meldet den Fall an Uli.',
        });
        continue;
      }

      // 5. Spam-Schutz: schon zu DIESER Wäschebestellung an Teuni erinnert?
      const { data: existing, error: existingError } = await supabase
        .from('provider_messages')
        .select('id')
        .eq('related_linen_order_id', next.id)
        .eq('provider_id', TEUNI_PROVIDER_ID)
        .eq('sender_type', 'assistant')
        .limit(1);

      if (existingError) { console.error('❌ Spam-Prüfung fehlgeschlagen:', existingError); continue; }
      if (existing && existing.length > 0) { skippedAlreadyAsked++; continue; }

      const deliveryHint = next.delivery_date
        ? `Geplantes Lieferdatum: ${formatDate(next.delivery_date)}.`
        : `Für die Wäsche ist noch kein Lieferdatum hinterlegt.`;

      // 6. Nachricht an Teuni
      const houseName = house?.name || 'das Objekt';
      const guestName = booking?.guest_name || 'den nächsten Gast';
      const dateStr = formatDate(task.scheduled_date);
      const timeStr = task.scheduled_time ? ` um ${task.scheduled_time.slice(0, 5)} Uhr` : '';

      const message =
        `Hallo Teuni, ich bin Max, der KI-Assistent von Uli. ` +
        `Im ${houseName} steht am ${dateStr}${timeStr} die Reinigung an (für Gast ${guestName}). ` +
        `Die frische Wäsche muss also vorher da sein. ${deliveryHint} ` +
        `Bitte denk an die rechtzeitige Lieferung.`;

      if (dryRun) {
        results.push({
          wuerde_senden_an: 'Teuni',
          reinigung: `${dateStr}${timeStr} – ${houseName}`,
          gast: guestName,
          nachricht: message,
          related_linen_order_id: next.id,
        });
      } else {
        const { error: insErr } = await supabase
          .from('provider_messages')
          .insert({
            provider_id: TEUNI_PROVIDER_ID,
            sender_type: 'assistant',
            message,
            // Bezug = Wäschebestellung (NICHT die Reinigung). Teunis Antwort
            // übernimmt dieses Feld automatisch (usePortalMessages.ts) und der
            // Trigger findet darüber den richtigen Vorgang.
            related_linen_order_id: next.id,
            is_read: false,
          });
        if (insErr) {
          console.error('❌ Senden an Teuni fehlgeschlagen:', insErr);
          results.push({ fehler: insErr.message, reinigung: dateStr });
        } else {
          sentCount++;
          results.push({ gesendet_an: 'Teuni', reinigung: `${dateStr} – ${houseName}`, gast: guestName });

          // Workflow eröffnen: die Wäsche-/Liefer-Frage wartet jetzt auf Teuni.
          // due_at +24 h -> danach erkennt der Wächter "keine Antwort" (Ablauf provider_keine_antwort).
          try {
            const dueAt = new Date();
            dueAt.setHours(dueAt.getHours() + 24);
            await supabase.from('max_actions').insert({
              action_type: 'linen_termin_check',
              status: 'wartet_provider',
              booking_id: task.booking_id ?? null,
              guest_name: guestName,
              // BEWUSST NUR der Wäsche-Bezug. Würde hier zusätzlich
              // related_task_id gesetzt, entstünde die Kollision mit dem
              // Vorgang von max-cleaning-reminders erneut: Der Reply-Trigger
              // prüft related_task_id ZUERST und könnte bei einer Antwort des
              // Reinigungsdienstleisters diesen Wäsche-Vorgang treffen.
              // Das Reinigungsdatum steht stattdessen in details.
              related_linen_order_id: next.id,
              waiting_for: 'teuni',
              last_step: `Liefer-Erinnerung an Teuni gesendet (${dateStr})`,
              due_at: dueAt.toISOString(),
              details: {
                reinigung: `${dateStr}${timeStr} – ${houseName}`,
                reinigung_task_id: task.id,   // nur zur Information, kein Bezug
              },
              created_by: 'max',
            });
          } catch (logErr) {
            console.error('max_actions-Log (linen) fehlgeschlagen:', logErr);
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
      uebersprungen_schon_erinnert: skippedAlreadyAsked,
      ohne_waeschebestellung: ohneBestellung,
      uebersprungen_wäsche_geliefert: skippedDelivered,
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
  try { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; } catch { return iso; }
}
