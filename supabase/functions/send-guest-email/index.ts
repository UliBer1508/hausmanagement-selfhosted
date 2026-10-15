import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

interface Recipient {
  email: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  houseName?: string;
}

function replacePlaceholders(text: string, data: Recipient): string {
  return text
    .replace(/\{guestName\}/gi, data.guestName ?? 'Gast')
    .replace(/\{guest_name\}/gi, data.guestName ?? 'Gast')
    .replace(/\{checkIn\}/gi, data.checkIn ?? '')
    .replace(/\{check_in\}/gi, data.checkIn ?? '')
    .replace(/\{checkOut\}/gi, data.checkOut ?? '')
    .replace(/\{check_out\}/gi, data.checkOut ?? '')
    .replace(/\{houseName\}/gi, data.houseName ?? '')
    .replace(/\{house_name\}/gi, data.houseName ?? '');
}

// ---------------------------------------------------------------------------
// Betreff selbst kodieren (NEU 15.10.2026)
// ---------------------------------------------------------------------------
// WARUM: denomailer 1.6.0 kodiert einen Betreff mit Umlauten/Emojis als EIN
// "=?utf-8?Q?...?="-Wort und fügt nach 74 Zeichen einen weichen Zeilenumbruch
// ("=\r\n") ein — mitten in die Kopfzeile, ohne Einrückung. Für das Mailprogramm
// enden die Kopfzeilen dort; alles danach (Rest des Betreffs, MIME-Grenzen,
// Text, HTML) erscheint als roher Mailtext. Belegt am 15.10.2026: Die
// Kalender-Abgleich-Mail kam in Hotmail als "g =c2=b7 1 neue =c3=84nderung ..."
// mit sichtbaren Content-Type-Zeilen an.
// Quelle: denomailer config/mail/encoding.ts (quotedPrintableEncode, 74er-Umbruch)
// und client/basic/client.ts (writeCmd("Subject: ", subject)).
//
// LÖSUNG: Betreff nach RFC 2047 in mehrere kurze Base64-Wörter zerlegen
// (je ≤ 45 Byte UTF-8, nie mitten in einem Zeichen). Das Ergebnis ist reines
// ASCII ohne Zeilenumbruch. Das führende Leerzeichen ist Absicht: denomailer
// kodiert jeden Betreff, der mit "=?" BEGINNT, ein zweites Mal — mit dem
// Leerzeichen davor reicht es ihn unverändert durch. Mailprogramme ignorieren
// Leerraum vor und zwischen kodierten Wörtern.
// Reine ASCII-Betreffs bleiben unverändert.
function kodiereBetreff(betreff: string): string {
  // deno-lint-ignore no-control-regex
  if (!/[^\u0000-\u007f]/.test(betreff)) return betreff;
  const enc = new TextEncoder();
  const stuecke: string[] = [];
  let stueck = '';
  for (const zeichen of Array.from(betreff)) {
    if (stueck && enc.encode(stueck + zeichen).length > 45) {
      stuecke.push(stueck);
      stueck = zeichen;
    } else {
      stueck += zeichen;
    }
  }
  if (stueck) stuecke.push(stueck);
  const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)));
  return ' ' + stuecke.map((s) => `=?UTF-8?B?${b64(s)}?=`).join(' ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // htmlTemplate ist OPTIONAL (ergänzt 22.09.2026 für die hervorgehobene
    // Kalender-Abgleich-Mail). Ohne htmlTemplate verhält sich die Funktion
    // exakt wie bisher: reine Textmail. Mit htmlTemplate geht eine
    // multipart-Mail raus (Text als Fallback, HTML für die Darstellung).
    const { recipients, subjectTemplate, bodyTemplate, htmlTemplate } = await req.json();

    if (!Array.isArray(recipients) || recipients.length === 0 || !subjectTemplate || !bodyTemplate) {
      return new Response(
        JSON.stringify({ error: 'recipients, subjectTemplate and bodyTemplate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const GMAIL_USER = Deno.env.get('GMAIL_USER');
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Gmail SMTP not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    let sent = 0;
    const failed: Array<{ email: string; error: string }> = [];

    for (const r of recipients as Recipient[]) {
      try {
        const personalizedSubject = replacePlaceholders(subjectTemplate, r);
        const personalizedBody = replacePlaceholders(bodyTemplate, r);
        const personalizedHtml = typeof htmlTemplate === 'string' && htmlTemplate
          ? replacePlaceholders(htmlTemplate, r)
          : undefined;
        await client.send({
          from: GMAIL_USER,
          to: r.email,
          subject: kodiereBetreff(personalizedSubject),
          content: personalizedBody,
          ...(personalizedHtml ? { html: personalizedHtml } : {}),
        });
        sent++;
      } catch (e) {
        failed.push({ email: r.email, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await client.close();

    return new Response(
      JSON.stringify({ sent, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});