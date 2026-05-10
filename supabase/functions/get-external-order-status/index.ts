// Internal proxy: fetches Wäsche-Oberpinzgau portal order status via REST endpoint.
// Keeps the partner token server-side so the browser never sees it.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PORTAL_URL = 'https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-status';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get('OBERPINZGAU_PARTNER_TOKEN');
  if (!token) return json({ error: 'OBERPINZGAU_PARTNER_TOKEN not configured' }, 500);

  let body: { bestellnummer?: string; bestellnummern?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const params = new URLSearchParams();
  if (body.bestellnummer) {
    params.set('bestellnummer', body.bestellnummer);
  } else if (body.bestellnummern && body.bestellnummern.length) {
    params.set('bestellnummern', body.bestellnummern.slice(0, 100).join(','));
  } else {
    return json({ error: 'bestellnummer or bestellnummern required' }, 400);
  }

  try {
    const res = await fetch(`${PORTAL_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: data?.error || 'Portal request failed', status: res.status }, res.status);
    return json(data);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});