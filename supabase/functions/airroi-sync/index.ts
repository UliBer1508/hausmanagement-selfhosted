import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { DEFAULT_AIRROI_CONFIG, DEFAULT_SEASON_FACTORS } from "../_shared/pricingDefaults.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  location: z.string().min(1).max(255).optional(),
  house_id: z.string().uuid().optional(),
}).optional();

// Liefert yyyy-MM-dd in Europe/Vienna (Lokalzeit) – konsistent mit Frontend toISODate/todayISO.
const ymd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(d);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("AIRROI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AIRROI_API_KEY not configured" }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pricing-Config aus system_settings lesen (Fallback: Defaults)
    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pricing_config")
      .maybeSingle();
    const cfg = { ...DEFAULT_AIRROI_CONFIG, ...(settingsRow?.value as Record<string, unknown> ?? {}) };

    const country  = String(cfg.airroi_country  ?? "").trim();
    const region   = String(cfg.airroi_region   ?? "").trim();
    const locality = String(cfg.airroi_locality ?? "").trim();
    const district = String(cfg.airroi_district ?? "").trim();

    const sfRaw = (cfg as any).season_factors;
    const seasonFactors: number[] = (Array.isArray(sfRaw) && sfRaw.length === 12 && sfRaw.every((n: any) => Number.isFinite(Number(n))))
      ? sfRaw.map(Number)
      : DEFAULT_SEASON_FACTORS;

    if (!country || !region || !locality) {
      return new Response(
        JSON.stringify({ error: "AirROI Marktdefinition unvollständig — bitte Land, Region und Ort/Markt in den Preis-Einstellungen ausfüllen." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cache-Schlüssel: Stadtteil bevorzugt, sonst Ort
    const location = district || locality;

    // AirROI-API: POST /markets/summary mit Market-Objekt (kein /v1/-Prefix, kein Query-String).
    // Siehe https://www.airroi.com/api/documentation
    const summaryUrl = "https://api.airroi.com/markets/summary";
    const market: Record<string, string> = { country, region, locality };
    if (district) market.district = district;
    const summaryBody = {
      market,
      num_months: Number(cfg.airroi_num_months) || 12,
      currency: String(cfg.airroi_currency || "native"),
    };

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const MAX_ATTEMPTS = 3;

    async function fetchWithRetry(url: string, init: RequestInit): Promise<{ res: Response | null; err: unknown; attempts: number }> {
      let res: Response | null = null;
      let err: unknown = null;
      let attempt = 0;
      for (attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          res = await fetch(url, init);
          if (res.ok || (res.status < 500 && res.status !== 429)) return { res, err: null, attempts: attempt };
          err = new Error(`HTTP ${res.status}`);
        } catch (e) {
          err = e;
          res = null;
        }
        if (attempt < MAX_ATTEMPTS) await sleep(500 * Math.pow(2, attempt - 1));
      }
      return { res, err, attempts: attempt - 1 };
    }

    const debug: any = { endpoints: [] };

    const summaryInit: RequestInit = {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(summaryBody),
    };
    const summaryResult = await fetchWithRetry(summaryUrl, summaryInit);
    debug.endpoints.push({ url: summaryUrl, method: "POST", status: summaryResult.res?.status ?? null, attempts: summaryResult.attempts });

    if (!summaryResult.res) {
      return new Response(
        JSON.stringify({ error: `AirROI summary fetch failed after ${MAX_ATTEMPTS} attempts: ${(summaryResult.err as Error)?.message ?? "network error"}`, debug }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!summaryResult.res.ok) {
      const t = await summaryResult.res.text();
      return new Response(
        JSON.stringify({ error: `AirROI /markets/summary failed (${summaryResult.res.status}): ${t}`, debug }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const summary: any = await summaryResult.res.json();

    // Optional: monatliche Metriken (POST /markets/metrics/all). Bei Fehler/leer:
    // Fallback auf Summary + season_factors für saisonale Verteilung.
    const metricsUrl = "https://api.airroi.com/markets/metrics/all";
    const metricsResult = await fetchWithRetry(metricsUrl, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(summaryBody),
    });
    debug.endpoints.push({ url: metricsUrl, method: "POST", status: metricsResult.res?.status ?? null, attempts: metricsResult.attempts });

    let metrics: any = null;
    if (metricsResult.res?.ok) {
      try { metrics = await metricsResult.res.json(); } catch { metrics = null; }
    } else if (metricsResult.res) {
      // Body konsumieren um Resource-Leak zu vermeiden
      try { await metricsResult.res.text(); } catch { /* noop */ }
    }

    // Kombiniere Summary + (optional) Monthly-Metriken in das ursprüngliche `analytics`-Format
    const analytics: any = {
      ...(summary ?? {}),
      monthly: metrics?.monthly ?? metrics?.monthly_metrics ?? metrics?.data?.monthly ?? [],
    };

    const monthlyRaw: any[] =
      analytics?.monthly ??
      analytics?.monthly_metrics ??
      analytics?.data?.monthly ??
      analytics?.metrics?.monthly ??
      [];

    // Aggregation pro Monat: AirROI kann mehrere Einträge je Monat liefern
    // (z.B. mehrere Jahre im num_months-Fenster). Wir mitteln Occupancy und ADR
    // über alle Vorkommen statt last-write-wins.
    const monthAgg: Record<number, { occSum: number; occN: number; adrSum: number; adrN: number }> = {};
    for (const m of monthlyRaw) {
      const monthStr = String(m.month ?? m.date ?? m.period ?? "");
      let monthNum = -1;
      if (monthStr) {
        const dt = new Date(monthStr.length === 7 ? `${monthStr}-01` : monthStr);
        if (!isNaN(dt.getTime())) monthNum = dt.getUTCMonth();
      }
      if (monthNum < 0 && m.month_number != null) monthNum = Number(m.month_number) - 1;
      if (monthNum < 0 || monthNum > 11) continue;
      const occRaw = m.occupancy_rate ?? m.occupancy ?? m.occ;
      const adrRaw = m.avg_daily_rate ?? m.adr ?? m.average_daily_rate;
      const bucket = monthAgg[monthNum] ?? { occSum: 0, occN: 0, adrSum: 0, adrN: 0 };
      if (occRaw != null && Number.isFinite(Number(occRaw))) {
        let v = Number(occRaw);
        if (v > 1) v = v / 100; // Normalisieren: AirROI liefert teils 0–100, teils 0–1
        bucket.occSum += v;
        bucket.occN += 1;
      }
      if (adrRaw != null && Number.isFinite(Number(adrRaw))) {
        bucket.adrSum += Number(adrRaw);
        bucket.adrN += 1;
      }
      monthAgg[monthNum] = bucket;
    }

    const monthMap: Record<number, { occ?: number; adr?: number }> = {};
    for (const [k, b] of Object.entries(monthAgg)) {
      monthMap[Number(k)] = {
        occ: b.occN > 0 ? b.occSum / b.occN : undefined,
        adr: b.adrN > 0 ? b.adrSum / b.adrN : undefined,
      };
    }

    let baseOcc = Number(
      analytics?.occupancy_rate ?? analytics?.occupancy ??
      analytics?.data?.occupancy_rate ?? analytics?.metrics?.occupancy_rate ?? 0.6,
    );
    if (baseOcc > 1) baseOcc = baseOcc / 100;
    const baseAdr = Number(
      analytics?.avg_daily_rate ?? analytics?.adr ??
      analytics?.data?.avg_daily_rate ?? analytics?.metrics?.adr ?? 120,
    );

    const monthlyMean = seasonFactors.reduce((a, b) => a + b, 0) / 12;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fetchedAt = new Date().toISOString();
    const rows: any[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      const m = d.getUTCMonth();
      const mm = monthMap[m] ?? {};
      let occ = mm.occ != null ? mm.occ : baseOcc * (seasonFactors[m] / monthlyMean);
      if (occ > 1) occ = occ / 100;
      occ = clamp(occ, 0.05, 0.98);
      const adr = Math.round(mm.adr ?? baseAdr);
      rows.push({
        location,
        date: ymd(d),
        occupancy_rate: Number(occ.toFixed(3)),
        avg_price: adr,
        source: "airroi",
        fetched_at: fetchedAt,
      });
    }

    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("market_data_cache")
        .upsert(chunk, { onConflict: "location,date" });
      if (error) {
        return new Response(
          JSON.stringify({ error: `Upsert failed: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      written += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        market: { country, region, locality, district: district || undefined },
        days_written: written,
        base_occupancy: Number(baseOcc.toFixed(3)),
        base_adr: baseAdr,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
