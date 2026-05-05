import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── PriceLabs defaults (mirrors useDynamicPricing.ts) ─────────────────────────
const DEFAULT_SEASON: Record<number, number> = {
  0: 0.75, 1: 0.78, 2: 0.90, 3: 1.00, 4: 1.10, 5: 1.25,
  6: 1.50, 7: 1.55, 8: 1.20, 9: 0.95, 10: 0.80, 11: 1.10,
};
// 0=Mon … 6=Sun (ISO)
const DEFAULT_DOW: Record<number, number> = {
  0: 0.80, 1: 0.82, 2: 0.88, 3: 1.00, 4: 1.28, 5: 1.32, 6: 1.10,
};
const DEFAULT_LEADTIME: Record<string, number> = {
  "0_7": 0.88, "8_14": 0.96, "15_30": 1.00, "31_60": 1.05,
  "61_90": 1.12, "91_plus": 1.20,
};
const DEFAULT_GAP: Record<string, number> = {
  "1": 0.82, "2": 0.88, "3_5": 0.94, "gt5": 1.00,
};

const REGION_KEYWORDS = ["krimml", "wald", "neukirchen", "bramberg", "hollersbach"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isoMonthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
function isoWeekday(d: Date) {
  // 0=Mon … 6=Sun
  const js = d.getUTCDay();
  return (js + 6) % 7;
}
function seasonOf(month: number): "winter" | "spring" | "summer" | "autumn" {
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function leadBucket(d: number): string {
  if (d < 7) return "0_7";
  if (d < 15) return "8_14";
  if (d < 31) return "15_30";
  if (d < 61) return "31_60";
  if (d < 91) return "61_90";
  return "91_plus";
}
function gapBucket(d: number): string {
  if (d === 1) return "1";
  if (d === 2) return "2";
  if (d >= 3 && d <= 5) return "3_5";
  return "gt5";
}

// ─── Analysis ─────────────────────────────────────────────────────────────────
interface BookingRow {
  id: string;
  check_in: string;
  check_out: string;
  booking_amount: number | null;
  number_of_guests: number | null;
  platform: string | null;
  created_at: string;
  status: string;
}

function analyze(bookings: BookingRow[], address: string) {
  const sample_size = bookings.length;

  // Monthly occupancy + avg price per night (last 12 months window)
  const today = new Date();
  const startWindow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));

  const monthly: Record<string, { bookedNights: number; totalNights: number; revenue: number; avgPricePerNight: number; occupancyRate: number }> = {};
  for (let i = 0; i < 12; i++) {
    const m = new Date(Date.UTC(startWindow.getUTCFullYear(), startWindow.getUTCMonth() + i, 1));
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    monthly[isoMonthKey(m)] = {
      bookedNights: 0,
      totalNights: daysBetween(m, next),
      revenue: 0,
      avgPricePerNight: 0,
      occupancyRate: 0,
    };
  }

  for (const b of bookings) {
    const ci = new Date(b.check_in);
    const co = new Date(b.check_out);
    const nights = Math.max(1, daysBetween(ci, co));
    const ppn = (b.booking_amount ?? 0) / nights;

    // Distribute nights across month buckets
    for (const key of Object.keys(monthly)) {
      const [y, mo] = key.split("-").map(Number);
      const monthStart = new Date(Date.UTC(y, mo - 1, 1));
      const monthEnd = new Date(Date.UTC(y, mo, 1));
      const overlapStart = ci > monthStart ? ci : monthStart;
      const overlapEnd = co < monthEnd ? co : monthEnd;
      const overlap = daysBetween(overlapStart, overlapEnd);
      if (overlap > 0) {
        monthly[key].bookedNights += overlap;
        monthly[key].revenue += ppn * overlap;
      }
    }
  }
  for (const key of Object.keys(monthly)) {
    const m = monthly[key];
    m.occupancyRate = m.totalNights > 0 ? m.bookedNights / m.totalNights : 0;
    m.avgPricePerNight = m.bookedNights > 0 ? m.revenue / m.bookedNights : 0;
  }

  // Lead time
  const leadBuckets: Record<string, number> = { "0_7": 0, "8_14": 0, "15_30": 0, "31_60": 0, "61_90": 0, "91_plus": 0 };
  for (const b of bookings) {
    const lt = daysBetween(new Date(b.created_at), new Date(b.check_in));
    leadBuckets[leadBucket(lt)]++;
  }
  const leadShare: Record<string, number> = {};
  for (const k of Object.keys(leadBuckets)) leadShare[k] = sample_size ? leadBuckets[k] / sample_size : 0;

  // Day of week
  const dowCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dowStaySum: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const b of bookings) {
    const ci = new Date(b.check_in);
    const co = new Date(b.check_out);
    const w = isoWeekday(ci);
    dowCount[w]++;
    dowStaySum[w] += Math.max(1, daysBetween(ci, co));
  }
  const dowAvgStay: Record<number, number> = {};
  for (const w of Object.keys(dowCount).map(Number)) {
    dowAvgStay[w] = dowCount[w] ? dowStaySum[w] / dowCount[w] : 0;
  }
  let mostCommon = 0;
  for (const w of Object.keys(dowCount).map(Number)) {
    if (dowCount[w] > dowCount[mostCommon]) mostCommon = w;
  }

  // Platform comparison
  const platMap: Record<string, { bookings: number; nights: number; revenue: number }> = {};
  for (const b of bookings) {
    const p = (b.platform || "direct").toLowerCase();
    const nights = Math.max(1, daysBetween(new Date(b.check_in), new Date(b.check_out)));
    if (!platMap[p]) platMap[p] = { bookings: 0, nights: 0, revenue: 0 };
    platMap[p].bookings++;
    platMap[p].nights += nights;
    platMap[p].revenue += b.booking_amount ?? 0;
  }
  const platforms = Object.entries(platMap).map(([platform, v]) => ({
    platform,
    bookings: v.bookings,
    avgPricePerNight: v.nights ? v.revenue / v.nights : 0,
    totalRevenue: v.revenue,
  }));

  // Gaps
  const sorted = [...bookings].sort((a, b) => a.check_in.localeCompare(b.check_in));
  const gapBuckets: Record<string, number> = { "1": 0, "2": 0, "3_5": 0, "gt5": 0 };
  let totalGapDays = 0;
  let totalGaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevOut = new Date(sorted[i - 1].check_out);
    const nextIn = new Date(sorted[i].check_in);
    const gap = daysBetween(prevOut, nextIn);
    if (gap > 0 && gap < 30) {
      gapBuckets[gapBucket(gap)]++;
      totalGapDays += gap;
      totalGaps++;
    }
  }
  const avgGapDays = totalGaps ? totalGapDays / totalGaps : 0;

  // Seasonal price elasticity
  const seasonal: Record<string, { min: number; max: number; avg: number; bookings: number; bookedNights: number; totalNights: number; occupancyRate: number }> = {
    winter: { min: Infinity, max: 0, avg: 0, bookings: 0, bookedNights: 0, totalNights: 0, occupancyRate: 0 },
    spring: { min: Infinity, max: 0, avg: 0, bookings: 0, bookedNights: 0, totalNights: 0, occupancyRate: 0 },
    summer: { min: Infinity, max: 0, avg: 0, bookings: 0, bookedNights: 0, totalNights: 0, occupancyRate: 0 },
    autumn: { min: Infinity, max: 0, avg: 0, bookings: 0, bookedNights: 0, totalNights: 0, occupancyRate: 0 },
  };
  const seasonRev: Record<string, number> = { winter: 0, spring: 0, summer: 0, autumn: 0 };
  for (const b of bookings) {
    const ci = new Date(b.check_in);
    const nights = Math.max(1, daysBetween(ci, new Date(b.check_out)));
    const ppn = (b.booking_amount ?? 0) / nights;
    const s = seasonOf(ci.getUTCMonth());
    seasonal[s].bookings++;
    seasonal[s].bookedNights += nights;
    seasonRev[s] += ppn * nights;
    if (ppn < seasonal[s].min) seasonal[s].min = ppn;
    if (ppn > seasonal[s].max) seasonal[s].max = ppn;
  }
  // approximate season totalNights from monthly window
  for (const key of Object.keys(monthly)) {
    const mo = Number(key.split("-")[1]) - 1;
    const s = seasonOf(mo);
    seasonal[s].totalNights += monthly[key].totalNights;
  }
  for (const s of Object.keys(seasonal)) {
    const v = seasonal[s];
    v.avg = v.bookedNights > 0 ? seasonRev[s] / v.bookedNights : 0;
    if (!isFinite(v.min)) v.min = 0;
    v.occupancyRate = v.totalNights > 0 ? v.bookedNights / v.totalNights : 0;
  }

  // Region detection
  const addrLower = (address || "").toLowerCase();
  const region = REGION_KEYWORDS.some((k) => addrLower.includes(k)) ? "oberpinzgau" : "unknown";

  // ─── Recommendation: blended factor adjustments ──────────────────────────
  const blendWeight = clamp(sample_size / 200, 0, 0.7);

  // Overall avg price/night across dataset
  let totalNightsAll = 0;
  let totalRevAll = 0;
  for (const b of bookings) {
    const n = Math.max(1, daysBetween(new Date(b.check_in), new Date(b.check_out)));
    totalNightsAll += n;
    totalRevAll += b.booking_amount ?? 0;
  }
  const overallAvgPpn = totalNightsAll ? totalRevAll / totalNightsAll : 0;

  // Per-month own factor (use Jan-Dec aggregated across years from monthly window)
  const monthAgg: Record<number, { rev: number; nights: number }> = {};
  for (let i = 0; i < 12; i++) monthAgg[i] = { rev: 0, nights: 0 };
  for (const key of Object.keys(monthly)) {
    const mo = Number(key.split("-")[1]) - 1;
    monthAgg[mo].rev += monthly[key].revenue;
    monthAgg[mo].nights += monthly[key].bookedNights;
  }
  const seasonFactors: Record<number, number> = {};
  for (let m = 0; m < 12; m++) {
    const own = monthAgg[m].nights && overallAvgPpn
      ? (monthAgg[m].rev / monthAgg[m].nights) / overallAvgPpn
      : DEFAULT_SEASON[m];
    const blended = DEFAULT_SEASON[m] * (1 - blendWeight) + own * blendWeight;
    seasonFactors[m] = clamp(Number(blended.toFixed(3)), 0.6, 1.8);
  }

  // DoW: relative count vs uniform 1/7
  const dowFactors: Record<number, number> = {};
  for (let w = 0; w < 7; w++) {
    const ownShare = sample_size ? dowCount[w] / sample_size : 1 / 7;
    const ownFactor = ownShare / (1 / 7); // 1.0 means avg
    // pull DoW factor toward observed demand
    const blended = DEFAULT_DOW[w] * (1 - blendWeight) + (DEFAULT_DOW[w] * ownFactor) * blendWeight;
    dowFactors[w] = clamp(Number(blended.toFixed(3)), 0.6, 1.8);
  }

  // Lead time: more share in a bucket → higher demand → factor up
  const leadFactors: Record<string, number> = {};
  const uniformLead = 1 / Object.keys(DEFAULT_LEADTIME).length;
  for (const k of Object.keys(DEFAULT_LEADTIME)) {
    const ownShare = leadShare[k] ?? uniformLead;
    const ownFactor = ownShare / uniformLead;
    const blended = DEFAULT_LEADTIME[k] * (1 - blendWeight) + (DEFAULT_LEADTIME[k] * ownFactor) * blendWeight;
    leadFactors[k] = clamp(Number(blended.toFixed(3)), 0.6, 1.8);
  }

  // Gap: more observed gaps of length L → discount more aggressively
  const gapFactors: Record<string, number> = {};
  const totalGapsCount = Object.values(gapBuckets).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(DEFAULT_GAP)) {
    const share = gapBuckets[k] / totalGapsCount;
    // higher share → push factor closer to default discount; less → soften
    const own = DEFAULT_GAP[k] * (1 - share * 0.2);
    const blended = DEFAULT_GAP[k] * (1 - blendWeight) + own * blendWeight;
    gapFactors[k] = clamp(Number(blended.toFixed(3)), 0.6, 1.8);
  }

  return {
    sample_size,
    monthlyOccupancy: monthly,
    leadTime: { counts: leadBuckets, share: leadShare },
    dayOfWeek: { counts: dowCount, avgStay: dowAvgStay, mostCommonCheckInDay: mostCommon },
    platforms,
    gaps: { buckets: gapBuckets, avgGapDays, totalGaps },
    seasonal,
    region,
    blendWeight,
    overallAvgPricePerNight: overallAvgPpn,
    recommendations: {
      factor_adjustments: {
        season: seasonFactors,
        dayOfWeek: dowFactors,
        leadTime: leadFactors,
        gap: gapFactors,
      },
    },
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const house_id: string | undefined = body?.house_id;
    const action: string = body?.action ?? "analyze-bookings";

    if (!house_id || typeof house_id !== "string") {
      return json({ error: "house_id (uuid) required" }, 400);
    }
    if (!["analyze-bookings", "save-calibration", "get-calibration"].includes(action)) {
      return json({ error: "invalid action" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // get-calibration: just read pricing_config
    if (action === "get-calibration") {
      const { data, error } = await supabase
        .from("houses")
        .select("id, name, pricing_config")
        .eq("id", house_id)
        .maybeSingle();
      if (error) throw error;
      return json({ ok: true, calibration: (data?.pricing_config as any)?.calibration ?? null });
    }

    // Load house + bookings
    const { data: house, error: houseErr } = await supabase
      .from("houses")
      .select("id, name, address, pricing_config")
      .eq("id", house_id)
      .maybeSingle();
    if (houseErr) throw houseErr;
    if (!house) return json({ error: "house not found" }, 404);

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 24);

    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("id, check_in, check_out, booking_amount, number_of_guests, platform, created_at, status")
      .eq("house_id", house_id)
      .in("status", ["confirmed", "completed", "checked_in"])
      .not("booking_amount", "is", null)
      .gte("check_in", since.toISOString().split("T")[0])
      .order("check_in", { ascending: true })
      .limit(2000);
    if (bErr) throw bErr;

    if (!bookings || bookings.length === 0) {
      return json({ ok: false, reason: "no_bookings", house_id, sample_size: 0 });
    }

    const analysis = analyze(bookings as BookingRow[], (house as any).address ?? "");
    const result = {
      ok: true,
      house_id,
      generated_at: new Date().toISOString(),
      ...analysis,
    };

    if (action === "analyze-bookings") {
      return json(result);
    }

    // action === 'save-calibration'
    const calibration = {
      updated_at: result.generated_at,
      sample_size_bookings: analysis.sample_size,
      blend_weight: analysis.blendWeight,
      monthly_occupancy: Object.fromEntries(
        Object.entries(analysis.monthlyOccupancy).map(([k, v]) => [k, Number(v.occupancyRate.toFixed(3))]),
      ),
      lead_time_distribution: analysis.leadTime.share,
      dow_distribution: analysis.dayOfWeek.counts,
      platform_avg_price: Object.fromEntries(
        analysis.platforms.map((p) => [p.platform, Math.round(p.avgPricePerNight * 100) / 100]),
      ),
      gap_distribution: analysis.gaps.buckets,
      seasonal_price: analysis.seasonal,
      region: analysis.region,
      factor_adjustments: analysis.recommendations.factor_adjustments,
    };

    const currentConfig = ((house as any).pricing_config ?? {}) as Record<string, unknown>;
    const merged = { ...currentConfig, calibration };

    const { error: updErr } = await supabase
      .from("houses")
      .update({ pricing_config: merged })
      .eq("id", house_id);
    if (updErr) throw updErr;

    return json({ ok: true, saved: true, calibration, analysis: result });
  } catch (e) {
    console.error("[booking-analysis] error", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});