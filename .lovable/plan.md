

# Wettbewerbssuche auf Booking.com & Airbnb beschränken

## Problem
Die Perplexity-Prompts fordern aktuell auch Ergebnisse von Aggregatoren (Trivago, Google Hotels, HolidayCheck, Holidu, HomeToGo, Casamundo). Dadurch kommen Ergebnisse von Drittportalen statt direkt von Booking.com und Airbnb.

## Lösung

### Edge Function (`scrape-competitor-prices/index.ts`)

**2 Änderungen pro Portal-Suche:**

1. **`search_domain_filter` hinzufügen** — Perplexity API-Parameter, der die Suche auf bestimmte Domains einschränkt:
   - Booking.com-Suche: `search_domain_filter: ['booking.com']`
   - Airbnb-Suche: `search_domain_filter: ['airbnb.com', 'airbnb.de']`

2. **Aggregator-Verweise aus Prompts entfernen** — Keine Erwähnung von Trivago, Google Hotels, HolidayCheck, Holidu, HomeToGo, Casamundo mehr in den Suchprompts

3. **`enrichListingsWithCitations`** — Aggregator-Domains aus der Citation-Filterung entfernen (nur noch `booking.com` bzw. `airbnb.com/de`)

### Dateien

| Datei | Änderung |
|-------|----------|
| `scrape-competitor-prices/index.ts` | Domain-Filter + Prompts bereinigen + Citations-Filter |

