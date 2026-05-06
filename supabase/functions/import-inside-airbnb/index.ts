import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  location: z.string().min(1).max(255),
  csv_content: z.string().min(10),
});

// Mirror of DEFAULT_PRICING_CONFIG.season_factors — keep in sync with src/hooks/usePricingSettings.ts
const DEFAULT_SEASON_FACTORS = [0.75, 0.78, 0.90, 1.00, 1.10, 1.25, 1.50, 1.55, 1.20, 0.95, 0.80, 1.10];

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Liefert yyyy-MM-dd in Europe/Vienna (Lokalzeit) – konsistent mit Frontend toISODate/todayISO.
function ymd(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { location, csv_content } = parsed.data;

    const lines = csv_content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ error: "CSV enthält keine Datenzeilen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idxAvail = header.indexOf("availability_365");
    const idxRoom = header.indexOf("room_type");
    const idxReviews = header.indexOf("number_of_reviews");
    const idxPrice = header.indexOf("price");
    if (idxAvail === -1) {
      return new Response(
        JSON.stringify({ error: "Spalte availability_365 fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sumOcc = 0;
    let count = 0;
    const prices: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const availRaw = cols[idxAvail];
      const avail = Number(availRaw);
      if (!Number.isFinite(avail) || avail < 0 || avail > 365) continue;

      if (idxRoom !== -1) {
        const room = (cols[idxRoom] || "").trim();
        if (room && room !== "Entire home/apt") continue;
      }
      if (idxReviews !== -1) {
        const rv = Number(cols[idxReviews]);
        if (!Number.isFinite(rv) || rv < 1) continue;
      }

      sumOcc += (365 - avail) / 365;
      count++;

      // Preis aus CSV parsen (Inside-Airbnb: "$1,234.00" oder "€199" o.ä.)
      if (idxPrice !== -1) {
        const raw = (cols[idxPrice] || "").trim();
        if (raw) {
          const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
          const v = parseFloat(cleaned);
          if (Number.isFinite(v) && v > 0 && v < 10000) prices.push(v);
        }
      }
    }

    if (count === 0) {
      return new Response(
        JSON.stringify({ error: "Keine gültigen Listings im CSV gefunden" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseOccupancy = clamp(sumOcc / count, 0.05, 0.95);

    // Median der lokalen Preise — robuster als Mittelwert (Ausreißer)
    let medianPrice: number | null = null;
    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianPrice = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // season_factors aus pricing_config laden (Single Source of Truth)
    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pricing_config")
      .maybeSingle();
    const sfRaw = (settingsRow?.value as any)?.season_factors;
    const seasonFactors: number[] =
      Array.isArray(sfRaw) && sfRaw.length === 12 && sfRaw.every((n: any) => Number.isFinite(Number(n)))
        ? sfRaw.map(Number)
        : DEFAULT_SEASON_FACTORS;
    const monthlyMean = seasonFactors.reduce((a, b) => a + b, 0) / seasonFactors.length;
    const factor: Record<number, number> = {};
    seasonFactors.forEach((v, m) => { factor[m] = v / monthlyMean; });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fetchedAt = new Date().toISOString();
    const rows: any[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      const occ = clamp(baseOccupancy * factor[d.getUTCMonth()], 0.05, 0.95);
      // Wenn lokale Preise vorhanden: Median × saisonalem Faktor verwenden,
      // sonst Fallback auf alte Heuristik (80 + occ*120).
      const seasonalFactor = factor[d.getUTCMonth()] ?? 1;
      const avgPrice = medianPrice != null
        ? Math.round(medianPrice * seasonalFactor)
        : Math.round(80 + occ * 120);
      rows.push({
        location,
        date: ymd(d),
        occupancy_rate: Number(occ.toFixed(3)),
        avg_price: avgPrice,
        source: "inside_airbnb",
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
          JSON.stringify({ error: `Upsert-Fehler: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      written += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported_listings: count,
        days_written: written,
        base_occupancy: Number(baseOccupancy.toFixed(3)),
        median_price: medianPrice != null ? Math.round(medianPrice) : null,
        price_samples: prices.length,
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