

# Suchparameter aus Hausdefinition lesen

## Problem
Die Mietpreisanalyse nutzt Standardwerte (60 qm, 2 Zimmer) statt der tatsaechlichen Hausdaten (`living_area_sqm`, `bedrooms`). Bei der Wohnung Winthirstrasse werden deshalb falsche Parameter verwendet.

## Aenderung

**Datei: `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`**

Zeile 304-309 aendern: Die Initialisierung der Suchparameter soll zuerst gespeicherte Werte (`scrape_search_params`) nutzen, dann Hausdaten, dann Defaults:

```typescript
// Vorher:
setSqm(saved?.sqm || 60);
setRooms(saved?.rooms || house.bedrooms || 2);
setRadiusKm(saved?.radius_km || 10);

// Nachher:
setSqm(saved?.sqm || house.living_area_sqm || 60);
setRooms(saved?.rooms || house.bedrooms || 2);
setRadiusKm(saved?.radius_km || 10);
```

Die einzige tatsaechliche Aenderung ist bei `sqm`: statt hartkodiertem `60` wird `house.living_area_sqm` als Fallback verwendet. `rooms` und `radius` nutzen bereits die Hausdaten bzw. sinnvolle Defaults.

