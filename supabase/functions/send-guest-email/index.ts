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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recipients, subjectTemplate, bodyTemplate } = await req.json();

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
        await client.send({
          from: GMAIL_USER,
          to: r.email,
          subject: personalizedSubject,
          content: personalizedBody,
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