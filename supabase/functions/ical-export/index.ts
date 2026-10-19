import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// =============================================================================
// ical-export — Modul CalendarSync, Phase 2
//
// Stellt pro Ferienhaus einen OEFFENTLICHEN iCal-Feed bereit, den Uli bei
// Airbnb / VRBO / Belvilla als "anderen Kalender" eintraegt. Damit kennen die
// Portale die DIREKTBUCHUNGEN und die SPERRZEITEN aus dem eigenen System und
// blocken diese Termine.
//
// AUFRUF (Token in der URL, Endung .ics — beides Pflicht):
//   .../functions/v1/ical-export/<TOKEN>.ics
//   (alternativ: .../functions/v1/ical-export?token=<TOKEN>&format=.ics)
//
// ────────────────────────────────────────────────────────────────────────────
// HARTE REGELN aus der Plattform-Recherche (17.07.2026) — NICHT aendern:
//
// 1. NUR DIREKTBUCHUNGEN (platform = 'direct' bzw. leer) ausgeben.
//    NIEMALS die per Phase 1 reimportierten Fremd-Blocks — sonst entsteht eine
//    Update-Endlosschleife zwischen den Portalen.
//
// 2. NUR GANZTAGES-EINTRAEGE: DTSTART;VALUE=DATE:20260725 — niemals mit Uhrzeit
//    (T000000). Airbnb lehnt seit 04/2025 zeitbehaftete Eintraege ab
//    ("This iCal URL is invalid").
//
// 3. CRLF-Zeilenenden (\r\n) und vollstaendiger RFC-5545-Rumpf
//    (VERSION, PRODID, UID, DTSTAMP), sonst schlaegt die Validierung fehl.
//
// 4. NICHT LEER: Ein Feed ohne zukuenftiges Event gilt bei mehreren Portalen als
//    ungueltig. Gibt es keine kommende Direktbuchung, liefern wir einen
//    PLATZHALTER-Eintrag (0 Naechte in ferner Zukunft, blockt nichts), damit
//    das Eintragen bei Airbnb & Co. gelingt.
//
// 5. KEINE GASTDATEN nach aussen: SUMMARY ist neutral ("Belegt"/"Reserved").
//    Die Portale brauchen nur den Zeitraum; Namen gehen sie nichts an (DSGVO).
//
// 6. EIGENE SPERRZEITEN (NEU 19.10.2026, SQL 66): Zeiträume aus der Tabelle
//    `sperrzeiten` gehen ebenfalls als "Belegt" hinaus. Das sind eigene Daten
//    (Uli legt sie in der Hausverwaltung an), Regel 1 bleibt also gewahrt.
//    Die Portale zeigen einen importierten Eintrag als "nicht verfügbar" —
//    es entsteht dort KEINE Buchung. Grund und Notiz gehen nicht hinaus
//    (Regel 5). letzter_tag ist die letzte gesperrte Nacht (einschließlich),
//    DTEND ist exklusiv → DTEND = letzter_tag + 1.
//
// Booking.com akzeptiert seit 03/2025 KEINE Feeds von privaten Seiten mehr —
// dort funktioniert nur die Import-Richtung (Phase 1). Das ist deren Politik,
// kein Fehler dieser Funktion.
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// iCal verlangt CRLF als Zeilenende (RFC 5545).
const CRLF = '\r\n';

// YYYY-MM-DD -> YYYYMMDD (Ganztages-Format, ohne Uhrzeit)
const toICalDate = (d: string): string => String(d).split('T')[0].replace(/-/g, '');

// Folgetag als iCal-Datum: YYYY-MM-DD -> YYYYMMDD des naechsten Tages.
// Rechnung in UTC, damit keine Zeitzone den Tag verschiebt.
const naechsterTagICal = (d: string): string => {
  const t = new Date(String(d).split('T')[0] + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10).replace(/-/g, '');
};

// Zeitstempel fuer DTSTAMP: YYYYMMDDTHHMMSSZ (hier ist Uhrzeit korrekt und Pflicht)
const nowStamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

// Text fuer iCal escapen (Komma, Semikolon, Backslash, Zeilenumbruch)
const esc = (s: string): string =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Lange Zeilen nach 75 Oktetten falten (RFC 5545). Fortsetzung beginnt mit Space.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join(CRLF);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Token entweder aus dem Pfad (…/ical-export/<TOKEN>.ics) oder aus ?token=
    let token = url.searchParams.get('token') || '';
    if (!token) {
      const last = url.pathname.split('/').filter(Boolean).pop() || '';
      token = last.replace(/\.ics$/i, '');
      if (token === 'ical-export') token = '';
    }

    if (!token || token.length < 16) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Haus ueber das Token finden
    const { data: house, error: houseErr } = await supabase
      .from('houses')
      .select('id, name, ical_export_token')
      .eq('ical_export_token', token)
      .maybeSingle();

    if (houseErr) throw houseErr;
    // Bewusst 404 (nicht 401): ein falsches Token soll nichts ueber die Existenz verraten.
    if (!house) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    // NUR Direktbuchungen dieses Hauses, nicht storniert, ab heute.
    // (Fremd-Blocks aus external_blocks werden BEWUSST NICHT ausgegeben — Regel 1.)
    const heute = new Date().toISOString().split('T')[0];
    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('id, check_in, check_out, platform, status')
      .eq('house_id', house.id)
      .neq('status', 'cancelled')
      .gte('check_out', heute)
      .order('check_in', { ascending: true });

    if (bookErr) throw bookErr;

    // Eigene Sperrzeiten dieses Hauses, ab heute (Regel 6).
    // Ein Ladefehler wird NICHT verschluckt: Ein Feed ohne die Sperren sähe
    // für die Portale aus wie "frei" und gäbe den Zeitraum zum Verkauf frei.
    const { data: sperren, error: sperrErr } = await supabase
      .from('sperrzeiten')
      .select('id, erster_tag, letzter_tag')
      .eq('house_id', house.id)
      .gte('letzter_tag', heute)
      .order('erster_tag', { ascending: true });

    if (sperrErr) throw sperrErr;

    // Was zählt als Direktbuchung?
    //
    //   null / ''  -> "Keine Angabe" im Formular (CreateBookingForm speichert
    //                 bei platform='none' den Wert null)
    //   'direct'   -> ausdrücklich als Direktbuchung angelegt
    //   'website'  -> aus einer Anfrage über steinbockchalets.com entstanden
    //                 (CreateBookingForm setzt das bei accept_booking_inquiry).
    //                 ERGÄNZT 19.07.2026 — fehlte bisher, dadurch wurden
    //                 Buchungen aus Website-Anfragen NICHT an die Portale
    //                 gemeldet und der Zeitraum dort nicht geblockt.
    //
    // BEWUSST NICHT dabei: 'other' und 'unknown'. Deren Herkunft ist unklar,
    // und eine Portal-Buchung im eigenen Export würde dem Portal seine eigene
    // Buchung zurückspiegeln — genau die Endlosschleife, vor der Regel 1 warnt
    // (siehe Konzept §3). Beispiel: Christian Mueller hat platform='unknown',
    // ist aber eine Booking.com-Buchung.
    //
    // Für die ERINNERUNG in der Buchungskarte gilt eine großzügigere Regel
    // (dort auch 'other'/'unknown'): Eine überflüssige Erinnerung ist harmlos,
    // ein falscher Export-Eintrag nicht.
    const DIREKT_PLATTFORMEN = ['direct', 'website'];
    const direkt = (bookings || []).filter(
      (b: any) => !b.platform || DIREKT_PLATTFORMEN.includes(b.platform)
    );

    // ---- Feed zusammenbauen -------------------------------------------------
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Steinbock Chalets//Hausverwaltung//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      foldLine(`X-WR-CALNAME:${esc(house.name)} — Direktbuchungen und Sperrzeiten`),
    ];

    const stamp = nowStamp();

    for (const b of direkt) {
      lines.push(
        'BEGIN:VEVENT',
        foldLine(`UID:booking-${b.id}@steinbockchalets`),
        `DTSTAMP:${stamp}`,
        // Regel 2: GANZTAGES-Eintrag, keine Uhrzeit
        `DTSTART;VALUE=DATE:${toICalDate(b.check_in)}`,
        `DTEND;VALUE=DATE:${toICalDate(b.check_out)}`,
        // Regel 5: keine Gastdaten nach aussen
        'SUMMARY:Belegt',
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    // Regel 6: eigene Sperrzeiten. Eigene UID-Vorsilbe, damit ein Portal
    // eine Sperre nie mit einer Buchung verwechselt oder zusammenführt.
    for (const s of sperren || []) {
      lines.push(
        'BEGIN:VEVENT',
        foldLine(`UID:sperre-${s.id}@steinbockchalets`),
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toICalDate(s.erster_tag)}`,
        `DTEND;VALUE=DATE:${naechsterTagICal(s.letzter_tag)}`,
        'SUMMARY:Belegt',
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    // Regel 4: Feed darf beim Eintragen nicht leer sein -> Platzhalter,
    // falls weder eine kommende Direktbuchung noch eine Sperrzeit existiert.
    // Der Platzhalter liegt weit in der Zukunft und dauert 0 Naechte
    // (DTSTART = DTEND), blockt also nichts.
    if (direkt.length === 0 && (sperren || []).length === 0) {
      const jahr = new Date().getFullYear() + 3;
      lines.push(
        'BEGIN:VEVENT',
        `UID:placeholder-${house.id}@steinbockchalets`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${jahr}0101`,
        `DTEND;VALUE=DATE:${jahr}0101`,
        'SUMMARY:Kalender aktiv (keine Direktbuchungen)',
        'TRANSP:TRANSPARENT',
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');

    const body = lines.join(CRLF) + CRLF;

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${house.id}.ics"`,
        // Portale fragen im Stundentakt ab — kurzes Caching ist unschaedlich.
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch (e) {
    console.error('❌ [ical-export] Fehler:', e);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});
