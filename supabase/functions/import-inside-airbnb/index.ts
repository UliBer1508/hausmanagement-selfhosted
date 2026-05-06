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

const MONTHLY_OCC: Record<number, number> = {
  0: 0.38, 1: 0.40, 2: 0.48, 3: 0.58, 4: 0.65, 5: 0.72,
  6: 0.82, 7: 0.85, 8: 0.74, 9: 0.60, 10: 0.45, 11: 0.55,
};

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
    if (idxAvail === -1) {
      return new Response(
        JSON.stringify({ error: "Spalte availability_365 fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sumOcc = 0;
    let count = 0;
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
    }

    if (count === 0) {
      return new Response(
        JSON.stringify({ error: "Keine gültigen Listings im CSV gefunden" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseOccupancy = clamp(sumOcc / count, 0.05, 0.95);

    const monthlyValues = Object.values(MONTHLY_OCC);
    const monthlyMean = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;
    const factor: Record<number, number> = {};
    for (const [m, v] of Object.entries(MONTHLY_OCC)) {
      factor[Number(m)] = v / monthlyMean;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fetchedAt = new Date().toISOString();
    const rows: any[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      const occ = clamp(baseOccupancy * factor[d.getUTCMonth()], 0.05, 0.95);
      const avgPrice = Math.round(80 + occ * 120);
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