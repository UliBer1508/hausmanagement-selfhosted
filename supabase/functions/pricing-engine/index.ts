import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── Defaults (Pinzgau / Oberpinzgau) ──────────────────────────────────────────
const DEFAULT_FACTORS = {
  // Sommer-Peak (Wandern/Nationalpark Hohe Tauern) klar über Winter-Peak
  season: { 1: 1.40, 2: 1.50, 3: 0.85, 4: 0.70, 5: 0.85, 6: 1.10, 7: 1.50, 8: 1.55, 9: 0.95, 10: 0.75, 11: 0.65, 12: 1.30 } as Record<number, number>,
  // Mo=0 ... So=6 (siehe isoWeekday). Sa = klassischer Anreisetag im Pinzgau.
  dow: { 0: 0.85, 1: 0.85, 2: 0.85, 3: 0.95, 4: 1.25, 5: 1.35, 6: 1.10 } as Record<number, number>,
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
  gap: { short: 0.75, long: 0.88, medium: 0.92, none: 1.00 },
  event: { small: 1.05, medium: 1.15, large: 1.30 } as Record<string, number>,
  weather: { clear: 1.05, cloudy: 1.00, rain: 0.95, snow_winter: 1.10, snow_summer: 0.90, storm: 0.92 },
  // Klimatologische Wetter-Erwartung Pinzgau (Fallback nach Tag 16)
  weather_climatology: { 1: 1.05, 2: 1.06, 3: 1.02, 4: 0.98, 5: 0.98, 6: 1.00, 7: 1.02, 8: 1.03, 9: 1.05, 10: 1.00, 11: 0.97, 12: 1.04 } as Record<number, number>,
  holiday: {
    at: 1.25,
    de_by: 1.25,
    at_plus_de: 1.35,
    foreign_single: 1.10,
    foreign_multi: 1.18,
    at_or_de_plus_foreign: 1.40,
  },
  // Length-of-Stay Rabatte für zusammenhängende freie Blöcke
  los: { d7: 0.95, d14: 0.90, d21: 0.85 },
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
    weather_climatology: { ...DEFAULT_FACTORS.weather_climatology, ...(c.weather_climatology ? Object.fromEntries(Object.entries(c.weather_climatology).map(([k, v]) => [Number(k), Number(v)])) : {}) },
    holiday: { ...DEFAULT_FACTORS.holiday, ...(c.holiday ?? {}) },
    los: { ...DEFAULT_FACTORS.los, ...(c.los ?? {}) },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ymd(d: Date) { return d.toISOString().split("T")[0]; }
function isoWeekday(d: Date) { return (d.getUTCDay() + 6) % 7; } // Mo=0 ... So=6
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

function leadtimeFactor(daysUntil: number, table: Array<{ days: number; factor: number }>): number {
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

type HolidayCache = Record<string, Set<string>>;

async function fetchOpenHolidays(country: string, subdivision: string | null, year: number): Promise<Set<string>> {
  const sub = subdivision ? `&subdivisionCode=${subdivision}` : "";
  const url = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${country}&languageIsoCode=DE&validFrom=${year}-01-01&validTo=${year}-12-31${sub}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return new Set();
    const list = await r.json();
    const set = new Set<string>();
    for (const h of list ?? []) {
      const s = new Date(h.startDate);
      const e = new Date(h.endDate ?? h.startDate);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) set.add(ymd(d));
    }
    return set;
  } catch { return new Set(); }
}

async function fetchHolidaysFor(year: number): Promise<HolidayCache> {
  const tasks: Array<[string, Promise<Set<string>>]> = [
    ["AT",    fetchOpenHolidays("AT", null,    year)],
    ["DE_BY", fetchOpenHolidays("DE", "DE-BY", year)],
    ["NL",    fetchOpenHolidays("NL", null,    year)],
    ["CZ",    fetchOpenHolidays("CZ", null,    year)],
    ["PL",    fetchOpenHolidays("PL", null,    year)],
    ["HU",    fetchOpenHolidays("HU", null,    year)],
  ];
  const out: HolidayCache = {};
  await Promise.all(tasks.map(async ([k, p]) => { out[k] = await p; }));
  return out;
}

function holidayFactor(date: string, cache: HolidayCache, h: typeof DEFAULT_FACTORS.holiday): number {
  const at = cache.AT?.has(date) ? 1 : 0;
  const by = cache.DE_BY?.has(date) ? 1 : 0;
  const localCount = at + by;
  const foreignCount =
    (cache.NL?.has(date) ? 1 : 0) +
    (cache.CZ?.has(date) ? 1 : 0) +
    (cache.PL?.has(date) ? 1 : 0) +
    (cache.HU?.has(date) ? 1 : 0);

  if (localCount === 0 && foreignCount === 0) return 1.00;
  if (localCount > 0 && foreignCount > 0) return h.at_or_de_plus_foreign;
  if (localCount === 2) return h.at_plus_de;
  if (localCount === 1) return at ? h.at : h.de_by;
  // nur ausländisch
  return foreignCount >= 2 ? h.foreign_multi : h.foreign_single;
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

    const { data: house, error: hErr } = await supabase
      .from("houses").select("id, name, pricing_config").eq("id", house_id).maybeSingle();
    if (hErr) throw hErr;
    if (!house) return json({ error: "house not found" }, 404);

    const cfg = (house.pricing_config ?? {}) as any;
    const calibration = cfg.calibration ?? null;
    const base = Number(cfg.base_price ?? 100);
    const min = Number(cfg.min_price ?? base * 0.6);
    const max = Number(cfg.max_price ?? base * 2.5);

    const F = mergeFactors(cfg.factors);
    let seasonByMonth = { ...F.season };
    if (calibration?.factor_adjustments?.season) {
      const fa = calibration.factor_adjustments.season as Record<string, number>;
      for (const k of Object.keys(fa)) seasonByMonth[Number(k) + 1] = fa[k];
    }

    const start = new Date(date_from + "T00:00:00Z");
    const end = new Date(date_to + "T00:00:00Z");
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);

    // Ferien für alle relevanten Jahre
    const years = new Set<number>();
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) years.add(d.getUTCFullYear());
    const holidayCache: HolidayCache = { AT: new Set(), DE_BY: new Set(), NL: new Set(), CZ: new Set(), PL: new Set(), HU: new Set() };
    for (const y of years) {
      const h = await fetchHolidaysFor(y);
      for (const k of Object.keys(h)) {
        h[k].forEach(d => holidayCache[k].add(d));
      }
    }

    const weather = await fetchWeather();

    // Local events
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

    // Bestehende daily_pricing für occupancy + Gap-Erkennung (großes Fenster!)
    const lookbackStart = new Date(start); lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 21);
    const lookforwardEnd = new Date(end); lookforwardEnd.setUTCDate(lookforwardEnd.getUTCDate() + 21);
    const { data: rows } = await supabase
      .from("daily_pricing")
      .select("date, is_booked, is_blocked")
      .eq("house_id", house_id)
      .gte("date", ymd(lookbackStart))
      .lte("date", ymd(lookforwardEnd));
    const blockedSet = new Set<string>(
      (rows ?? []).filter(r => (r as any).is_booked || (r as any).is_blocked).map(r => (r as any).date)
    );
    const bookedSet = new Set<string>((rows ?? []).filter(r => (r as any).is_booked).map(r => (r as any).date));

    // Monatliche Belegung
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

    // Echte Gap-Längen-Erkennung (Suche bis 14 Tage in jede Richtung)
    const SEARCH_WINDOW = 14;
    function gapInfo(d: Date): { isGap: boolean; gapLen: number } {
      const dStr = ymd(d);
      if (blockedSet.has(dStr)) return { isGap: false, gapLen: 0 };
      // rückwärts
      let prevBookedDist = -1;
      for (let k = 1; k <= SEARCH_WINDOW; k++) {
        const x = ymd(new Date(d.getTime() - k * 86400000));
        if (blockedSet.has(x)) { prevBookedDist = k; break; }
      }
      // vorwärts
      let nextBookedDist = -1;
      for (let k = 1; k <= SEARCH_WINDOW; k++) {
        const x = ymd(new Date(d.getTime() + k * 86400000));
        if (blockedSet.has(x)) { nextBookedDist = k; break; }
      }
      if (prevBookedDist < 0 || nextBookedDist < 0) return { isGap: false, gapLen: 0 };
      const gapLen = (prevBookedDist - 1) + 1 + (nextBookedDist - 1);
      return { isGap: true, gapLen };
    }

    // LOS: Länge des freien Blocks, in dem d liegt (Booked/Blocked als Begrenzung)
    function freeBlockLength(d: Date): number {
      if (blockedSet.has(ymd(d))) return 0;
      let len = 1;
      for (let k = 1; k <= 30; k++) {
        const x = ymd(new Date(d.getTime() - k * 86400000));
        if (blockedSet.has(x)) break;
        len++;
      }
      for (let k = 1; k <= 30; k++) {
        const x = ymd(new Date(d.getTime() + k * 86400000));
        if (blockedSet.has(x)) break;
        len++;
      }
      return len;
    }

    function gapFactorFor(gapLen: number): number {
      if (gapLen <= 0) return F.gap.none;
      if (gapLen <= 2) return F.gap.short;
      if (gapLen <= 4) return F.gap.long;
      if (gapLen <= 7) return F.gap.medium;
      return F.gap.none;
    }

    function losFactorFor(blockLen: number): number {
      if (blockLen >= 21) return F.los.d21;
      if (blockLen >= 14) return F.los.d14;
      if (blockLen >= 7)  return F.los.d7;
      return 1.00;
    }

    // Iterate
    const preview: any[] = [];
    let updated = 0, errors = 0;
    let firstError: any = null;

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dStr = ymd(d);
      if (bookedSet.has(dStr)) continue;

      const month = d.getUTCMonth() + 1;
      const wday = isoWeekday(d);
      const daysUntil = daysBetween(today, d);

      const seasonF = seasonByMonth[month] ?? 1.0;
      const dowF = F.dow[wday] ?? 1.0;
      const ltF = leadtimeFactor(daysUntil, F.leadtime);

      const occ = await getMonthOccupancy(d);
      const occF = occupancyFactor(occ, F.occupancy);

      const gi = gapInfo(d);
      const gapF = gi.isGap ? gapFactorFor(gi.gapLen) : F.gap.none;

      const evF = eventFactor(eventMap.get(dStr));
      const wcode = weather.get(dStr);
      const weF = wcode != null
        ? weatherFactor(wcode, month, F.weather)
        : (F.weather_climatology[month] ?? 1.00);
      const hoF = holidayFactor(dStr, holidayCache, F.holiday);

      const blockLen = freeBlockLength(d);
      const losF = losFactorFor(blockLen);

      let dyn = base * seasonF * dowF * ltF * occF * gapF * evF * weF * hoF * losF;
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
        los: losF,
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
            factors,
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
