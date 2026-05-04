## Ergebnis der Untersuchung

Die Tabellen- und Spaltennamen passen.

Betroffene Stellen:
- `public.update_dynamic_price` schreibt in `public.daily_pricing`
- verwendete Spalten dort: `house_id`, `date`, `price`, `dynamic_price`, `factor_*`, `market_*`
- Frontend ruft korrekt die RPC `update_dynamic_price` auf (`PricingDashboard`, `DynamicPricingPanel`)
- `monthly_pricing` ist hier sehr wahrscheinlich **nicht** die Ursache für genau diese Fehlermeldung

## Eigentliche Ursache

In der Datenbank existiert aktuell auf `daily_pricing`:
- `unique_competitor_date` auf `(competitor_property_id, date)`
- `unique_house_date` als **partieller** Unique-Index auf `(house_id, date) WHERE house_id IS NOT NULL`

Die RPC-Funktion verwendet aber derzeit:

```sql
ON CONFLICT (house_id, date) DO UPDATE
```

Das passt nicht sauber zum partiellen Index. Bei PostgreSQL muss bei Inferenz eines partiellen Unique-Index die Predicate-Bedingung mit angegeben werden. Sonst kommt genau der Fehler:

```text
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

## Plan zur Behebung

1. Migration erstellen, die `public.update_dynamic_price` neu definiert.
2. In der Funktion das Upsert ändern auf:

```sql
ON CONFLICT (house_id, date) WHERE house_id IS NOT NULL DO UPDATE
```

3. Danach die Speicherung im Pricing Dashboard erneut prüfen.
4. Optional zusätzlich einen kurzen DB-Check machen, dass keine zweite alte Funktionssignatur oder ein veralteter Call im Projekt übrig ist.

## Technische Details

Minimaler Fix in der Funktion:

```sql
INSERT INTO public.daily_pricing (...)
VALUES (...)
ON CONFLICT (house_id, date) WHERE house_id IS NOT NULL DO UPDATE SET
  ...
```

Warum das der richtige Fix ist:
- `daily_pricing.house_id` und `daily_pricing.date` existieren korrekt
- der Unique-Index `unique_house_date` existiert ebenfalls
- nur das `ON CONFLICT`-Target ist nicht präzise genug für den **partiellen** Index
- dadurch ist kein Frontend-Änderung notwendig

## Erwartetes Ergebnis nach Fix

- Speichern im Pricing Dashboard funktioniert wieder
- `bulkUpdatePrices()` und manuelle Preisannahme über die RPC laufen ohne diesen Postgres-Fehler
- bestehende Datenstruktur kann unverändert bleiben

Wenn du freigibst, setze ich genau diese Funktionsanpassung per Migration um.