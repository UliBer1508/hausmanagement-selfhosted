// Edge Function: external-invoices
// Deploy in Portal-Projekt pkpnowevagxmhyqlawng (Wäsche Oberpinzgau)
// Response-Schema spiegelt laundry_invoices der Logik-App 1:1

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOWED_STATUS = ['offen', 'bezahlt', 'storniert', 'mahnung'];

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const t0 = Date.now();
  const requestId = crypto.randomUUID();

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let kundennummer: string | null = null;
  let statusCode = 200;
  let errorMsg: string | null = null;

  try {
    const auth = req.headers.get('authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      statusCode = 401;
      return json({ error: 'Missing Bearer token' }, 401);
    }
    const token = auth.slice(7).trim();
    const tokenHash = await sha256Hex(token);

    const { data: keyRow } = await supa
      .from('partner_api_keys')
      .select('kundennummer, is_active')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!keyRow || !keyRow.is_active) {
      statusCode = 401;
      return json({ error: 'Invalid or inactive token' }, 401);
    }
    kundennummer = keyRow.kundennummer;
    supa.from('partner_api_keys').update({ last_used_at: new Date().toISOString() }).eq('token_hash', tokenHash).then();

    const url = new URL(req.url);
    const since = url.searchParams.get('since');
    const status = url.searchParams.get('status');
    const rechnungsnummer = url.searchParams.get('rechnungsnummer');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);

    let q = supa
      .from('rechnungen')
      .select(`
        id, rechnungsnummer, rechnungsdatum, faelligkeitsdatum, bezahlt_am, status,
        kunde_id, kunde_kundennummer, kunde_name, kunde_strasse, kunde_plz, kunde_ort,
        nettobetrag, mwst_satz, mwst_betrag, bearbeitungsgebuehr, bruttobetrag,
        bestellung_id, updated_at,
        rechnungspositionen(bezeichnung, menge, einzelpreis, summe, bestellnummer, artikelnummer)
      `)
      .eq('kunde_kundennummer', kundennummer!)
      .order('rechnungsdatum', { ascending: false })
      .limit(limit);

    if (rechnungsnummer) q = q.eq('rechnungsnummer', rechnungsnummer);
    if (since) q = q.gte('rechnungsdatum', since);
    if (status && ALLOWED_STATUS.includes(status)) q = q.eq('status', status);

    const { data: rows, error } = await q;
    if (error) throw error;

    const rechnungen = (rows || []).map((r: any) => ({
      id: r.id,
      rechnungsnummer: r.rechnungsnummer,
      rechnungsdatum: r.rechnungsdatum,
      faelligkeitsdatum: r.faelligkeitsdatum,
      bezahlt_am: r.bezahlt_am,
      status: ALLOWED_STATUS.includes(r.status) ? r.status : 'offen',
      kunde_id: r.kunde_id,
      kunde_kundennummer: r.kunde_kundennummer,
      kunde_name: r.kunde_name,
      kunde_strasse: r.kunde_strasse,
      kunde_plz: r.kunde_plz,
      kunde_ort: r.kunde_ort,
      nettobetrag: Number(r.nettobetrag ?? 0),
      mwst_satz: Number(r.mwst_satz ?? 0),
      mwst_betrag: Number(r.mwst_betrag ?? 0),
      bearbeitungsgebuehr: Number(r.bearbeitungsgebuehr ?? 0),
      bruttobetrag: Number(r.bruttobetrag ?? 0),
      waehrung: 'EUR',
      bestellung_id: r.bestellung_id ?? null,
      updated_at: r.updated_at,
      pdf_url: null, // TODO: createSignedUrl, sobald PDFs im Storage liegen
      positionen: r.rechnungspositionen || [],
    }));

    return json({ rechnungen, count: rechnungen.length });
  } catch (e: any) {
    statusCode = 500;
    errorMsg = e?.message || String(e);
    return json({ error: errorMsg }, 500);
  } finally {
    supa
      .from('partner_api_log')
      .insert({
        endpoint: 'external-invoices',
        kundennummer,
        status_code: statusCode,
        latency_ms: Date.now() - t0,
        request_id: requestId,
        query: Object.fromEntries(new URL(req.url).searchParams),
        error: errorMsg,
      })
      .then();
  }
});
