

# PriceLabs fuer Ferienobjekte + Perplexity fuer Vermietungsobjekte

## Ueberblick
- **Ferienobjekte** (`rental_type = 'tourist'`): PriceLabs API fuer Wettbewerbsanalyse (Neighborhood Data, Preise, Listings)
- **Vermietungsobjekte** (`rental_type != 'tourist'`): Perplexity bleibt wie bisher (Mietpreisanalyse)

## PriceLabs API Endpoints (verifiziert via Postman Docs)

| Endpoint | Beschreibung |
|---|---|
| `GET /v1/listings` | Alle Listings (id, pms, name, min/base/max) |
| `GET /v1/listings/{id}` | Einzellisting mit Health-Score |
| `GET /v1/listings/{id}/neighborhood?pms=X` | Markt-/Wettbewerberdaten der Region |
| `GET /v1/listings/{id}/overrides?pms=X` | Tagespreise & Ueberschreibungen |
| `POST /v1/prices` | Preisempfehlungen abrufen |

Auth: `X-API-Key` Header

## Schritte

### 1. Secret `PRICELABS_API_KEY` hinzufuegen
User muss den API-Key aus dem PriceLabs Dashboard bereitstellen.

### 2. Neue Edge Function `pricelabs-sync`
Proxy zur PriceLabs API mit Aktionen:
- `list-listings` → `GET /v1/listings`
- `get-listing` → `GET /v1/listings/{id}` (mit Health-Score)
- `get-neighborhood` → `GET /v1/listings/{id}/neighborhood?pms=X`
- `get-prices` → `POST /v1/prices` (Preisempfehlungen)
- `get-overrides` → `GET /v1/listings/{id}/overrides?pms=X`

### 3. DB-Migration: `pricelabs_listings`
Mapping PriceLabs Listing-IDs zu lokalen Haeusern:
```text
pricelabs_listings:
  id UUID PK
  house_id FK → houses
  pricelabs_listing_id TEXT
  pms_name TEXT (airbnb, booking, etc.)
  listing_name TEXT
  base_price INTEGER
  min_price INTEGER
  max_price INTEGER
  health_score TEXT
  last_synced_at TIMESTAMPTZ
```

### 4. DB-Migration: `pricelabs_market_data`
Cache fuer Neighborhood-Daten:
```text
pricelabs_market_data:
  id UUID PK
  house_id FK → houses
  pricelabs_listing_id TEXT
  data_date DATE
  neighborhood_data JSONB (komplettes Neighborhood-Response)
  fetched_at TIMESTAMPTZ
```

### 5. React Hook `usePriceLabs`
- `usePriceLabsListings()` — alle PriceLabs-Listings laden
- `useLinkListing(house_id, pricelabs_listing_id, pms)` — Listing einem Haus zuordnen
- `useSyncNeighborhood(listing_id, pms)` — Marktdaten abrufen
- `usePriceLabsMarketData(house_id)` — gecachte Marktdaten lesen

### 6. UI: Neuer Tab "PriceLabs" im CompetitorAnalysisDashboard
Nur sichtbar fuer Haeuser mit `rental_type = 'tourist'`:
- **Listing-Verknuepfung**: Dropdown um PriceLabs-Listings einem Haus zuzuordnen
- **Marktdaten-Dashboard**: Neighborhood Data (Auslastung, Durchschnittspreise, Comp-Set)
- **Tagespreise**: Overrides/Preisempfehlungen als Tabelle
- **Sync-Button**: Manuelles Aktualisieren mit Zeitstempel

### 7. Routing-Logik im Dashboard
`CompetitorAnalysisDashboard` erhaelt den `rental_type` als Prop:
- `tourist` → PriceLabs-Tab wird angezeigt, ScrapePricesDialog/CompetitorSearchDialog werden ausgeblendet
- `tenant` → Perplexity-basierte Suche bleibt wie bisher (ScrapePricesDialog, CompetitorSearchDialog)

### 8. Bestehende Komponenten
Bleiben alle erhalten:
- `CompetitorCard`, `ManualCompetitorDialog`, `OwnPricingDialog`, `AdditionalFeesDialog`
- `PriceComparisonTable`, `PriceComparisonChart`, `CompetitorPriceHistoryList`
- `ScrapePricesDialog`, `CompetitorSearchDialog` — nur noch fuer Vermietungsobjekte sichtbar

## Voraussetzung
PriceLabs API-Key aus dem PriceLabs Dashboard (Settings → API). Wird als Secret gespeichert.

