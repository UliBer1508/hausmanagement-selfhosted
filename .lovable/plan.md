## Ziel
AirDNA als zentrale Marktdaten-Quelle integrieren, PriceLabs als aktive Datenquelle für die dynamische Preislogik ablösen. Die bestehende PriceLabs-Infrastruktur bleibt vorerst im Code (deaktiviert/optional), damit nichts bricht; alle Pricing-Flows nutzen ab sofort AirDNA.

## Architektur-Entscheidung
- **AirDNA** liefert: Occupancy-Rate, ADR (Average Daily Rate), MarketScore pro Standort/Datum.
- Aufrufe ausschließlich **server-side** über eine neue Edge Function (`airdna-sync`) mit `AIRDNA_API_KEY` als Secret. Kein `VITE_AIRDNA_API_KEY` mehr im Frontend (Sicherheits-Fix).
- Ergebnisse werden in `market_data_cache` (vorhanden) mit `source='airdna'` und 24h-TTL persistiert.
- Daily-Cron (`daily-pricing`) ruft vor der Preisberechnung `airdna-sync` für jedes Tourist-Haus auf, danach läuft die bestehende Faktor-Logik (Season/DOW/LeadTime/Occupancy/Event/Gap) gegen die AirDNA-Werte.

## Änderungen im Detail

### 1. Neue Edge Function `supabase/functions/airdna-sync/index.ts`
- Actions:
  - `fetch-market` → `{ location, startDate, days }` → ruft AirDNA Market Stats API, normalisiert auf `{date, occupancyRate, avgPrice, source:'airdna'}`, upsert in `market_data_cache`.
  - `link-property` → speichert AirDNA `property_id`/`market_id` pro Haus (siehe DB unten).
  - `get-comp-set` → optional: Comp-Set/Neighborhood-Daten für Analyse-UI.
- Auth: `getClaims()` für interaktive Calls; Cron-Aufruf via `CRON_SECRET` Header.
- Fehlerbehandlung: Bei AirDNA-Fehler/Quota → Fallback `estimateOccupancyFromSeason` + `source='estimated'`, damit Pricing nie blockiert.

### 2. Secret hinzufügen
- `AIRDNA_API_KEY` (Runtime-Secret, via add_secret).
- `VITE_AIRDNA_API_KEY` aus Code/Doku entfernen.

### 3. DB-Migration
Neue Tabelle `airdna_listings` analog zu `pricelabs_listings`:
```
id uuid pk, house_id uuid fk houses, airdna_property_id text,
airdna_market_id text, location_normalized text,
last_synced_at timestamptz, raw jsonb
unique(house_id, airdna_property_id)
```
Kein Schema-Change an `market_data_cache` nötig (nutzt `source`-Spalte).

### 4. Service-Layer Refactor
- `src/services/marketOccupancyService.ts`:
  - `fetchMarketData()` ruft nicht mehr direkt `api.airdna.co` aus dem Browser, sondern `supabase.functions.invoke('airdna-sync', { body:{ action:'fetch-market', ... }})`.
  - `useMarketData()` Strategy-Default → `'airdna'`. Fallback auf `'estimated'` wenn Edge Function Fehler/leer liefert.
- `src/services/pricingService.ts`: Location-Key normalisieren (Stadt+PLZ statt voller Adresse) → konsistente Cache-Hits.

### 5. `daily-pricing` Edge Function
- Vor der 180-Tage-Schleife pro Haus: einmaliger Aufruf `airdna-sync action:fetch-market` (ein Batch-Request statt 180 Single-Reads).
- Lese-Pfad gegen `market_data_cache` bleibt gleich.
- Fallback bei fehlenden Daten → `estimateOccupancyFromSeason`.

### 6. UI
- Neue Karte in `PricingDashboard.tsx`: "Marktdaten-Quelle: AirDNA · zuletzt aktualisiert …" + Button "Marktdaten jetzt aktualisieren" (ruft `airdna-sync`).
- Haus-Settings: Feld "AirDNA Property/Market verknüpfen" (Dropdown nach Suche, schreibt `airdna_listings`).
- PriceLabs-UI bleibt erhalten, wird aber als "Legacy/optional" gekennzeichnet (kein aktiver Pricing-Einfluss).

### 7. PriceLabs-Deaktivierung (nicht löschen)
- `usePriceLabs.ts`, `pricelabs-sync` Edge Function bleiben.
- Hinweis in `.lovable/plan.md` + Memory: AirDNA ist primär; PriceLabs nur Read-only Referenz.

### 8. Cron
- Bestehender 03:00-Cron (sofern noch nicht aktiv) ergänzen: zuerst `airdna-sync` für alle Tourist-Häuser, dann `daily-pricing`. Alternativ in `daily-pricing` integriert (siehe 5).

## Reihenfolge der Umsetzung
1. `AIRDNA_API_KEY` Secret anlegen.
2. Migration `airdna_listings` + Index auf `market_data_cache(location,date)` prüfen.
3. Edge Function `airdna-sync` implementieren + deployen + testen via curl.
4. `marketOccupancyService.ts` auf Invoke umbauen, `VITE_AIRDNA_API_KEY` entfernen.
5. `daily-pricing` anpassen (Batch-Fetch + Fallback).
6. UI: AirDNA-Status-Karte + Verknüpfungs-Dialog im Haus-Settings/PricingDashboard.
7. Cron registrieren (pg_cron, 03:00).
8. Memory aktualisieren: "AirDNA als primäre Marktdatenquelle, PriceLabs Legacy".

## Offene Frage an dich
Brauchst du den AirDNA **MarketMinder** (aggregierte Marktdaten pro PLZ/Region) oder **Rentalizer/Comp-Set** (objektgenaue Vergleichsdaten)? Die API-Endpunkte unterscheiden sich — MarketMinder reicht für Occupancy/ADR der Pricing-Logik, Rentalizer wäre nur für die Wettbewerbsanalyse-UI nötig.
