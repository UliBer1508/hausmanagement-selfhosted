## Ziel
CSV-Daten von Inside Airbnb importieren, in markttägliche Auslastung umrechnen und für 365 Tage in `market_data_cache` (Quelle `inside_airbnb`) ablegen. UI-Trigger in der Settings-Seite.

## 1. Neue Edge Function: `supabase/functions/import-inside-airbnb/index.ts`

- **Auth/CORS**: Standard-CORS-Header, OPTIONS-Handler. Verwendet `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Service Role, da Massen-Upsert in Cache).
- **Input-Validierung** mit Zod: `{ location: string (min 1), csv_content: string (min 10) }`. 400 bei Validierungsfehler.
- **CSV-Parser** (eigene minimale Implementierung):
  - Header-Zeile parsen, Spaltenindex für `availability_365`, `room_type`, `number_of_reviews`, `minimum_nights` ermitteln.
  - Zeilen quoting-aware splitten (Inside-Airbnb-CSVs enthalten Kommas in Strings).
  - Zeilen ohne valides `availability_365` (NaN, <0, >365) verwerfen.
  - Optional Filter: `room_type === 'Entire home/apt'` und `number_of_reviews >= 1` (typische Aktiv-Listings).
- **Basis-Auslastung**: `baseOccupancy = mean( (365 - availability_365) / 365 )` über alle gefilterten Listings. Clamp auf [0.05, 0.95].
- **Saisonale Verteilung** mit identischer `MONTHLY_OCC`-Konstante wie `marketOccupancyService.ts` (0:0.38 … 11:0.55). Mittelwert der Tabelle berechnen, dann `factor[m] = MONTHLY_OCC[m] / mean(MONTHLY_OCC)`.
- **Tägliche Werte erzeugen**: Schleife über die nächsten 365 Tage ab heute (UTC, ISO-Date):
  - `occ = clamp(baseOccupancy * factor[date.getMonth()], 0.05, 0.95)`
  - `avgPrice = round(80 + occ * 120)` (konsistent mit Service)
  - Datensatz `{ location, date, occupancy_rate, avg_price: avgPrice, source: 'inside_airbnb', fetched_at: now }`
- **Upsert** in Batches von 500 Zeilen via `supabase.from('market_data_cache').upsert(rows, { onConflict: 'location,date' })`.
- **Response**: `{ success: true, imported_listings: n, days_written: 365, base_occupancy: x }`.
- Fehler werden mit 500 + Message zurückgegeben (inkl. corsHeaders).
- `supabase/config.toml`: kein Eintrag nötig (Default `verify_jwt = false` bei Lovable).

## 2. UI: neue Datei `src/components/Settings/MarketDataImportCard.tsx`

- Card mit Titel „Marktdaten-Import" + Untertitel „Inside Airbnb".
- Felder:
  - `Input` Standort (vorausgefüllt mit `houses[0].address` bzw. `houses[0].name` falls keine Adresse vorhanden, geladen via `supabase.from('houses').select('name,address').limit(1)` in `useEffect`).
  - `Textarea` für CSV-Inhalt (min Höhe ~200px, Monospace).
  - `Button` „Inside Airbnb Daten importieren".
- Logik:
  - On click: Validierung (location + CSV nicht leer), `setLoading(true)`, `toast.loading('Import läuft…')` (mit ID).
  - Aufruf: `supabase.functions.invoke('import-inside-airbnb', { body: { location, csv_content } })`.
  - Erfolg: `toast.success(\`Import erfolgreich: \${imported_listings} Listings, \${days_written} Tage geschrieben (Basis-Auslastung \${(base_occupancy*100).toFixed(1)}%)\`)`.
  - Fehler: `toast.error(error.message)`.
- Verwendet bestehenden Client `@/integrations/supabase/client`, `sonner` toasts, shadcn Card/Input/Textarea/Button/Label.

## 3. Einbindung
- `src/components/Dashboard/SettingsTab.tsx`: Import + Render `<MarketDataImportCard />` direkt unter `<GuestImportCard />`.

## Hinweise / Nicht-Änderungen
- `market_data_cache`-Schema bleibt unverändert (Spalten location, date, occupancy_rate, avg_price, source, fetched_at; Conflict-Key location+date) — keine Migration nötig.
- `marketOccupancyService.ts` bleibt unverändert; eingespielte `inside_airbnb`-Zeilen werden automatisch über den vorhandenen Cache-Read genutzt (24h TTL).
- Keine neuen Secrets erforderlich.
