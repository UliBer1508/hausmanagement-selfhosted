

# Wettbewerber-Details in Tourist-Suchergebnissen anzeigen

## Problem

Die Tourist-Preissuche zeigt pro Wettbewerber nur gefundene Preise, aber keine Objektdetails (Ausstattung, Lage, Groesse, Bewertungen). Der User kann nicht auf ein Ergebnis klicken, um mehr zu erfahren. Die Perplexity-Suche fragt diese Infos auch nicht ab.

## Aenderungen

### 1. Perplexity-Prompt erweitern (Edge Function)

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Den Tourist-Prompt so erweitern, dass Perplexity zusaetzlich zu Preisen auch Objektdaten zurueckgibt:

```json
{
  "found": true,
  "property_details": {
    "description": "Modernes Chalet mit Panoramablick...",
    "max_guests": 6,
    "bedrooms": 3,
    "bathrooms": 2,
    "size_sqm": 120,
    "rating": 9.2,
    "review_count": 48,
    "amenities": ["Sauna", "Whirlpool", "WLAN"],
    "address": "Bramberg am Wildkogel",
    "platform_url": "https://..."
  },
  "prices": [...]
}
```

Die `property_details` werden im Result-Objekt an das Frontend durchgereicht.

### 2. Frontend: Klickbare Ergebnis-Cards mit Detail-Dialog

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

- `ScrapeResult`-Interface um `property_details` erweitern
- Jede Ergebnis-Card bekommt `cursor-pointer` und einen Expand/Collapse-Mechanismus
- Bei Klick zeigt sich ein Detail-Bereich mit:
  - Beschreibung
  - Gaeste/Schlafzimmer/Badezimmer/Groesse
  - Bewertung + Anzahl
  - Ausstattungs-Badges
  - Adresse/Lage
  - Link zum Portal
- Preise bleiben wie bisher unterhalb der Details sichtbar

### 3. Bestehende Wettbewerber-Daten aktualisieren

Wenn `property_details` zurueckkommen und der Wettbewerber in `competitor_properties` existiert, werden fehlende Felder (amenities, rating, review_count, max_guests, bedrooms, bathrooms, address) mit den neu gefundenen Daten ergaenzt (nur wenn bisher NULL).

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Prompt um property_details erweitern, Details durchreichen + in DB updaten |
| `ScrapePricesDialog.tsx` | Interface + klickbare Detail-Ansicht pro Ergebnis |

