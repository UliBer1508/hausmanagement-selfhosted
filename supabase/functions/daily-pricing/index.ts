import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEASON = [0.75, 0.78, 0.90, 1.00, 1.10, 1.25, 1.50, 1.55, 1.20, 0.95, 0.80, 1.10];
const DOW = [1.10, 0.80, 0.82, 0.88, 1.00, 1.28, 1.32];

function leadFactor(days: number) {
  if (days <= 1) return 0.75;
  if (days <= 3) return 0.82;
  if (days <= 7) return 0.90;
  if (days <= 14) return 0.96;
  if (days <= 30) return 1.00;
  if (days <= 60) return 1.05;
  if (days <= 120) return 1.12;
  if (days <= 180) return 1.18;
  return 1.22;
}
function occFactor(o: number) {
  if (o < 0.2) return 0.82;
  if (o < 0.4) return 0.92;
  if (o < 0.6) return 1.00;
  if (o < 0.75) return 1.12;
  if (o < 0.88) return 1.28;
  return 1.45;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: houses } = await supabase
    .from('houses')
    .select('id, name, address, pricing_config, rental_type')
    .eq('rental_type', 'tourist');

  let updated = 0;
  let errors = 0;

  for (const h of houses ?? []) {
    const cfg: any = (h as any).pricing_config ?? {};
    const base = Number(cfg.base_price ?? cfg.basePrice ?? 100);
    const minP = cfg.min_price ? Number(cfg.min_price) : base * 0.55;
    const maxP = cfg.max_price ? Number(cfg.max_price) : base * 2.8;

    for (let i = 0; i < 180; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const { data: m } = await supabase
        .from('market_data_cache')
        .select('occupancy_rate, avg_price')
        .eq('location', (h as any).address ?? '')
        .eq('date', dateStr)
        .maybeSingle();

      const { data: evs } = await supabase
        .from('local_events')
        .select('event_size')
        .lte('date_start', dateStr)
        .gte('date_end', dateStr)
        .limit(1);

      const occ = m?.occupancy_rate != null ? Number(m.occupancy_rate) : 0.6;
      const sf = SEASON[d.getMonth()];
      const df = DOW[d.getDay()];
      const lf = leadFactor(i);
      const of = occFactor(occ);
      const ef = evs?.[0] ? (evs[0].event_size === 'festival' ? 1.6 : evs[0].event_size === 'large' ? 1.35 : 1.15) : 1.0;
      const raw = base * sf * df * lf * of * ef;
      const price = Math.round(Math.min(maxP, Math.max(minP, raw)));

      const { error } = await supabase.rpc('update_dynamic_price', {
        p_house_id: (h as any).id,
        p_date: dateStr,
        p_dynamic_price: price,
        p_factors: { seasonality: sf, dayOfWeek: df, leadTime: lf, occupancy: of, event: ef, gapDiscount: 1.0 },
        p_market_occupancy: occ,
        p_market_avg_price: m?.avg_price ?? null,
        p_source: 'auto_daily',
      });
      if (error) errors++; else updated++;
    }
  }

  return new Response(JSON.stringify({ ok: true, updated, errors, houses: houses?.length ?? 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});