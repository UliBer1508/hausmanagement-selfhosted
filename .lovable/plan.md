

# Fix: Scraping-Suche vereinfachen und Ergebnisse klassifizieren

## Problem

Perplexity findet keine Ergebnisse, weil der Prompt zu restriktiv ist:
- "6 Erwachsene" ist unrealistisch fuer ein Ferienhaus (Familien mit Kindern)
- Der Prompt verlangt einen exakten Preis fuer exakte Daten — wenn Perplexity keinen findet, gibt es `available: false` zurueck
- Der Prompt fragt nur nach EINEM Preis, statt alle verfuegbaren Informationen zu sammeln

## Aenderungen

### 1. UI: Gaeste vereinfachen

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

- Statt "Erwachsene" + "Kinder": EIN Feld **"Personen"** (max 6)
- Default: 6 Personen
- Label: "Max. Personen"
- Body-Parameter: `max_guests: 6` statt `guests_adults` + `guests_children`

### 2. Edge Function: Prompt komplett ueberarbeiten

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Neuer Prompt-Ansatz — statt "finde EINEN Preis oder sag nicht verfuegbar":

```text
AUFGABE: Recherchiere alle verfuegbaren Preise fuer diese Ferienunterkunft.

NAME: {property_name}
URL: {property_url}

SUCHPARAMETER:
- Zeitraum: {check_in_from} bis {check_in_to}
- Personen: bis zu {max_guests}
- Suche auf: {platforms}

WICHTIG:
- Gib ALLE Preise zurueck die du fuer diesen Zeitraum findest
- Auch Preise fuer kuerzere oder laengere Aufenthalte
- Auch Preise fuer weniger Gaeste
- Auch allgemeine Preislisten oder Saisonpreise
- Klassifiziere jeden gefundenen Preis

ANTWORT-FORMAT (NUR JSON):
{
  "found": true,
  "prices": [
    {
      "total_price": 1890,
      "price_per_night": 270,
      "check_in": "2026-07-01",
      "check_out": "2026-07-08",
      "nights": 7,
      "guests": 6,
      "platform": "booking.com",
      "type": "exact",
      "notes": "Sommerpreis"
    }
  ],
  "general_info": "Preisbereich 200-350 EUR/Nacht je nach Saison"
}

type kann sein: "exact" (exakter Preis), "seasonal" (Saisonpreis),
"range" (Preisspanne), "per_night" (Nachtpreis ohne Gesamtpreis)
```

Aenderungen an der Verarbeitung:
- Akzeptiere ALLE Ergebnisse (nicht nur `available: true`)
- Speichere den besten gefundenen Preis in `monthly_pricing`
- Gib alle gefundenen Preise als Results zurueck

### 3. Ergebnis-Anzeige erweitern

Zeige pro Wettbewerber mehrere gefundene Preise an (nicht nur einen), mit Typ-Badge (Exakt/Saison/Spanne).

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `ScrapePricesDialog.tsx` | 1 Feld "Personen" statt Erwachsene+Kinder, erweiterte Ergebnis-Anzeige |
| `scrape-competitor-prices/index.ts` | Neuer toleranter Prompt, alle Preise sammeln, klassifizieren |

