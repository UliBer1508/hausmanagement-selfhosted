## Problem

Beim Speichern eines Preis-Overrides im Pricing Dashboard wirft Postgres:
`there is no unique or exclusion constraint matching the ON CONFLICT specification`

**Ursache:** Die RPC-Funktion `public.update_dynamic_price` verwendet `ON CONFLICT (house_id, date)` auf der Tabelle `daily_pricing`. Diese Tabelle hat aber nur folgende Unique-Constraints:
- `daily_pricing_pkey` auf `(id)`
- `unique_competitor_date` auf `(competitor_property_id, date)`

Es existiert **kein** Unique-Constraint auf `(house_id, date)` — daher schlägt das Upsert fehl. `house_id` kann zudem NULL sein (wenn `competitor_property_id` gesetzt ist), darum brauchen wir einen **partiellen** Unique-Index.

## Lösung

### 1. Migration: Partiellen Unique-Index ergänzen

```sql
-- Vorher Duplikate säubern (sicherheitshalber)
DELETE FROM public.daily_pricing a
USING public.daily_pricing b
WHERE a.ctid < b.ctid
  AND a.house_id IS NOT NULL
  AND a.house_id = b.house_id
  AND a.date = b.date;

CREATE UNIQUE INDEX IF NOT EXISTS unique_house_date
  ON public.daily_pricing (house_id, date)
  WHERE house_id IS NOT NULL;
```

Damit funktioniert `ON CONFLICT (house_id, date)` in `update_dynamic_price` (Postgres erkennt einen partiellen Unique-Index, wenn das WHERE auf NOT NULL implizit erfüllt ist — dies ist hier der Fall, weil die Funktion immer `house_id` setzt).

### 2. Verifikation

- Pricing Dashboard öffnen → Datum wählen → Override speichern → Erfolgsmeldung statt Fehler.
- Kontrolle: Eintrag in `daily_pricing` existiert (insert) bzw. wurde aktualisiert (update).

## Nicht betroffen

- `monthly_pricing` (hat bereits `unique_house_checkin` und `unique_competitor_checkin`).
- `market_data_cache` (hat bereits `(location, date)`).
- `OwnPricingDialog`, `marketOccupancyService`, `expand-daily-prices`, `generate-guest-profile` — deren `onConflict`-Targets sind bereits durch passende Constraints gedeckt.

## Umfang

Eine einzige DB-Migration. Kein Code-Change im Frontend oder in Edge Functions nötig.
