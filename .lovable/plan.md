## Problem

`MONTHLY_OCC` (12 monatliche Occupancy-Werte) ist dreifach hardcoded in:
- `src/services/marketOccupancyService.ts`
- `supabase/functions/airroi-sync/index.ts`
- `supabase/functions/import-inside-airbnb/index.ts`

Über die UI (`PricingFactorsConfig`) wird stattdessen `season_factors` (12 Werte, normiert um ~1.0) in `system_settings.pricing_config` gespeichert. Änderungen wirken nur im Pricing-Engine, aber nicht in den drei o.g. Stellen → Marktdaten-Cache und Schätzung verwenden veraltete Verteilung.

Die `airroi-sync` Edge Function liest bereits `pricing_config` (für die AirROI-Filter), nutzt aber dann trotzdem die hardcoded `MONTHLY_OCC` für die monatliche Skalierung.

## Lösung

Single Source of Truth: `season_factors` aus `system_settings.pricing_config` als monatliche Verteilungs-Gewichte nutzen. Da beide Konzepte als **Verhältnis zum Monatsmittel** verwendet werden (`MONTHLY_OCC[m] / mean`), sind die Werte mathematisch austauschbar — die absolute Höhe spielt keine Rolle, nur die relative Form.

### Änderungen

**1. `supabase/functions/airroi-sync/index.ts`**
- `MONTHLY_OCC` Konstante entfernen.
- `DEFAULT_AIRROI_CONFIG` um `season_factors` ergänzen (Default-Array aus `usePricingSettings.ts` spiegeln).
- `season_factors` aus dem bereits geladenen `cfg` lesen, mit Fallback auf Default-Array (Länge 12 prüfen).
- Skalierung: `factor[m] = season_factors[m] / mean(season_factors)`, dann `occ = baseOcc * factor[m]` (Logik bleibt identisch).

**2. `supabase/functions/import-inside-airbnb/index.ts`**
- `MONTHLY_OCC` Konstante entfernen.
- `system_settings.pricing_config` laden (wie airroi-sync), `season_factors` extrahieren mit Fallback auf Default.
- Gleiche Ratio-Berechnung verwenden.

**3. `src/services/marketOccupancyService.ts`**
- `MONTHLY_OCC` Konstante entfernen.
- `estimateOccupancyFromSeason` erhält optionalen Parameter `seasonFactors?: number[]` (Default = aus `DEFAULT_PRICING_CONFIG.season_factors` importiert).
- Da `season_factors` um 1.0 normiert sind (nicht 0–1 wie früher), Berechnung umstellen auf:
  `occ = BASE_OCC * (season_factors[m] / mean(season_factors))` mit `BASE_OCC = 0.6`.
- Aufrufer von `estimateOccupancyFromSeason` (in derselben Datei, ~Zeile 188–210) liest `pricing_config` einmalig per direktem Supabase-Query und übergibt `season_factors`.

### Default-Array (geteilt)

```ts
// Spiegel aus DEFAULT_PRICING_CONFIG.season_factors
const DEFAULT_SEASON_FACTORS = [0.75, 0.78, 0.90, 1.00, 1.10, 1.25, 1.50, 1.55, 1.20, 0.95, 0.80, 1.10];
```

Wird in beiden Edge Functions als Fallback eingebettet (Edge Functions können nicht aus `src/` importieren).

### Vorteile

- UI-Änderungen an Saisonalität wirken ab sofort auf AirROI-Sync, Inside-Airbnb-Import und Frontend-Schätzung.
- Keine doppelte Wartung von 12 Monatswerten.
- Verhalten bleibt rückwärtskompatibel, solange `pricing_config` existiert (sonst Default).
