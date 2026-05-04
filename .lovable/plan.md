# Dynamic Pricing (PriceLabs-Style) im Gäste-Management

Die hochgeladenen Dateien enthalten einen sauberen, in sich geschlossenen Preisalgorithmus. Ich baue beides exakt wie gewünscht ein und ersetze den "App Tracking"-Tab im Gäste-Management durch eine neue Preis-Ansicht.

## Was eingebaut wird

### 1. Hook (unverändert übernommen)
- Datei: `src/hooks/useDynamicPricing.ts`
- Inhalt 1:1 aus `useDynamicPricing.ts.txt` (Faktoren Saisonalität, Wochentag, Lead-Time, Marktauslastung, Event, Gap; Buchungswahrscheinlichkeit; Strategie + Tags)
- Pure Logik, keine DB-Aufrufe, keine Abhängigkeiten

### 2. Komponente `PricingCard`
- Datei: `src/components/PricingCard.tsx`
- Props laut Upload:
  - `basePrice: number`
  - `checkInDate: Date`
  - `marketOccupancy: number` (0–1)
  - `onPriceAccepted?: (price: number) => void`
  - optional: `hasLocalEvent`, `eventSize`, `isGapDay`, `gapLength`, `houseId`
- Nutzt intern `useDynamicPricing` und zeigt:
  - Empfohlener Preis (groß) + Min/Max-Range
  - Strategie-Badge (`last-minute` / `standard` / `far-out`)
  - Faktor-Breakdown (Saisonalität, Wochentag, Lead-Time, Auslastung, Event, Gap) als kleine Pills mit Multiplikator
  - Buchungswahrscheinlichkeit als Progress-Bar
  - Tags (Hochsaison, Event, Lückenoptimierung …)
  - Button **"Preis übernehmen"** → ruft `onPriceAccepted(recommendedPrice)`
  - Slider zum manuellen Override innerhalb Min/Max

### 3. Neue Tab-Ansicht im Gäste-Management
- Datei: `src/components/Guests/DynamicPricingPanel.tsx` (neu)
- Ersetzt im `GuestManagement.tsx` den Tab `tracking` (📱 App Tracking → 💶 Dynamic Pricing)
- Inhalt:
  1. **Haus-Auswahl** (Dropdown via `useHouses`, gefiltert auf `rental_type = 'tourist'` gemäß Core-Regel)
  2. **Datums-Picker** (Check-in-Datum)
  3. **Markt-Auslastungs-Eingabe**: Default = automatisch berechnet aus eigenen `bookings` für gewähltes Datum ±14 Tage über alle Häuser; manueller Slider zum Übersteuern
  4. **Event-Toggle** + Größe (small/large/festival) — manuell, optional später aus `local_events`/Holiday-Kalender (`src/lib/holidayCalendar.ts` existiert bereits)
  5. **Gap-Day-Erkennung**: prüft, ob am Tag davor/danach eine Buchung im gewählten Haus liegt, ohne dass der Tag selbst belegt ist → setzt `isGapDay` automatisch
  6. **`<PricingCard>`** mit den ermittelten Eingaben
  7. **"Preis übernehmen"** speichert in der bereits vorhandenen `daily_prices`-Tabelle (siehe Migrations) für `(house_id, date)` → `price` per upsert
- Darunter: kleine 14-Tage-Vorschau-Tabelle mit empfohlenem Preis pro Tag (gleiche Logik in Schleife)

### 4. Anpassungen `GuestManagement.tsx`
- Import `GuestAppTracking` entfernen, `DynamicPricingPanel` importieren
- TabTrigger `tracking`: Icon `💶`, Label `Pricing`
- TabsContent: `<DynamicPricingPanel />` statt `<GuestAppTracking>`
- `GuestAppTracking.tsx` bleibt im Repo (wird nur nicht mehr referenziert) — keine Datei-Löschung nötig

## Datenquellen

| Eingabe | Quelle |
|---|---|
| `basePrice` | Aus `houses.base_price` falls vorhanden, sonst manueller Default 120 € |
| `marketOccupancy` | Berechnung: belegte Nächte / verfügbare Nächte im ±14-Tage-Fenster über alle Tourist-Häuser, aus `bookings` (status confirmed/checked_in) |
| `isGapDay` / `gapLength` | Direktabfrage `bookings` für gewähltes `house_id` |
| Persistenz Preisübernahme | Upsert in `daily_prices(house_id, date, price)` |

## Außerhalb des Scopes
- Keine Edge-Function nötig (Logik läuft im Browser)
- Keine Schema-Änderungen
- Keine Auth-/Rollen-Änderungen
- Holiday-/Event-Auto-Erkennung nur als Stub, kann später an `holidayCalendar.ts` angeschlossen werden

## Dateien (Zusammenfassung)

| Aktion | Pfad |
|---|---|
| Neu | `src/hooks/useDynamicPricing.ts` |
| Neu | `src/components/PricingCard.tsx` |
| Neu | `src/components/Guests/DynamicPricingPanel.tsx` |
| Edit | `src/components/Guests/GuestManagement.tsx` (Tab ersetzen) |
