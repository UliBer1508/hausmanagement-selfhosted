

# Mietpreisanalyse: Details zu gefundenen Vergleichsobjekten anzeigen

## Problem

Die Edge Function fordert bereits `comparables` im Prompt an (Zeile 69-72), aber:
1. Die `comparables`-Daten werden nicht im Response an das Frontend weitergegeben (Zeile 148-158)
2. Das Frontend zeigt nur Zusammenfassungsdaten (Durchschnitt, Spanne, Anzahl), keine Einzelobjekte

## Aenderungen

### 1. Edge Function: `comparables` durchreichen

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Im Rental-Response (Zeile 149) das `comparables`-Array aus `rentalData` mit in die Results aufnehmen:

```
comparables: rentalData.comparables || []
```

### 2. Frontend: Vergleichsobjekte als Liste anzeigen

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

- `ScrapeResult`-Interface um `comparables` erweitern (Array mit `address`, `sqm`, `rooms`, `rent`, `source`)
- Im Rental-Ergebnisbereich (Zeile 423-446) unter den Zusammenfassungsdaten eine aufklappbare Liste der einzelnen Vergleichsobjekte anzeigen
- Pro Objekt: Adresse, qm, Zimmer, Miete, Quelle

Darstellung: Kompakte Zeilen mit Adresse links, Miete rechts, darunter qm/Zimmer/Quelle als kleine Details.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | `comparables` im Response durchreichen |
| `ScrapePricesDialog.tsx` | Interface + UI fuer Vergleichsobjekt-Details |

