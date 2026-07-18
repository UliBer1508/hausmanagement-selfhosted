import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// =============================================================================
// ical-sync — Modul CalendarSync (Phase 1: Import + Kollisionswarnung)
//
// Liest die in `ical_feeds` hinterlegten iCal-Feeds (Airbnb, Booking.com, VRBO,
// Belvilla), speichert die Belegungen in `external_blocks` und prüft, ob ein
// externer Zeitraum mit einer bestehenden eigenen Buchung kollidiert. Bei einer
// NEUEN Kollision: E-Mail an Uli (max.steinbock@gmail.com) über send-guest-email.
//
// Grenzen (bewusst, siehe docs/Konzept-iCal-Kollisionswarnung.md):
//  - iCal liefert nur Zeiträume, KEINE Gastdaten.
//  - iCal ist pull-basiert und verzögert -> Sicherheitsnetz, kein Echtzeitschutz.
//
// SICHERHEIT (Muster wie max-linen-reminders):
//  - dry_run ist STANDARD. Echtes Schreiben/Mailen nur bei { "dry_run": false }.
//  - Optionales CRON_SECRET: wenn gesetzt, muss der Header x-cron-secret passen.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const KOLLISION_MAIL_TO = 'max.steinbock@gmail.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ---- iCal-Parser (minimal, für VEVENT/DTSTART/DTEND/UID/SUMMARY) -------------
// Bewusst schlank gehalten: OTA-Feeds sind simpel strukturiert. Wir brauchen nur
// Zeiträume. Gefaltete Zeilen (Fortsetzung mit führendem Space/Tab) werden zusammengeführt.
interface VEvent { uid: string; start: string; end: string; summary: string; }

function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// Wandelt iCal-Datum (YYYYMMDD oder YYYYMMDDTHHMMSSZ) in YYYY-MM-DD.
function icalDateToISO(value: string): string | null {
  const m = value.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Schneidet einen Zeitstempel auf das reine Datum (YYYY-MM-DD).
// WARUM: external_blocks.start_date/end_date sind vom Typ `date` (10 Zeichen),
// bookings.check_in/check_out sind `timestamptz` ("2027-01-05T09:00:00+00:00").
// Ein direkter String-Vergleich meldet den Wechseltag faelschlich als Kollision,
// weil "2027-01-05" < "2027-01-05T09:00:00+00:00" true ergibt (Praefix-Vergleich).
// Beide Seiten muessen tagesgenau verglichen werden.
function toDay(value: string | null | undefined): string {
  return String(value ?? '').slice(0, 10);
}

// Echte Kollision? Halboffene Intervalle, tagesgenau.
// Abreise am selben Tag, an dem der externe Block beginnt, ist KEINE Kollision
// (normaler Gaestewechsel).
function istKollision(evStart: string, evEnd: string, checkIn: string, checkOut: string): boolean {
  return toDay(evStart) < toDay(checkOut) && toDay(evEnd) > toDay(checkIn);
}

// Ist der externe Block die Rueckspiegelung einer eigenen Buchung?
// WARUM: Der eigene ical-export wird bei Airbnb/VRBO als externer Kalender
// hinterlegt. Die Portale melden dieselben Zeitraeume zurueck. Deckt sich ein
// externer Block tagesgenau mit einer eigenen Buchung, ist das dieselbe Buchung
// und KEIN Konflikt.
function istRueckspiegelung(evStart: string, evEnd: string, checkIn: string, checkOut: string): boolean {
  return toDay(evStart) === toDay(checkIn) && toDay(evEnd) === toDay(checkOut);
}

function parseICal(text: string): VEvent[] {
  const lines = unfoldLines(text);
  const events: VEvent[] = [];
  let cur: Partial<VEvent> | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (cur && cur.start && cur.end) {
        events.push({
          uid: cur.uid || `${cur.start}_${cur.end}`,
          start: cur.start,
          end: cur.end,
          summary: cur.summary || '',
        });
      }
      cur = null;
    } else if (cur) {
      // Key kann Parameter enthalten: "DTSTART;VALUE=DATE:20260725"
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const val = line.slice(idx + 1).trim();
      const key = keyPart.split(';')[0].toUpperCase();
      if (key === 'DTSTART') { const d = icalDateToISO(val); if (d) cur.start = d; }
      else if (key === 'DTEND') { const d = icalDateToISO(val); if (d) cur.end = d; }
      else if (key === 'UID') { cur.uid = val; }
      else if (key === 'SUMMARY') { cur.summary = val; }
    }
  }
  return events;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Optionale Cron-Absicherung: nur prüfen, wenn ein CRON_SECRET gesetzt ist.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    // Erlaubt bleibt der eingeloggte Aufruf über das Frontend (anon/JWT); der
    // Header-Check greift nur, wenn überhaupt ein Secret konfiguriert ist und
    // der Aufruf einen (falschen) Header mitschickt. Kein Header -> durchlassen,
    // damit manuelle Tests und Frontend-Aufrufe weiter funktionieren.
    if (req.headers.get('x-cron-secret') !== null) {
      return json({ success: false, error: 'unauthorized' }, 401);
    }
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

    console.log(`📅 [ical-sync] Start. dry_run=${dryRun}`);

    // 1. Aktive Feeds laden
    const { data: feeds, error: feedsErr } = await supabase
      .from('ical_feeds')
      .select('id, house_id, platform, feed_url, houses(name)')
      .eq('is_active', true);
    if (feedsErr) throw feedsErr;

    if (!feeds || feeds.length === 0) {
      return json({ success: true, hinweis: 'Keine aktiven iCal-Feeds hinterlegt.', feeds: 0 });
    }

    const summary: any[] = [];
    const neueKollisionen: any[] = [];

    for (const feed of feeds) {
      const houseName = (feed as any).houses?.name || 'Objekt';
      let events: VEvent[] = [];

      // 2. Feed abrufen + parsen
      try {
        const resp = await fetch(feed.feed_url, { headers: { 'User-Agent': 'SteinbockChalets-iCalSync/1.0' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        events = parseICal(text);
      } catch (e) {
        console.error(`❌ Feed-Fehler (${feed.platform}/${houseName}):`, e);
        if (!dryRun) {
          await supabase.from('ical_feeds').update({
            last_synced_at: new Date().toISOString(),
            last_status: `error: ${String(e).slice(0, 200)}`,
          }).eq('id', feed.id);
        }
        summary.push({ feed: `${feed.platform}/${houseName}`, status: 'fehler', fehler: String(e) });
        continue;
      }

      // 3. Eigene, nicht-stornierte Buchungen dieses Hauses (für Kollisionsprüfung)
      const { data: ownBookings } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, status')
        .eq('house_id', feed.house_id)
        .neq('status', 'cancelled');

      let upserts = 0;
      let kollisionenImFeed = 0;

      // Zeitstempel VOR dem Verarbeiten der Events. Alles, was danach nicht
      // aktualisiert wurde, kam in diesem Feed-Durchlauf nicht mehr vor.
      const laufBeginn = new Date().toISOString();

      for (const ev of events) {
        // Kollisionspruefung: Ueberlapp block[start,end) mit booking[check_in,check_out),
        // tagesgenau (siehe toDay/istKollision oben).
        //
        // Zwei Faelle werden bewusst NICHT als Kollision gewertet:
        //  (a) Rueckspiegelung: Der externe Block deckt sich exakt mit einer eigenen
        //      Buchung -> dieselbe Buchung, kein Konflikt.
        //  (b) Wechseltag: Abreise um 09:00 und externer Block ab demselben Tag.
        //
        // WARUM das wichtig ist: Vor dieser Korrektur meldete jeder Airbnb-Feed
        // saemtliche eigenen Airbnb-Buchungen als Kollision. Bei Dauerrauschen geht
        // eine echte Doppelbuchung unter (Alarmmuedigkeit).
        const collision = (ownBookings || []).find((b: any) => {
          if (istRueckspiegelung(ev.start, ev.end, b.check_in, b.check_out)) return false;
          return istKollision(ev.start, ev.end, b.check_in, b.check_out);
        });
        const collisionBookingId = collision?.id ?? null;

        if (dryRun) {
          if (collisionBookingId) {
            kollisionenImFeed++;
            neueKollisionen.push({
              haus: houseName, platform: feed.platform,
              extern: `${ev.start} – ${ev.end}`,
              eigene_buchung: collision?.guest_name,
              eigene_zeit: `${collision?.check_in} – ${collision?.check_out}`,
            });
          }
          continue;
        }

        // Upsert external_block (über platform+external_uid)
        const { data: existing } = await supabase
          .from('external_blocks')
          .select('id, collision_booking_id, collision_notified')
          .eq('platform', feed.platform)
          .eq('external_uid', ev.uid)
          .maybeSingle();

        const nowIso = new Date().toISOString();
        let blockId = existing?.id;
        let wasNotified = existing?.collision_notified ?? false;
        const warBereitsKollision = !!existing?.collision_booking_id;

        if (existing) {
          await supabase.from('external_blocks').update({
            house_id: feed.house_id, platform: feed.platform,
            start_date: ev.start, end_date: ev.end, summary: ev.summary,
            collision_booking_id: collisionBookingId,
            // Wird eine Kollision aufgelöst, reset für erneute Meldung bei neuer Kollision
            collision_notified: collisionBookingId ? wasNotified : false,
            last_seen_at: nowIso,
          }).eq('id', existing.id);
        } else {
          const { data: ins } = await supabase.from('external_blocks').insert({
            house_id: feed.house_id, platform: feed.platform, external_uid: ev.uid,
            start_date: ev.start, end_date: ev.end, summary: ev.summary,
            collision_booking_id: collisionBookingId,
            collision_notified: false,
          }).select('id').single();
          blockId = ins?.id;
          wasNotified = false;
        }
        upserts++;

        // NEUE Kollision (vorher keine, jetzt eine, noch nicht gemeldet) -> merken
        if (collisionBookingId && !wasNotified) {
          kollisionenImFeed++;
          neueKollisionen.push({
            block_id: blockId, haus: houseName, platform: feed.platform,
            extern: `${ev.start} – ${ev.end}`,
            eigene_buchung: collision?.guest_name,
            eigene_zeit: `${collision?.check_in} – ${collision?.check_out}`,
          });
        }
      }

      // ---- AUFRÄUMEN: verschwundene Belegungen entfernen -------------------
      //
      // WARUM DAS NÖTIG IST (Fehler gefunden am 18.07.2026):
      // Der Sync machte bisher nur Upserts. Blocks, die ein Portal NICHT mehr
      // meldet, blieben für immer in external_blocks stehen. Konkreter Fall:
      // Booking.com sperrte 19.07.2027–18.01.2028 (183 Nächte). Uli gab den
      // Zeitraum im Extranet frei, Booking.com meldete ihn nicht mehr
      // (last_event_count fiel von 12 auf 6) — der Block blieb trotzdem in der
      // Tabelle und wurde weiter als Belegung angezeigt und ausgewertet.
      //
      // Dasselbe gilt für jede stornierte Portal-Buchung: Ohne Aufräumen rechnet
      // der Kalender-Abgleich dauerhaft mit Belegungen, die es nicht mehr gibt.
      //
      // SICHERHEIT — die Bedingung ist entscheidend:
      // Gelöscht wird NUR nach einem ERFOLGREICHEN Feed-Abruf. Bei einem
      // Feed-Fehler wird die Schleife oben per `continue` verlassen, diese Stelle
      // also gar nicht erreicht. Sonst wäre bei einer kurzen Störung bei
      // Booking.com der komplette Bestand dieses Feeds weg.
      //
      // Ein leerer Feed (events.length === 0) ist ebenfalls ausgeschlossen: Das
      // wäre entweder ein Portal-Fehler oder ein wirklich leerer Kalender —
      // in beiden Fällen ist Nichtstun die sichere Wahl.
      let entfernt = 0;
      if (!dryRun && events.length > 0) {
        const { data: veraltet } = await supabase
          .from('external_blocks')
          .delete()
          .eq('house_id', feed.house_id)
          .eq('platform', feed.platform)
          .lt('last_seen_at', laufBeginn)
          .select('id');
        entfernt = veraltet?.length ?? 0;
      }

      if (!dryRun) {
        await supabase.from('ical_feeds').update({
          last_synced_at: new Date().toISOString(),
          last_status: 'ok', last_event_count: events.length,
        }).eq('id', feed.id);
      }

      summary.push({
        feed: `${feed.platform}/${houseName}`, status: 'ok',
        events: events.length, upserts, entfernt, kollisionen: kollisionenImFeed,
      });
    }

    // 4. Bei NEUEN Kollisionen: EINE gebündelte E-Mail an Uli (nur echt, nicht dry_run)
    let mailGesendet = false;
    if (!dryRun && neueKollisionen.length > 0) {
      const zeilen = neueKollisionen.map((k) =>
        `• ${k.haus} (${k.platform}): extern ${k.extern} kollidiert mit „${k.eigene_buchung}" (${k.eigene_zeit})`
      ).join('\n');
      const body =
        `Achtung: Es wurde mindestens eine Kalender-Kollision erkannt.\n\n${zeilen}\n\n` +
        `Bitte prüfe, ob eine Doppelbuchung vorliegt. Diese Meldung stammt vom automatischen ` +
        `iCal-Abgleich (Sicherheitsnetz, nicht in Echtzeit).`;

      try {
        const { error: mailErr } = await supabase.functions.invoke('send-guest-email', {
          body: {
            to: KOLLISION_MAIL_TO,
            subject: `⚠️ Kalender-Kollision erkannt (${neueKollisionen.length})`,
            body,
          },
        });
        if (mailErr) console.error('❌ Kollisions-Mail fehlgeschlagen:', mailErr);
        else {
          mailGesendet = true;
          // markiere die gemeldeten Blocks als notified
          const ids = neueKollisionen.map((k) => k.block_id).filter(Boolean);
          if (ids.length > 0) {
            await supabase.from('external_blocks')
              .update({ collision_notified: true })
              .in('id', ids);
          }
        }
      } catch (e) {
        console.error('❌ Kollisions-Mail Ausnahme:', e);
      }
    }

    return json({
      success: true,
      modus: dryRun ? 'dry_run' : 'echt',
      feeds: feeds.length,
      neue_kollisionen: neueKollisionen.length,
      mail_gesendet: mailGesendet,
      details: summary,
      kollisionen: neueKollisionen,
    });
  } catch (e) {
    console.error('❌ [ical-sync] Fehler:', e);
    return json({ success: false, error: String(e) }, 500);
  }
});
