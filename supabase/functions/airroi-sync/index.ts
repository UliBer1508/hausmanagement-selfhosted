import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mirror of DEFAULT_PRICING_CONFIG (AirROI subset) — keep in sync with src/hooks/usePricingSettings.ts
const DEFAULT_AIRROI_CONFIG = {
  airroi_room_type: "entire_home",
  airroi_min_bedrooms: 2,
  airroi_num_months: 24,
  airroi_currency: "eur",
};

const BodySchema = z.object({
  location: z.string().min(1).max(255),
  house_id: z.string().uuid().optional(),
});

const MONTHLY_OCC: Record<number, number> = {
  0: 0.38, 1: 0.40, 2: 0.48, 3: 0.58, 4: 0.65, 5: 0.72,
  6: 0.82, 7: 0.85, 8: 0.74, 9: 0.60, 10: 0.45, 11: 0.55,
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
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
    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { location } = parsed.data;

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
    const filterParams = new URLSearchParams({
      room_type:    String(cfg.airroi_room_type),
      min_bedrooms: String(cfg.airroi_min_bedrooms),
      num_months:   String(cfg.airroi_num_months),
      currency:     String(cfg.airroi_currency),
    });

    const searchRes = await fetch(
      `https://api.airroi.com/v1/markets/search?q=${encodeURIComponent(location)}&${filterParams}`,
      { headers: { "x-api-key": apiKey } },
    );
    if (!searchRes.ok) {
      const t = await searchRes.text();
      return new Response(
        JSON.stringify({ error: `AirROI search failed (${searchRes.status}): ${t}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const searchJson: any = await searchRes.json();
    const marketId =
      searchJson?.markets?.[0]?.id ??
      searchJson?.data?.[0]?.id ??
      searchJson?.results?.[0]?.id ??
      searchJson?.[0]?.id;
    if (!marketId) {
      return new Response(
        JSON.stringify({ error: `Kein AirROI-Markt für "${location}" gefunden` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const analyticsRes = await fetch(
      `https://api.airroi.com/v1/markets/${marketId}/analytics?${filterParams}`,
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

    const monthMap: Record<number, { occ?: number; adr?: number }> = {};
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
      monthMap[monthNum] = {
        occ: occRaw != null ? Number(occRaw) : undefined,
        adr: adrRaw != null ? Number(adrRaw) : undefined,
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

    const monthlyMean = Object.values(MONTHLY_OCC).reduce((a, b) => a + b, 0) / 12;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fetchedAt = new Date().toISOString();
    const rows: any[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      const m = d.getUTCMonth();
      const mm = monthMap[m] ?? {};
      let occ = mm.occ != null ? mm.occ : baseOcc * (MONTHLY_OCC[m] / monthlyMean);
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
        market_id: marketId,
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
