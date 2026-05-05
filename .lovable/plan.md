## Problem

The `pricing-engine` edge function calls `update_dynamic_price` with `p_source: "pricing_engine"`. The `daily_pricing.source` column has a CHECK constraint that only permits `'manual' | 'scraped' | 'expanded' | 'historical'`, so every insert/update fails.

## Fix

**Migration**: Drop and recreate `daily_pricing_source_check` to include `'pricing_engine'`:

```sql
ALTER TABLE public.daily_pricing
  DROP CONSTRAINT IF EXISTS daily_pricing_source_check;

ALTER TABLE public.daily_pricing
  ADD CONSTRAINT daily_pricing_source_check
  CHECK (source = ANY (ARRAY['manual','scraped','expanded','historical','pricing_engine']));
```

(There are two identical copies of the constraint reported — the `DROP IF EXISTS` + re-add will collapse it to one.)

No code changes required; `supabase/functions/pricing-engine/index.ts` already sends `'pricing_engine'`.

## Verification

After migration, click "Preise neu berechnen (Smart)" on `/pricing`; the function should write rows without the constraint error.