// Sync linen order to Oberpinzgau Laundry Hub via REST endpoint
// Spec: POST https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const REST_URL = 'https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-import';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return String(iso).split('T')[0];
}

function validateGuests(v: unknown): number {
  const n = Number(v);
  if (isNaN(n) || n < 1 || n > 50) return 1;
  return Math.floor(n);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const BEARER = Deno.env.get('EXTERNAL_LAUNDRY_BEARER_TOKEN');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let linenOrderId = '';

  try {
    if (!BEARER) throw new Error('EXTERNAL_LAUNDRY_BEARER_TOKEN ist nicht konfiguriert');

    const body = await req.json();
    linenOrderId = body?.linen_order_id;
    if (!linenOrderId) throw new Error('linen_order_id fehlt');

    // Settings
    const { data: settings } = await supabase
      .from('linen_automation_settings')
      .select('external_sync_enabled, external_kundennummer, sync_max_retries, external_lieferzeit, external_abholzeit')
      .maybeSingle();

    if (!settings?.external_sync_enabled) throw new Error('Externe Synchronisation ist deaktiviert');
    const kundennummer = settings.external_kundennummer || 'K470214';
    const maxRetries = settings.sync_max_retries ?? 3;
    const lieferzeit = settings.external_lieferzeit || '08:00';
    const abholzeit = settings.external_abholzeit || '10:00';

    // Order + relations
    const { data: order, error: orderErr } = await supabase
      .from('linen_orders')
      .select(`*, houses!linen_orders_house_id_fkey(id,name,external_objektnummer), bookings!linen_orders_booking_id_fkey(id,guest_name,check_in,check_out,number_of_guests)`)
      .eq('id', linenOrderId)
      .single();
    if (orderErr || !order) throw new Error('Bestellung nicht gefunden');

    if (order.status !== 'ausstehend') throw new Error('Nur Bestellungen mit Status "ausstehend" können synchronisiert werden');
    if (order.external_bestellnummer) throw new Error('Bestellung wurde bereits synchronisiert');

    const objektnummer = order.houses?.external_objektnummer;
    if (!objektnummer) throw new Error('Keine externe Objektnummer für dieses Haus konfiguriert');

    // Article mapping
    const { data: mappings } = await supabase
      .from('external_article_mapping')
      .select('internal_item_key, external_artikelnummer')
      .eq('is_active', true);
    const map: Record<string, string> = {};
    (mappings || []).forEach((m: any) => { map[m.internal_item_key] = m.external_artikelnummer; });

    const items = (order.items || {}) as Record<string, number>;
    const variants = (order.item_variants || null) as Record<string, string> | null;
    const positionen: Array<{ artikelnummer: string; menge: number; notizen?: string }> = [];
    for (const [key, qty] of Object.entries(items)) {
      if (!qty || qty <= 0) continue;
      const color = variants?.[key];
      const ext = (color && map[`${key}__${color}`]) || map[key];
      if (!ext) continue;
      positionen.push({ artikelnummer: ext, menge: qty });
    }
    if (positionen.length === 0) throw new Error('Keine Artikel konnten gemappt werden');

    const booking = Array.isArray(order.bookings) ? order.bookings[0] : order.bookings;

    const payload = {
      kundennummer,
      objektnummer,
      gastname: booking?.guest_name || 'Unbekannt',
      check_in: formatDateOnly(booking?.check_in),
      check_out: formatDateOnly(booking?.check_out),
      anzahl_personen: validateGuests(booking?.number_of_guests),
      lieferdatum: formatDateOnly(order.delivery_date),
      abholdatum: formatDateOnly(booking?.check_out),
      lieferzeit,
      abholzeit,
      notizen: order.notes || null,
      prioritaet: 0,
      positionen,
    };

    // POST with retry
    let attempt = 0;
    let lastStatus = 0;
    let lastBody: any = null;
    let lastErr = '';
    const backoff = [2000, 8000, 30000];

    while (attempt < maxRetries) {
      attempt++;
      try {
        const resp = await fetch(REST_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BEARER}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        lastStatus = resp.status;
        const text = await resp.text();
        try { lastBody = JSON.parse(text); } catch { lastBody = { raw: text }; }

        if (resp.ok) {
          const bestellnummer = lastBody?.bestellnummer || lastBody?.data?.bestellnummer || null;
          // success
          await supabase.from('linen_sync_log').insert({
            linen_order_id: linenOrderId,
            transport: 'rest',
            attempt,
            request_payload: payload,
            response_status: lastStatus,
            response_body: lastBody,
            success: true,
          });
          await supabase.from('linen_orders').update({
            external_bestellnummer: bestellnummer,
            external_synced_at: new Date().toISOString(),
          }).eq('id', linenOrderId);

          return new Response(JSON.stringify({ success: true, bestellnummer, attempt }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 4xx → no retry
        if (resp.status >= 400 && resp.status < 500) {
          lastErr = lastBody?.message || lastBody?.error || `HTTP ${resp.status}`;
          break;
        }
        // 5xx → retry
        lastErr = `HTTP ${resp.status}`;
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }

      // log failed attempt
      await supabase.from('linen_sync_log').insert({
        linen_order_id: linenOrderId,
        transport: 'rest',
        attempt,
        request_payload: payload,
        response_status: lastStatus || null,
        response_body: lastBody,
        error_message: lastErr,
        success: false,
      });

      if (attempt < maxRetries && (lastStatus === 0 || lastStatus >= 500)) {
        await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)]);
        continue;
      }
      break;
    }

    return new Response(JSON.stringify({ success: false, error: lastErr, status: lastStatus, body: lastBody, attempts: attempt }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('sync-linen-order-rest error:', e);
    if (linenOrderId) {
      await supabase.from('linen_sync_log').insert({
        linen_order_id: linenOrderId,
        transport: 'rest',
        attempt: 0,
        error_message: e?.message || String(e),
        success: false,
      });
    }
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});