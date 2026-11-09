import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { istGesperrt } from "../_shared/providerStatus.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// reinigung-erinnerung — E-Mail-Erinnerung an Reinigungen (NEU 09.11.2026)
// ============================================================
//
// Boris wollte erinnert werden, wenn er putzen muss. Er stellt im Boris-Portal
// selbst ein, ob, an welche Adresse, wie viele Tage vorher und um wie viel Uhr
// (Tabelle notification_preferences, siehe supabase/SQL/68_reinigung_erinnerung_email.sql).
//
// Ablauf (max_ablaeufe, aktion = reinigung_erinnerung_email):
//   1. Cron ruft stündlich auf. Je Dienstleister mit eingeschalteter Erinnerung:
//      Ist jetzt (deutsche Zeit) seine gewählte Stunde? Sonst nichts tun.
//   2. Reinigungen am Zieltag (heute + Tage vorher) laden, EINE Mail schicken
//      (über send-guest-email), jede Reinigung im Versandprotokoll vermerken.
//
// SICHERHEIT:
//   - dry_run (Testlauf) ist STANDARD: nichts wird gesendet, nur gezeigt.
//     Echtes Senden nur mit { "dry_run": false } (so ruft der Cron auf).
//   - Doppelversand-Schutz: reinigung_erinnerung_log, eindeutig je Reinigung
//     und Datum. Eine verschobene Reinigung hat ein neues Datum und wird
//     deshalb wieder erinnert.
//   - Testmail aus dem Portal ({ "test": true, "provider_id": ... }) geht nur an
//     die Adresse, die in der Datenbank für diesen Dienstleister steht — nie an
//     eine Adresse aus dem Request.
//   - Keine Gästedaten in Logs.

const BERLIN = 'Europe/Berlin';
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const ERLEDIGT = ['cancelled', 'completed'];

// yyyy-mm-dd in deutscher Zeit (nicht UTC — sonst ist es nachts der falsche Tag)
const berlinDatum = (d: Date): string => d.toLocaleDateString('sv-SE', { timeZone: BERLIN });

// Über formatToParts: de-DE formatiert eine reine Stunde als "18 Uhr" -> Number() = NaN.
const berlinStunde = (d: Date): number => {
  const teil = new Intl.DateTimeFormat('en-GB', { timeZone: BERLIN, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d)
    .find((p) => p.type === 'hour');
  return Number(teil?.value ?? NaN);
};

const plusTage = (iso: string, tage: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + tage));
  return t.toISOString().slice(0, 10);
};

// "Mittwoch, 11.11.2026"
const datumLang = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const wt = WOCHENTAGE[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wt}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
};

const tagWort = (tage: number): string =>
  tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`;

const uhrBerlin = (v: string): string =>
  new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN, hour: '2-digit', minute: '2-digit' }).format(new Date(v));

const datumBerlin = (v: string): string =>
  new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let dryRun = true;
    let ignoreHour = false;
    let test = false;
    let nurProvider: string | null = null;
    try {
      const body = await req.json();
      if (body?.dry_run === false) dryRun = false;
      if (body?.ignore_hour === true) ignoreHour = true;
      if (body?.test === true) test = true;
      if (typeof body?.provider_id === 'string') nurProvider = body.provider_id;
    } catch (_) {
      // kein Body -> Testlauf
    }

    if (test && !nurProvider) {
      return json({ success: false, error: 'Testmail braucht provider_id.' }, 400);
    }

    const jetzt = new Date();
    const heute = berlinDatum(jetzt);
    const stunde = berlinStunde(jetzt);
    console.log(`📧 [reinigung-erinnerung] Start. heute=${heute} stunde=${stunde} dry_run=${dryRun} test=${test}`);

    // 1. Wer will erinnert werden?
    let q = supabase
      .from('notification_preferences')
      .select('id, user_name, provider_id, email_address, email_reminder_enabled, email_reminder_days_before, email_reminder_hour, portal_url, service_providers(name, is_active, inaktiv_wirkung)')
      .not('provider_id', 'is', null);
    if (nurProvider) q = q.eq('provider_id', nurProvider);
    else q = q.eq('email_reminder_enabled', true);

    const { data: prefs, error: prefsErr } = await q;
    if (prefsErr) throw prefsErr;

    const ergebnisse: any[] = [];

    for (const p of prefs || []) {
      const name = (p as any).service_providers?.name || p.user_name;
      const adresse = (p.email_address || '').trim();

      // Dienstleister inaktiv mit "Keine Nachrichten" (NEU 09.11.2026, SQL 69)
      if (istGesperrt((p as any).service_providers, 'keine_nachrichten')) {
        ergebnisse.push({ an: name, uebersprungen: 'Dienstleister ist inaktiv (keine Nachrichten)' });
        continue;
      }
      if (!adresse) {
        ergebnisse.push({ an: name, uebersprungen: 'keine E-Mail-Adresse hinterlegt' });
        continue;
      }
      if (!test && !ignoreHour && stunde !== p.email_reminder_hour) {
        continue; // nicht seine Stunde — der Normalfall, kein Eintrag
      }

      const tage = p.email_reminder_days_before ?? 1;
      const zieltag = plusTage(heute, tage);

      // 2. Reinigungen am Zieltag
      const { data: tasks, error: tErr } = await supabase
        .from('service_tasks')
        .select(`
          id, booking_id, scheduled_date, scheduled_time, status, notes,
          houses!service_tasks_house_id_fkey(name),
          bookings!service_tasks_booking_id_fkey(check_in, check_out, number_of_guests, status, guests!bookings_guest_id_fkey(name))
        `)
        .eq('service_type', 'cleaning')
        .eq('provider_id', p.provider_id)
        .eq('scheduled_date', zieltag)
        .order('scheduled_time');
      if (tErr) throw tErr;

      const offen = (tasks || []).filter((t: any) =>
        !ERLEDIGT.includes(t.status) && !(t.booking_id && t.bookings?.status === 'cancelled'));

      // Schon erinnert? (Testmail ignoriert das Protokoll)
      let neu = offen;
      if (!test && offen.length > 0) {
        const { data: log } = await supabase
          .from('reinigung_erinnerung_log')
          .select('service_task_id')
          .eq('scheduled_date', zieltag)
          .in('service_task_id', offen.map((t: any) => t.id));
        const schon = new Set((log || []).map((l: any) => l.service_task_id));
        neu = offen.filter((t: any) => !schon.has(t.id));
      }

      if (neu.length === 0 && !test) {
        ergebnisse.push({ an: name, zieltag, nichts_zu_erinnern: true });
        continue;
      }

      // 3. Mail bauen
      const zeilen: string[] = [];
      for (const t of neu as any[]) {
        const haus = t.houses?.name || 'Haus';
        const zeit = t.scheduled_time ? ` um ${String(t.scheduled_time).slice(0, 5)} Uhr` : '';
        zeilen.push(`🧹 ${haus}${zeit}`);

        if (t.booking_id && t.bookings) {
          const b = t.bookings;
          const gast = b.guests?.name || 'Gast';
          const personen = b.number_of_guests ? `, ${b.number_of_guests} Gäste` : '';
          zeilen.push(`   Anreise: ${gast}${personen}, ${datumBerlin(b.check_in)} ab ${uhrBerlin(b.check_in)} Uhr`);

          const { data: linen } = await supabase
            .from('linen_orders')
            .select('status, delivery_date')
            .eq('booking_id', t.booking_id)
            .order('delivery_date', { ascending: true });
          if (linen && linen.length > 0) {
            const geliefert = linen.find((l: any) => l.status === 'delivered');
            if (geliefert) zeilen.push('   Wäsche: ist geliefert');
            else if (linen[0]?.delivery_date) zeilen.push(`   Wäsche: Lieferung am ${datumBerlin(linen[0].delivery_date)}`);
            else zeilen.push('   Wäsche: bestellt, Liefertermin noch offen');
          }
        } else if (t.notes) {
          zeilen.push(`   ${String(t.notes).trim()}`);
        }
        zeilen.push('');
      }

      const anzahl = neu.length;
      const betreffHaus = anzahl === 1 ? ` – ${(neu[0] as any).houses?.name || ''}` : ` – ${anzahl} Reinigungen`;
      const betreff = `${test ? 'TEST: ' : ''}Erinnerung: Reinigung ${tagWort(tage)}${betreffHaus}`;

      let text = `Hallo ${name},\n\n`;
      if (test) {
        text += 'das ist eine Test-Mail. So sieht deine Erinnerung aus.\n\n';
      }
      if (anzahl === 0) {
        text += `Für ${datumLang(zieltag)} ist bei dir aktuell keine Reinigung eingetragen.\n\n`;
      } else {
        text += `${tagWort(tage) === 'heute' ? 'Heute' : 'Am ' + datumLang(zieltag)} ${anzahl === 1 ? 'steht diese Reinigung' : 'stehen diese Reinigungen'} an:\n\n`;
        text += zeilen.join('\n');
      }
      if (p.portal_url) text += `Alle Details im Portal: ${p.portal_url}\n\n`;
      text += 'Viele Grüße\nMax – Steinbock Chalets\n\n';
      text += '— Diese Erinnerung kannst du im Portal unter Benachrichtigungen ändern oder abschalten.';

      if (dryRun && !test) {
        ergebnisse.push({ wuerde_senden_an: name, zieltag, anzahl, betreff, text });
        continue;
      }

      // 4. Senden
      const { data: mailRes, error: mailErr } = await supabase.functions.invoke('send-guest-email', {
        body: {
          recipients: [{ email: adresse, guestName: name }],
          subjectTemplate: betreff,
          bodyTemplate: text,
        },
      });
      if (mailErr || (mailRes && mailRes.sent !== 1)) {
        const grund = mailErr ? String(mailErr) : JSON.stringify(mailRes?.failed ?? mailRes);
        console.error(`❌ Mail an ${name} fehlgeschlagen: ${grund}`);
        ergebnisse.push({ an: name, fehler: grund });
        continue;
      }

      if (!test) {
        const { error: logErr } = await supabase.from('reinigung_erinnerung_log').insert(
          (neu as any[]).map((t) => ({
            service_task_id: t.id,
            scheduled_date: zieltag,
            provider_id: p.provider_id,
            empfaenger: adresse,
          })),
        );
        if (logErr) console.error('⚠️ Versandprotokoll fehlgeschlagen:', logErr);
      }

      console.log(`✉️ Erinnerung an ${name} gesendet (${anzahl} Reinigung(en), Zieltag ${zieltag}, test=${test}).`);
      ergebnisse.push({ gesendet_an: name, zieltag, anzahl, test });
    }

    return json({
      success: true,
      modus: test ? 'Testmail' : dryRun ? 'TESTLAUF (nichts gesendet)' : 'echt',
      heute,
      stunde,
      ergebnisse,
    });
  } catch (error) {
    console.error('❌ [reinigung-erinnerung] Fehler:', error);
    return json({ success: false, error: String(error) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
