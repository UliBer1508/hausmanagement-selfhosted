## Anpassung des Anthropic-Prompts an unsere Architektur

Der Prompt nutzt `properties` + `nightly_rates`. Wir haben bereits konsolidiert auf `houses` + `daily_pricing` mit allen Faktor-Spalten und der RPC `update_dynamic_price` (bereits gefixt). Plan setzt die noch fehlenden Schritte um — angepasst auf bestehende Tabellen.

### Was schon da ist (nicht nochmal bauen)
- `useDynamicPricing.ts` (Hook + Algorithmus)
- `PricingCard.tsx`
- `DynamicPricingPanel.tsx` in Gäste-App
- DB: `daily_pricing` mit allen Faktoren, `local_events`, `market_data_cache`, `pricing_logs`, RPC `update_dynamic_price`

### Neue Arbeit

**1. `src/services/marketOccupancyService.ts`**
- `estimateOccupancyFromSeason(date, location)` — saisonale Schätzung + Wochenend-/Feiertags-Boost (NRW), `avgPrice = 80 + occ*120`
- `fetchMarketData({ location, startDate, days, strategy, apiKey, forceRefresh })`:
  - 24h-Cache aus `market_data_cache` lesen
  - Strategy `airdna` → API call, sonst `estimated`
  - Upsert in `market_data_cache` (`onConflict: 'location,date'`)
- Hook `useMarketData(location, startDate, days)` → `{ data: Map, loading, error }`
- Strategy aus `import.meta.env.VITE_MARKET_STRATEGY` (default `estimated`)

**2. `src/services/pricingService.ts`** (angepasst auf `houses`/`daily_pricing`)
- Typen `NightlyRate`, `PropertyConfig`
- `getProperty(houseId)` — liest aus `houses` (basePrice aus `pricing_config.base_price` bzw. neuem Feld)
- `getRatesForRange(houseId, start, end)` — `daily_pricing`
- `overridePrice(houseId, date, finalPrice)` — UPDATE `daily_pricing.final_price`
- `markAsBooked(houseId, start, end)` — UPDATE `is_booked, booked_at`
- `getPricingHistory(houseId, date)` — `pricing_logs`
- `bulkUpdatePrices({ houseId, daysAhead=180, onProgress })`:
  1. Property + `local_events` + Marktdaten + gebuchte Tage laden
  2. Pro Tag: Lücken-Erkennung (Vortag/Folgetag gebucht), `calculateDynamicPrice()`, RPC `update_dynamic_price`
  3. Returns `{ updated, errors }`

**3. `src/components/Pricing/PricingDashboard.tsx`**
- Props `{ houseId, propertyName?, location? }`
- Header mit View-Toggle (Kalender/Liste) + "Preise neu berechnen"
- Progressbar während Bulk-Update, Erfolgs-Banner danach
- Status-Zeile (Marktdaten / Supabase)
- Kalender (Monat-Navigation, 7-Spalten Grid, Farbklassen nach `dynamic/base`-Ratio, blauer Punkt bei Marktdaten, vergangene Tage opacity-30)
- Detail-Panel bei Klick: Datum, dynamic/final Preis, Markt-Occupancy, alle 6 Faktoren farbig, Override-Input + Speichern
- Listenansicht: nächste 30 Tage, Status-Badges (Gebucht/Gesperrt/Manuell)
- Legende
- Mobile: horizontal scrollbar

**4. `src/pages/Pricing.tsx` + Route `/pricing`**
- Lädt erstes Haus (oder Auswahl-Dropdown aller `houses` mit `rental_type='tourist'`)
- In bestehende Sidebar/Navigation eintragen

**5. Edge Function `supabase/functions/daily-pricing/index.ts`**
- Cron-Secret-Auth
- Iteriert alle Tourist-`houses`, 180 Tage voraus
- Inline-Faktoren (Season/DOW/LeadTime/Occupancy/Event), ruft RPC `update_dynamic_price` auf
- Cron-Schedule via `supabase/config.toml`

**6. Voraussetzung Basispreis pro Haus**
- `houses.pricing_config` JSONB hat noch keinen klaren `base_price`. Migration: Lese-Helper im Service der `pricing_config.base_price` ausliest (Default 100). Optional UI in Haus-Settings für base/min/max später.

### Anpassungen vs. Anthropic-Prompt
- `properties` → `houses`, `nightly_rates` → `daily_pricing`, `property_id` → `house_id`
- Typen-Block in `types.ts` NICHT manuell editieren (wird von Supabase regeneriert)
- Edge Function nutzt `houses.pricing_config->>'base_price'` statt `properties.base_price`
- Tourist-Filter (`rental_type='tourist'`) global

### Reihenfolge der Umsetzung
1. `marketOccupancyService.ts`
2. `pricingService.ts`
3. `PricingDashboard.tsx` + Page + Route + Sidebar-Eintrag
4. Edge Function `daily-pricing` + Cron
5. ENV-Variablen-Hinweis an User (`VITE_MARKET_STRATEGY`, `CRON_SECRET`)
