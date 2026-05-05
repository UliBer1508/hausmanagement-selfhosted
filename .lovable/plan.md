## Ziel
Vier strukturierte Markt-Felder (Land/Region/Ort/Stadtteil) als Teil der AirROI-Konfiguration einführen, persistent in `system_settings.pricing_config` speichern und in der `airroi-sync` Edge Function direkt an die AirROI Markets API übergeben — ohne `/markets/search`-Lookup.

## Änderungen

### 1. `src/hooks/usePricingSettings.ts`
`DEFAULT_PRICING_CONFIG` um vier Felder erweitern:
```ts
airroi_country: 'Austria',
airroi_region: 'Salzburg',
airroi_locality: 'Neukirchen am Großvenediger',
airroi_district: '',
```

### 2. `src/components/Pricing/PricingFactorsConfig.tsx`
In der „Datenquellen (AirROI Marktdaten)"-Sektion **vor** den bestehenden vier Filtern (Zimmertyp, Schlafzimmer, Zeitraum, Währung) einen neuen Block „Marktdefinition" einfügen mit:
- **Land** (Input, Pflicht) → `airroi_country`
- **Region** (Input, Pflicht) → `airroi_region`
- **Ort/Markt** (Input, Pflicht) → `airroi_locality`
- **Stadtteil/Gebiet** (Input, optional, Placeholder „Optional – z.B. Pinzgau") → `airroi_district`

Hinweistext darunter:  
> „Diese Werte werden direkt an die AirROI Markets API übergeben. Nutze übergeordnete Regionen (z.B. 'Salzburg' statt 'Neukirchen') für bessere Ergebnisse — kleine Orte haben oft zu wenige Listings für aussagekräftige Marktdaten."

State-Erweiterung: vier Felder zum `airroi`-State hinzufügen, im `useEffect` aus `globalCfg` initialisieren, in `handleSave` zusammen mit den anderen AirROI-Werten speichern, in `handleReset` auf Defaults zurücksetzen.

`MarketDataImportCard` bleibt erhalten (Inside-Airbnb-Import + manueller AirROI-Sync-Button), aber das dortige Standort-Textfeld wird obsolet — es wird intern aus `airroi_locality` gespeist (nicht mehr editierbar oder ganz entfernt).

### 3. `src/components/Settings/MarketDataImportCard.tsx`
- Standort-Input und automatische Voreinstellung aus `houses` entfernen.
- Stattdessen `airroi_locality` aus `usePricingSettings()` lesen und als impliziten `location`-Schlüssel verwenden (für Cache-Lookup `lastAirroiSync` und für `import-inside-airbnb` Aufruf).
- AirROI-Sync-Button ruft `useSyncAirROI` ohne `location` auf — die Edge Function liest die Marktdefinition selbst aus `system_settings`.
- Hinweis: Der Inside-Airbnb-CSV-Pfad braucht weiterhin einen `location`-String für `market_data_cache`; hierfür `airroi_locality` als Schlüssel verwenden.

### 4. `src/hooks/useAirROI.ts`
`SyncAirROIInput.location` optional machen (Edge Function liest jetzt selbst). Body kann leer übergeben werden.

### 5. `src/services/marketOccupancyService.ts`
Beim `strategy === 'airroi'`-Pfad keinen `location`-Parameter mehr an `airroi-sync` übergeben (Edge Function nutzt Settings). Der lokale `location`-String bleibt für `market_data_cache`-Lookups bestehen, sollte aber idealerweise mit `airroi_locality` aus den Settings synchron sein.

### 6. `supabase/functions/airroi-sync/index.ts`
- `BodySchema`: `location` optional, `house_id` optional.
- Aus `system_settings.pricing_config` zusätzlich `airroi_country`, `airroi_region`, `airroi_locality`, `airroi_district` lesen (Defaults: Austria/Salzburg/Neukirchen am Großvenediger/'').
- Validierung: country, region, locality müssen nicht leer sein → sonst 400.
- **`/markets/search`-Aufruf entfernen.** Stattdessen direkt das `market`-Objekt für die AirROI Markets API nutzen.
- Markt-Aufruf so umbauen, dass er die Marktdefinition als Parameter sendet — entsprechend AirROI-API per POST/Query mit `country`, `region`, `locality` und (falls nicht-leer) `district`.
- `location`-Wert für die `market_data_cache`-Zeilen: `airroi_locality` (oder `district` wenn vorhanden) als Schlüssel verwenden, damit Frontend-Lookups konsistent bleiben.
- Antwort enthält weiter `days_written`, `base_occupancy`, `base_adr` (statt `market_id` ggf. die verwendete Marktdefinition zurückgeben).

## Hinweise
- AirROI Markets API erwartet die Markt-Hierarchie als Objekt (country/region/locality/district). Da der genaue Endpoint unklar ist, prüfe ich beim Implementieren die AirROI-Doku-Konvention; falls die API weiterhin eine `market_id` braucht, wird die Identifikation über die vier Felder serverseitig in einen Lookup umgesetzt — der Aufruf ist aber transparent für den User, der nur die vier Felder konfiguriert.
- Da Default-Region jetzt fest auf Pinzgau/Salzburg steht, fragt AirROI keine globalen Daten mehr ab.
