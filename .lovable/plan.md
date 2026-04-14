

# Mietobjekt-Details: Klickbare Vergleichsobjekte in der Mietpreisanalyse

## Problem

Die Vergleichsobjekte in der Mietpreisanalyse zeigen nur Adresse, qm, Zimmer, Quelle und Miete. Der User moechte durch Klick auf ein Objekt mehr Details sehen.

## Loesung

### 1. Perplexity-Prompt erweitern (Edge Function)

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Das `comparables`-Array im Rental-Prompt (Zeile 69-72) um zusaetzliche Felder erweitern:

```json
{
  "address": "Beispielstr. 1, 14612 Falkensee",
  "sqm": 65,
  "rooms": 2,
  "rent": 800,
  "source": "ImmoScout24",
  "description": "Helle 2-Zimmer-Wohnung mit Balkon...",
  "floor": "2. OG",
  "year_built": 2005,
  "features": ["Balkon", "Einbauküche", "Keller"],
  "available_from": "01.07.2026",
  "listing_url": "https://..."
}
```

### 2. Frontend: Klickbare Vergleichsobjekte mit Expand/Collapse

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

- `comparables`-Interface um die neuen Felder erweitern (description, floor, year_built, features, available_from, listing_url)
- Jedes Vergleichsobjekt bekommt `cursor-pointer` und einen Collapsible-Mechanismus
- Bei Klick oeffnet sich ein Detail-Bereich mit:
  - Beschreibung
  - Etage, Baujahr
  - Ausstattungs-Badges (features)
  - Verfuegbar ab
  - Link zum Inserat (wenn vorhanden)
- Die kompakte Zeile (Adresse, qm, Zimmer, Miete) bleibt als Trigger sichtbar

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Rental-Prompt: comparables um Details erweitern |
| `ScrapePricesDialog.tsx` | Interface + klickbare Collapsible-Details pro Vergleichsobjekt |

