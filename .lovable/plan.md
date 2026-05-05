# Plan: `booking-analysis` Edge Function

Create a new Supabase Edge Function that analyzes historical booking data per house to calibrate the dynamic pricing engine. No new tables — results are stored inside `houses.pricing_config` (JSONB).

## 1. File Structure

- `supabase/functions/booking-analysis/index.ts` — main handler
- `supabase/config.toml` — add `[functions.booking-analysis] verify_jwt = false` entry

## 2. Request Contract

```ts
POST /functions/v1/booking-analysis
Body: { house_id: string (uuid), action: 'analyze-bookings' | 'save-calibration' | 'get-calibration', payload?: any }
```

- CORS preflight handled (OPTIONS → 200)
- Zod validation on body, returns 400 on invalid input
- Uses `SUPABASE_SERVICE_ROLE_KEY` internally (bypasses RLS — consistent with existing `chat-assistant` and other functions in the project)

## 3. Action: `analyze-bookings`

Query `bookings` for the house:
```sql
status IN ('confirmed','completed','checked_in')
AND booking_amount IS NOT NULL
AND check_in >= now() - interval '24 months'
```

Then compute in-memory (TypeScript, no SQL aggregations needed since dataset per house is small):

### a) Monthly occupancy (last 12 months)
- Build a map `YYYY-MM → { bookedNights, totalNights, revenue, avgPricePerNight }`
- `bookedNights`: sum of overlap days between booking range and that month
- `totalNights`: days in month
- `occupancyRate = bookedNights / totalNights`
- `avgPricePerNight = revenue / bookedNights`

### b) Lead time analysis
- `leadDays = check_in - created_at` (days)
- Buckets: `<7`, `7-14`, `14-30`, `30-60`, `60-90`, `>90`
- Return `{ bucket, count, share }`

### c) Day of week patterns
- Group by weekday of `check_in` (0=Mon … 6=Sun, ISO style)
- `{ weekday, count, avgStayLength }`
- Return `mostCommonCheckInDay`

### d) Platform comparison
- Group by `platform` (treat null as `'direct'`)
- `{ platform, bookings, avgPricePerNight, totalRevenue }`

### e) Gap analysis
- Sort confirmed bookings by `check_in`
- Compute `gap = next.check_in - prev.check_out` (days)
- Buckets: `1`, `2`, `3-5`, `>5`
- Also return `avgGapDays` and `totalGaps`

### f) Seasonal price elasticity
- Map month → season (Winter Dec/Jan/Feb, Spring Mar–May, Summer Jun–Aug, Autumn Sep–Nov)
- Per season: `min`, `max`, `avg` price/night, `bookings`, `occupancyRate` (using bookedNights / totalNightsInSeasonWindow)

### g) Region modifier (Pinzgau context)
- Detect house location via `houses.address` containing one of: Krimml, Wald, Neukirchen, Bramberg, Hollersbach
- Add `region: 'oberpinzgau' | 'unknown'` to output
- Include local high seasons: Winter peak (Dec 20 – Mar 15), Summer peak (Jul 1 – Aug 31)

Response shape:
```ts
{
  house_id, generated_at, sample_size,
  monthlyOccupancy, leadTime, dayOfWeek,
  platforms, gaps, seasonal, region,
  recommendations: { /* derived factor adjustments — see §5 */ }
}
```

## 4. Action: `save-calibration`

- Re-runs analysis (or accepts `payload.analysis` from client to avoid double work)
- Reads current `houses.pricing_config`
- Merges a `calibration` block:
```json
{
  "calibration": {
    "updated_at": "...",
    "sample_size_bookings": 0,
    "monthly_occupancy": { "2026-01": 0.62, ... },
    "lead_time_distribution": { "<7": 0.1, ... },
    "dow_distribution": { "0": 0.05, ... },
    "platform_avg_price": { "airbnb": 180, "booking": 175, "direct": 200 },
    "gap_distribution": { "1": 12, "2": 6, ... },
    "seasonal_price": { "winter": {min,max,avg,occupancy}, ... },
    "region": "oberpinzgau",
    "factor_adjustments": {
      "season": { "0": 0.78, "1": 0.81, ... },   // 12 months
      "dayOfWeek": { "0": 0.85, ... },
      "leadTime": { "0_7": 0.88, "8_14": 0.95, ... },
      "gap": { "1": 0.80, "2": 0.86, ... }
    }
  }
}
```
- `UPDATE houses SET pricing_config = pricing_config || '{calibration:...}'::jsonb WHERE id = house_id`

## 5. Recommendation derivation

Compute per-house factor adjustments from observed data, blended with the PriceLabs defaults already in `useDynamicPricing.ts`:

```
ownFactor[month] = avgPricePerNight[month] / overallAvgPricePerNight
blendWeight w = clamp(sample_size / 200, 0, 0.7)
finalFactor = defaultFactor * (1 - w) + ownFactor * w
```

Same blend for `dayOfWeek`, `leadTime`, `gap`. Min/max bounded to `[0.6, 1.8]` to prevent outliers.

These are returned in `recommendations` and persisted under `factor_adjustments`.

## 6. Action: `get-calibration` (small convenience)

Read `houses.pricing_config.calibration` and return it. Useful for the frontend to display "last analyzed at" without rerunning.

## 7. Frontend Integration (light touch — no UI build in this plan)

Just expose the function so it can be called later:
- It can be invoked via `supabase.functions.invoke('booking-analysis', { body: {...} })`
- A future PR will wire the trigger button into `PricingDashboard.tsx`

## 8. Error Handling & Logging

- Try/catch around the whole handler, return `{ error }` with status 500
- `console.error` on failure paths (visible in edge function logs)
- Returns `{ ok: false, reason: 'no_bookings' }` (200) when sample size is 0 — frontend can show "Not enough data yet"

## 9. Out of scope (will be follow-up tasks)

- Calling external market APIs (AirDNA, PriceLabs) — handled separately
- UI panel in `PricingDashboard.tsx`
- Cron schedule (function will be triggered on demand for now)
