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

    const filterParams = new URLSearchParams({
      room_type:    String(cfg.airroi_room_type),
      min_bedrooms: String(cfg.airroi_min_bedrooms),
      num_months:   String(cfg.airroi_num_months),
      currency:     String(cfg.airroi_currency),
      country,
      region,
      locality,
    });
    if (district) filterParams.set("district", district);

    // Direkter Call an AirROI Markets-Analytics mit Markt-Hierarchie als Query-Params
    const analyticsRes = await fetch(
      `https://api.airroi.com/v1/markets/analytics?${filterParams}`,
      { headers: { "x-api-key": apiKey } },
    );
    if (!analyticsRes.ok) {
      const t = await analyticsRes.text();
      return new Response(
        JSON.stringify({ error: `AirROI analytics failed (${analyticsRes.status}): ${t}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const analytics: any = await analyticsRes.json();

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
