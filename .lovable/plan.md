

# Fix: Parameter-Speicherung und Inserat-Suche

## Problem 1: Houses-Query schlaegt fehl
Die Query auf Zeile 108 selektiert `living_area_sqm`, aber diese Spalte existiert NICHT in der `houses`-Tabelle. Dadurch schlaegt die gesamte Query fehl, `houses` bleibt `undefined`, und nichts funktioniert -- weder Haus-Auswahl noch Parameter-Speicherung.

## Problem 2: Inkonsistente Ergebnisse
Die Logs zeigen, dass Perplexity manchmal 6+ Listings zurueckgibt und manchmal 0. Der Prompt ist zu strikt:
- "Erfinde KEINE Preise" veranlasst das Modell, lieber nichts zurueckzugeben
- Es werden exakte Gesamtpreise verlangt, obwohl Portale oft nur Nachtpreise anzeigen
- Das Modell gibt auf wenn es keine "buchbaren Inserate mit direkten Preisen" findet

## Loesung

### 1. ScrapePricesDialog.tsx
- **Zeile 108**: `living_area_sqm` aus der Select-Query entfernen (existiert nicht in DB)
- **Zeile 159**: Fallback auf geschaetzten Wert oder Konstante statt `house.living_area_sqm`

### 2. Edge Function (scrape-competitor-prices/index.ts)
- **Prompt anpassen**: Nachtpreise explizit akzeptieren, Regel lockern von "Erfinde KEINE Preise" zu "Gib an was du findest, auch Nachtpreise oder Preisspannen"
- **Fallback-Logik**: Wenn `found: false` und `listings: []`, aber `search_summary` Nachtpreise erwaehnt, zweiten Versuch mit lockerem Prompt machen
- **System-Prompt ergaenzen**: "Wenn du keine exakten Gesamtpreise findest, gib Nachtpreise an und setze price_total auf null"

### Dateien

| Datei | Aenderung |
|-------|-----------|
| `ScrapePricesDialog.tsx` | `living_area_sqm` aus Query entfernen |
| `scrape-competitor-prices/index.ts` | Prompt lockern, Nachtpreise akzeptieren |

