

# Fix: Rental-Modus zeigt Mietspiegel statt Inserate

## Problem

Im Rental-Modus wird kein `search_domain_filter` an Perplexity gesendet. Dadurch sucht Perplexity breit und die Citations verweisen oft auf Mietspiegel-Seiten statt auf konkrete Inserate. Die Fallback-Logik ersetzt dann fehlende `listing_url`s mit diesen unbrauchbaren Links.

## Loesung

### Edge Function (`scrape-competitor-prices/index.ts`)

1. **Domain-Filter fuer Rental-Modus**: Analog zum Tourist-Modus einen `search_domain_filter` basierend auf den ausgewaehlten Plattformen setzen (immobilienscout24.de, immowelt.de, ebay-kleinanzeigen.de, wg-gesucht.de, wohnungsboerse.net).

2. **Prompt verschaerfen**: Im Rental-Prompt explizit fordern, dass `listing_url` die direkte URL zum spezifischen Inserat sein muss (z.B. `/expose/12345678`), nicht zur Startseite oder einem Mietspiegel.

3. **Citation-Mapping verbessern**: Beim Fallback nur Citations verwenden, die wie Inserat-URLs aussehen (z.B. `/expose/`, `/angebot/`, `/wohnung/` im Pfad). Allgemeine Seiten (Startseite, Mietspiegel, Suchseiten) herausfiltern.

### Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Domain-Filter fuer Rental, Prompt-Verschaerfung fuer URLs, Citation-Filter-Logik |

