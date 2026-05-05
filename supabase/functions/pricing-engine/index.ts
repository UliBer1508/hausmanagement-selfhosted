import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── Defaults (Pinzgau / Oberpinzgau) ──────────────────────────────────────────
const DEFAULT_FACTORS = {
  season: { 1: 1.40, 2: 1.50, 3: 0.80, 4: 0.70, 5: 0.85, 6: 1.00, 7: 1.30, 8: 1.40, 9: 0.90, 10: 0.75, 11: 0.65, 12: 1.30 } as Record<number, number>,
  dow: { 0: 0.85, 1: 0.85, 2: 0.85, 3: 0.90, 4: 1.10, 5: 1.20, 6: 0.95 } as Record<number, number>,
  leadtime: [
    { days: 90, factor: 0.90 },
    { days: 60, factor: 0.95 },
    { days: 30, factor: 1.00 },
    { days: 14, factor: 1.05 },
    { days: 7, factor: 1.10 },
    { days: 0, factor: 0.85 },
  ],
  occupancy: [
    { threshold: 0.30, factor: 0.85 },
    { threshold: 0.50, factor: 0.90 },
    { threshold: 0.70, factor: 1.00 },
    { threshold: 0.85, factor: 1.10 },
    { threshold: 1.01, factor: 1.25 },
  ],
  gap: { short: 0.75, long: 0.88 },
  event: { small: 1.05, medium: 1.15, large: 1.30 } as Record<string, number>,
  weather: { clear: 1.05, cloudy: 1.00, rain: 0.95, snow_winter: 1.10, snow_summer: 0.90, storm: 0.92 },
  holiday: { at: 1.25, de_by: 1.20, both: 1.35 },
};

function mergeFactors(custom: any) {
  const c = custom ?? {};
  return {
    season: { ...DEFAULT_FACTORS.season, ...(c.season ? Object.fromEntries(Object.entries(c.season).map(([k, v]) => [Number(k), Number(v)])) : {}) },
    dow: { ...DEFAULT_FACTORS.dow, ...(c.dow ? Object.fromEntries(Object.entries(c.dow).map(([k, v]) => [Number(k), Number(v)])) : {}) },
    leadtime: Array.isArray(c.leadtime) && c.leadtime.length ? c.leadtime : DEFAULT_FACTORS.leadtime,
    occupancy: Array.isArray(c.occupancy) && c.occupancy.length ? c.occupancy : DEFAULT_FACTORS.occupancy,
    gap: { ...DEFAULT_FACTORS.gap, ...(c.gap ?? {}) },
    event: { ...DEFAULT_FACTORS.event, ...(c.event ?? {}) },
    weather: { ...DEFAULT_FACTORS.weather, ...(c.weather ?? {}) },
    holiday: { ...DEFAULT_FACTORS.holiday, ...(c.holiday ?? {}) },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ymd(d: Date) { return d.toISOString().split("T")[0]; }
function isoWeekday(d: Date) { return (d.getUTCDay() + 6) % 7; }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }

function leadtimeFactor(daysUntil: number, table: Array<{ days: number; factor: number }>): number {
  // Highest threshold first; fall through to lowest
  const sorted = [...table].sort((a, b) => b.days - a.days);
  for (const row of sorted) {
    if (daysUntil > row.days) return row.factor;
  }
  return sorted[sorted.length - 1]?.factor ?? 1.0;
}

function occupancyFactor(occ: number, table: Array<{ threshold: number; factor: number }>): number {
  const sorted = [...table].sort((a, b) => a.threshold - b.threshold);
  for (const row of sorted) {
    if (occ < row.threshold) return row.factor;
  }
  return sorted[sorted.length - 1]?.factor ?? 1.0;
}

function weatherFactor(code: number, month: number, w: typeof DEFAULT_FACTORS.weather): number {
  if (code <= 2) return w.clear;
  if (code <= 48) return w.cloudy;
  if (code <= 67) return w.rain;
  if (code <= 77) return (month === 12 || month <= 2) ? w.snow_winter : (month >= 6 && month <= 8) ? w.snow_summer : 1.00;
  if (code >= 80) return w.storm;
  return 1.00;
}

async function fetchHolidaysFor(year: number) {
  const at = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=AT&languageIsoCode=DE&validFrom=${year}-01-01&validTo=${year}-12-31`;
  const by = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=DE&subdivisionCode=DE-BY&languageIsoCode=DE&validFrom=${year}-01-01&validTo=${year}-12-31`;
  const [atRes, byRes] = await Promise.all([
    fetch(at).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(by).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  const atSet = new Set<string>();
  const bySet = new Set<string>();
  for (const h of atRes ?? []) {
    const s = new Date(h.startDate); const e = new Date(h.endDate ?? h.startDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) atSet.add(ymd(d));
  }
  for (const h of byRes ?? []) {
    const s = new Date(h.startDate); const e = new Date(h.endDate ?? h.startDate);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) bySet.add(ymd(d));
  }
  return { atSet, bySet };
}

function holidayFactor(date: string, atSet: Set<string>, bySet: Set<string>, h: typeof DEFAULT_FACTORS.holiday): number {
  const at = atSet.has(date), by = bySet.has(date);
  if (at && by) return h.both;
  if (at) return h.at;
  if (by) return h.de_by;
  return 1.00;
}

async function fetchWeather(): Promise<Map<string, number>> {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=47.25&longitude=12.17&daily=weathercode&forecast_days=16&timezone=Europe%2FVienna";
  try {
    const r = await fetch(url);
    if (!r.ok) return new Map();
    const j = await r.json();
    const m = new Map<string, number>();
    const dates: string[] = j?.daily?.time ?? [];
    const codes: number[] = j?.daily?.weathercode ?? [];
    dates.forEach((d, i) => m.set(d, codes[i]));
    return m;
  } catch { return new Map(); }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { house_id, date_from, date_to } = body ?? {};
    if (!house_id || !date_from || !date_to) {
      return json({ error: "house_id, date_from, date_to required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load house
    const { data: house, error: hErr } = await supabase
      .from("houses").select("id, name, pricing_config").eq("id", house_id).maybeSingle();
    if (hErr) throw hErr;
    if (!house) return json({ error: "house not found" }, 404);

    const cfg = (house.pricing_config ?? {}) as any;
    const calibration = cfg.calibration ?? null;
    const base = Number(cfg.base_price ?? 100);
    const min = Number(cfg.min_price ?? base * 0.6);
    const max = Number(cfg.max_price ?? base * 2.5);

    // Merge user-configured factors with defaults
    const F = mergeFactors(cfg.factors);
    let seasonByMonth = { ...F.season };
    // Backward-compat: legacy calibration overrides (uses 0-11)
    if (calibration?.factor_adjustments?.season) {
      const fa = calibration.factor_adjustments.season as Record<string, number>;
      for (const k of Object.keys(fa)) seasonByMonth[Number(k) + 1] = fa[k];
    }

    // Date range
    const start = new Date(date_from + "T00:00:00Z");
    const end = new Date(date_to + "T00:00:00Z");
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);

    // Fetch holidays for years covered
    const years = new Set<number>();
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) years.add(d.getUTCFullYear());
    const holidayCache: { atSet: Set<string>; bySet: Set<string> } = { atSet: new Set(), bySet: new Set() };
    for (const y of years) {
      const h = await fetchHolidaysFor(y);
      h.atSet.forEach(d => holidayCache.atSet.add(d));
      h.bySet.forEach(d => holidayCache.bySet.add(d));
    }

    // Weather (16 days)
    const weather = await fetchWeather();

    // Local events in range
    const { data: events } = await supabase
      .from("local_events")
      .select("date_start, date_end, event_size")
      .lte("date_start", date_to)
      .gte("date_end", date_from);
    const eventMap = new Map<string, string>();
    for (const e of events ?? []) {
      const s = new Date((e as any).date_start);
      const ed = new Date((e as any).date_end);
      const sz = (e as any).event_size as string;
      const rank: Record<string, number> = { small: 1, medium: 2, large: 3 };
      for (let d = new Date(s); d <= ed; d.setDate(d.getDate() + 1)) {
        const k = ymd(d);
        if (!eventMap.has(k) || rank[sz] > rank[eventMap.get(k)!]) eventMap.set(k, sz);
      }
    }
    const eventFactor = (sz?: string) =>
      sz && F.event[sz] != null ? F.event[sz] : 1.00;

    // Existing daily_pricing for house — needed for occupancy + gap detection
    const lookbackStart = new Date(start); lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 7);
    const lookforwardEnd = new Date(end); lookforwardEnd.setUTCDate(lookforwardEnd.getUTCDate() + 7);
    const { data: rows } = await supabase
      .from("daily_pricing")
      .select("date, is_booked, is_blocked")
      .eq("house_id", house_id)
      .gte("date", ymd(lookbackStart))
      .lte("date", ymd(lookforwardEnd));
    const bookedSet = new Set<string>((rows ?? []).filter(r => (r as any).is_booked).map(r => (r as any).date));

    // Monthly occupancy maps (per month touched in range)
    const monthOccupancy = new Map<string, number>();
    function monthKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
    async function getMonthOccupancy(d: Date): Promise<number> {
      const k = monthKey(d);
      if (monthOccupancy.has(k)) return monthOccupancy.get(k)!;
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const { data: mr } = await supabase
        .from("daily_pricing")
        .select("date, is_booked")
        .eq("house_id", house_id)
        .gte("date", ymd(monthStart))
        .lte("date", ymd(monthEnd));
      const total = (monthEnd.getUTCDate());
      const booked = (mr ?? []).filter(r => (r as any).is_booked).length;
      const occ = total ? booked / total : 0;
      monthOccupancy.set(k, occ);
      return occ;
    }

    // Iterate dates
    const preview: any[] = [];
    let updated = 0, errors = 0;
    let firstError: any = null;

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dStr = ymd(d);
      if (bookedSet.has(dStr)) continue;

      const month = d.getUTCMonth() + 1; // 1-12
      const wday = isoWeekday(d);
      const daysUntil = daysBetween(today, d);

      const seasonF = seasonByMonth[month] ?? 1.0;
      const dowF = F.dow[wday] ?? 1.0;
      const ltF = leadtimeFactor(daysUntil, F.leadtime);

      const occ = await getMonthOccupancy(d);
      const occF = occupancyFactor(occ, F.occupancy);

      // Gap detection
      const prev1 = ymd(new Date(d.getTime() - 86400000));
      const prev2 = ymd(new Date(d.getTime() - 2 * 86400000));
      const next1 = ymd(new Date(d.getTime() + 86400000));
      const next2 = ymd(new Date(d.getTime() + 2 * 86400000));
      let gapF = 1.00;
      if ((bookedSet.has(prev1) || bookedSet.has(prev2)) && (bookedSet.has(next1) || bookedSet.has(next2))) {
        // gap window of 1-4 nights
        let gapLen = 0;
        for (let k = 0; k < 6; k++) {
          const fwd = ymd(new Date(d.getTime() + k * 86400000));
          if (bookedSet.has(fwd)) break;
          gapLen++;
        }
        if (gapLen <= 2) gapF = F.gap.short;
        else if (gapLen <= 4) gapF = F.gap.long;
      }

      const evF = eventFactor(eventMap.get(dStr));
      const wcode = weather.get(dStr);
      const weF = wcode != null ? weatherFactor(wcode, month, F.weather) : 1.00;
      const hoF = holidayFactor(dStr, holidayCache.atSet, holidayCache.bySet, F.holiday);

      let dyn = base * seasonF * dowF * ltF * occF * gapF * evF * weF * hoF;
      dyn = Math.max(min, Math.min(max, Math.round(dyn)));

      const factors = {
        seasonality: seasonF,
        dayOfWeek: dowF,
        leadTime: ltF,
        occupancy: occF,
        gap: gapF,
        event: evF,
        weather: weF,
        holiday: hoF,
      };

      const { error: rpcErr } = await supabase.rpc("update_dynamic_price" as any, {
        p_house_id: house_id,
        p_date: dStr,
        p_dynamic_price: dyn,
        p_factors: factors as any,
        p_market_occupancy: occ,
        p_market_avg_price: null,
        p_source: "pricing_engine",
      });
      if (rpcErr) {
        errors++;
        if (!firstError) firstError = rpcErr;
      } else {
        updated++;
        if (preview.length < 30) {
          preview.push({
            date: dStr, base_price: base, dynamic_price: dyn,
            factors: { season: seasonF, dow: dowF, leadtime: ltF, occupancy: occF, gap: gapF, event: evF, weather: weF, holiday: hoF },
          });
        }
      }
    }

    return json({ updated, errors, preview, error: firstError?.message ?? null });
  } catch (e) {
    console.error("[pricing-engine] error", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});
