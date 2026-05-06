## Ziel

Im normalen Bulk-Update soll der Mindest-/Höchstpreis nicht mehr aus dem fixen `pricing_config.min_price`/`max_price` der Unterkunft kommen, sondern täglich dynamisch aus `basePrice × price_floor_ratio` bzw. `× price_ceiling_ratio` berechnet werden — exakt das, was `calculateDynamicPrice` intern bereits tut, sofern man `customMin`/`customMax` weglässt.

## Änderung

**Datei:** `src/services/pricingService.ts`, Funktion `bulkUpdatePrices`

Im Aufruf von `calculateDynamicPrice` (aktuell Zeilen 214–224) die beiden Felder entfernen:

```ts
const result = calculateDynamicPrice({
  basePrice: property.basePrice,
  checkInDate: d,
  marketOccupancy: occ,
  hasLocalEvent: !!eventSize,
  eventSize,
  isGapDay,
  gapLength,
  // minPrice / maxPrice bewusst NICHT übergeben:
  // calculateDynamicPrice nutzt dann price_floor_ratio / price_ceiling_ratio
  // aus der PricingConfig → Mindestpreis variiert täglich mit Basispreis.
});
```

## Bewusst nicht geändert

- `PropertyConfig.minPrice` / `maxPrice` und `getProperty` bleiben unverändert — andere Aufrufer (z. B. explizite Overrides in der UI) können `calculateDynamicPrice` weiterhin mit absoluten Min/Max aufrufen.
- `bulkUpdatePricesV2` (Edge-Function-Pfad) bleibt unverändert.
- `calculateDynamicPrice` selbst bleibt unverändert.

## Verifikation

Ein kurzer Blick in `src/hooks/useDynamicPricing.ts` bestätigen, dass ohne `minPrice`/`maxPrice` tatsächlich `price_floor_ratio` / `price_ceiling_ratio` aus der `PricingConfig` als Fallback greifen — falls dort die Logik anders ist, muss der Aufruf entsprechend angepasst werden, damit der dynamische Floor sicher angewendet wird.