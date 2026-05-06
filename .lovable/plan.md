# AirROI Sync sauber von Marktdaten-Import trennen

## Problem
Im Bereich „Marktdaten-Import" steht aktuell der Button **„AirROI Sync"** mit Status-Anzeige (`MarketDataImportCard.tsx`). Inhaltlich gehört der Sync aber zum Bereich **„Datenquellen (AirROI Marktdaten)"**, wo bereits alle AirROI-Filter (Land/Region/Ort/Stadtteil, Zimmertyp, Schlafzimmer, Zeitraum, Währung) konfiguriert werden. Der Marktdaten-Import soll ausschließlich Inside-Airbnb-CSV verarbeiten.

Aktueller Aufbau in `PricingFactorsConfig.tsx`:
- Accordion „Datenquellen (AirROI Marktdaten)" → nur Filter
- Accordion „Marktdaten-Import (Inside Airbnb / AirROI Sync)" → CSV + AirROI-Sync-Button

## Lösung

### 1. `MarketDataImportCard.tsx` aufräumen
- AirROI-Sync-Button, „Letzter Sync"-Anzeige, `useSyncAirROI`-Hook und zugehörigen `useEffect` für `lastAirroiSync` entfernen.
- Card-Titel/Beschreibung auf reinen Inside-Airbnb-Import umstellen („Inside Airbnb CSV-Import" statt „Inside Airbnb CSV oder AirROI API").
- Imports `RefreshCw`, `useSyncAirROI` entfernen.

### 2. Neue `AirROISyncCard.tsx` (`src/components/Settings/`)
- Zeigt Sync-Button + „Letzter Sync"-Timestamp + aktuell verwendete Marktregion.
- Nutzt `useSyncAirROI`, liest letzten Sync analog zur bisherigen Logik aus `market_data_cache`.
- Kompakt — keine doppelten Filter (die stehen bereits im selben Accordion).

### 3. `PricingFactorsConfig.tsx` umbauen
- Accordion „Datenquellen (AirROI Marktdaten)": am Ende (nach Filter-Grid) `<AirROISyncCard />` einbinden.
- Accordion umbenennen: „Marktdaten-Import (Inside Airbnb / AirROI Sync)" → **„Marktdaten-Import (Inside Airbnb CSV)"**.

## Validierung
- Datenquellen-Accordion: Filter + AirROI-Sync-Button + Sync-Timestamp.
- Marktdaten-Import-Accordion: nur noch CSV-Textarea + Import-Button.
- Bestehende Funktionalität (Sync, Import) unverändert.
