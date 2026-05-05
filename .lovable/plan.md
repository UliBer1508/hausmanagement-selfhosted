
## Ziel
Algorithmus-Parameter (AirROI-Filter + dynamisches Pricing) zentral konfigurierbar machen über `system_settings` (key `pricing_config`). UI wird in die bestehende `PricingFactorsConfig`-Sektion integriert (kein neuer Settings-Tab).

## Wichtiger Hinweis: Konflikt mit Bestehendem
Es existiert bereits eine **per-Haus** Konfiguration (`houses.pricing_config.factors`) mit anderem Schema, die von `pricing-engine`/`daily-pricing` Edge Functions gelesen wird. Der neue Hook arbeitet mit einem **globalen** Schema in `system_settings.pricing_config`. Diese koexistieren:

- `useDynamicPricing` (rein clientseitiger Algorithmus laut Spec) → liest **global** aus `system_settings`
- `pricing-engine`/`daily-pricing` Edge Functions (per-Haus Smart-Berechnung) → bleiben unverändert
- `PricingFactorsConfig`-Komponente steuert weiterhin die per-Haus Faktoren; **zusätzlich** wird sie um eine globale Sektion für AirROI + Algorithmus-Defaults erweitert

## Umsetzung

### 1. Neuer Hook `src/hooks/usePricingSettings.ts`
- `DEFAULT_PRICING_CONFIG` Konstante (exakt wie in deiner Spec)
- `usePricingSettings()` – `useQuery` mit `queryKey: ['system_settings','pricing_config']`, liest `system_settings` Eintrag `key='pricing_config'`, fällt auf Defaults zurück, mergt mit Defaults für fehlende Felder
- `useSavePricingSettings()` – `useMutation`, upsert mit `onConflict: 'key'`, danach Invalidierung

### 2. `useDynamicPricing.ts` anpassen (rückwärtskompatibel)
- Faktor-Funktionen `getSeasonFactor`, `getDayOfWeekFactor`, `getLeadTimeFactor`, `getOccupancyFactor`, `getEventFactor`, `getGapFactor` bekommen optionalen Parameter `config?: typeof DEFAULT_PRICING_CONFIG`
- Wenn `config` übergeben → benutzt Werte aus Config
- `calculateDynamicPrice(input, config?)` reicht Config durch und nutzt `price_floor_ratio` / `price_ceiling_ratio`
- `useDynamicPricing(input)` ruft intern `usePricingSettings()` auf, übergibt geladene Config; Default-Verhalten unverändert solange noch keine DB-Werte vorhanden sind

### 3. `airroi-sync` Edge Function
- Liest vor API-Call `system_settings` mit `key='pricing_config'`
- Konstantes `DEFAULT_PRICING_CONFIG`-Objekt in der Function dupliziert (Fallback)
- AirROI-Request-URLs erweitert um Query-Params: `room_type`, `min_bedrooms`, `num_months`, `currency`
- Bestehende Logik (Suche → Analytics → 365-Tage-Cache) bleibt

### 4. UI – Integration in `PricingFactorsConfig.tsx`
**Keine** neue Settings-Seite. Stattdessen wird die bestehende Komponente erweitert:

- Neue, deutlich abgesetzte **Sektion oben** im Collapsible: "Globale Pricing-Konfiguration (alle Häuser)" mit zwei Untergruppen:
  - **AirROI Filter**: Dropdown Zimmertyp / Number Mindest-Schlafzimmer / Dropdown Analysezeitraum / Dropdown Währung
  - **Preisalgorithmus**: 
    - 12 Number-Inputs für `season_factors` (Monatsnamen, step 0.05)
    - 7 Number-Inputs für `dow_factors` (So–Sa, step 0.05)
    - Editierbare Tabelle für `lead_time_steps` (Schwellwert/Faktor + Add/Remove)
    - Editierbare Tabelle für `occupancy_steps` (Schwellwert/Faktor + Add/Remove)
    - Number-Inputs: `event_factor_small/large/festival`, `gap_factor_1day/2days/3plus`, `price_floor_ratio`, `price_ceiling_ratio`
- Eigene Buttons "Standard zurücksetzen" (lädt nur ins Form, speichert nicht) und "Speichern" (ruft `useSavePricingSettings`, Toast)
- Während Save: alle Felder + Buttons disabled
- Bestehende per-Haus Faktoren-Sektion bleibt darunter unverändert

### 5. Datenbank
Keine Migration nötig – `system_settings` existiert. Defaults werden beim ersten Speichern angelegt (kein Seed nötig).

## Dateien
- **Neu**: `src/hooks/usePricingSettings.ts`
- **Geändert**: `src/hooks/useDynamicPricing.ts`, `src/components/Pricing/PricingFactorsConfig.tsx`, `supabase/functions/airroi-sync/index.ts`
- **Unberührt**: `usePricingConfig.ts` (per-Haus Markup/Fees), `pricing-engine`, `daily-pricing`

## Frage vor Umsetzung
Soll die globale Sektion **innerhalb** des bestehenden Collapsible ("Preis-Faktoren konfigurieren") als zusätzlicher Accordion-Eintrag erscheinen, oder als **eigene Karte direkt darüber** auf der Pricing-Seite? Ich tendiere zu eigener Karte (klarere Trennung global vs. per-Haus), würde es aber auch im Akkordion einbauen wenn du es so willst.
