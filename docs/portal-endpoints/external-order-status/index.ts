// Edge Function: external-order-status
// Deploy in Portal-Projekt pkpnowevagxmhyqlawng (Wäsche Oberpinzgau)
// Auth: Authorization: Bearer <PARTNER_TOKEN>  → partner_api_keys lookup

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOWED_STATUS = ['neu', 'in_bearbeitung', 'ausgeliefert', 'abgeholt', 'abgeschlossen', 'storniert'];

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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  let kundennummer: string | null = null;
  let statusCode = 200;
  let errorMsg: string | null = null;

  try {
    // ---- Auth ----
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

    // last_used_at (fire-and-forget)
    supa.from('partner_api_keys').update({ last_used_at: new Date().toISOString() }).eq('token_hash', tokenHash).then();

    // ---- Query parsing ----
    const url = new URL(req.url);
    const single = url.searchParams.get('bestellnummer');
    const batchRaw = url.searchParams.get('bestellnummern');

    if (!single && !batchRaw) {
      statusCode = 400;
      return json({ error: 'bestellnummer or bestellnummern required' }, 400);
    }

    const numbers = single
      ? [single]
      : batchRaw!.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);

    // ---- Load orders strictly scoped by kundennummer ----
    // Step 1: customer id
    const { data: kunde } = await supa
      .from('kunden')
      .select('id, kundennummer')
      .eq('kundennummer', kundennummer!)
      .maybeSingle();
    if (!kunde) {
      statusCode = 404;
      return single ? json({ error: 'Order not found' }, 404) : json({ orders: [] });
    }

    const { data: orders, error: orderErr } = await supa
      .from('waeschebestellungen')
      .select(`
        id, bestellnummer, status, gastname, check_in, check_out,
        anzahl_personen, lieferdatum, abholdatum, created_at, updated_at,
        objekte:objekt_id(objektnummer)
      `)
      .eq('kunde_id', kunde.id)
      .in('bestellnummer', numbers);

    if (orderErr) throw orderErr;

    if (!orders || orders.length === 0) {
      if (single) {
        statusCode = 404;
        return json({ error: 'Order not found' }, 404);
      }
      return json({ orders: [] });
    }

    // ---- Positionen + Server-Summe ----
    const orderIds = orders.map((o: any) => o.id);
    const { data: positionen } = await supa
      .from('bestellpositionen')
      .select('bestellung_id, menge, waescheartikel(artikelnummer, name, preis)')
      .in('bestellung_id', orderIds);

    const posByOrder = new Map<string, any[]>();
    for (const p of positionen || []) {
      const arr = posByOrder.get(p.bestellung_id) || [];
      const art: any = Array.isArray(p.waescheartikel) ? p.waescheartikel[0] : p.waescheartikel;
      const einzel = Number(art?.preis ?? 0);
      arr.push({
        artikelnummer: art?.artikelnummer ?? null,
        name: art?.name ?? null,
        menge: p.menge,
        einzelpreis: einzel,
        summe: Number((einzel * p.menge).toFixed(2)),
      });
      posByOrder.set(p.bestellung_id, arr);
    }

    const result = orders.map((o: any) => {
      const obj = Array.isArray(o.objekte) ? o.objekte[0] : o.objekte;
      const pos = posByOrder.get(o.id) || [];
      const gesamt = Number(pos.reduce((s, x) => s + x.summe, 0).toFixed(2));
      const status = ALLOWED_STATUS.includes(o.status) ? o.status : 'neu';
      return {
        bestellnummer: o.bestellnummer,
        status,
        kunde_kundennummer: kundennummer,
        objekt_objektnummer: obj?.objektnummer ?? null,
        gastname: o.gastname,
        check_in: o.check_in,
        check_out: o.check_out,
        anzahl_personen: o.anzahl_personen,
        lieferdatum: o.lieferdatum,
        abholdatum: o.abholdatum,
        erstellt_am: o.created_at,
        aktualisiert_am: o.updated_at,
        gesamt_preis: gesamt,
        waehrung: 'EUR',
        positionen: pos,
      };
    });

    return single ? json(result[0]) : json({ orders: result });
  } catch (e: any) {
    statusCode = 500;
    errorMsg = e?.message || String(e);
    return json({ error: errorMsg }, 500);
  } finally {
    supa
      .from('partner_api_log')
      .insert({
        endpoint: 'external-order-status',
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
