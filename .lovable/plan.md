

# Fix: Perplexity findet keine Objekte

## Problem
- `search_domain_filter` beschränkt auf booking.com, airbnb.com etc.
- Diese Portale rendern Preise per JavaScript -- Perplexity kann sie nicht scrapen
- Das Modell gibt auf mit "kein Echtzeit-Zugriff"
- 0 Ergebnisse, 0 Citations

## Lösung

### Edge Function (`scrape-competitor-prices/index.ts`)

**3 Änderungen:**

1. **Domain-Filter entfernen**: Statt `search_domain_filter` auf Buchungsportale zu beschränken, Perplexity frei suchen lassen. Es findet dann Preise über Aggregatoren (Holidu, Trivago), Blogs, Vergleichsseiten und gecachte Portal-Einträge.

2. **Prompt umformulieren**: Statt "suche verfügbare Unterkünfte auf Portalen" --> "Finde Ferienwohnungen und deren Preise in [Ort] für [Zeitraum]". Weniger restriktiv, damit das Modell alle verfügbaren Webquellen nutzt.

3. **Modell auf `sonar-pro` upgraden**: Bessere Multi-Step-Suche mit 2x mehr Citations, findet mehr Ergebnisse.

### Konkrete Code-Änderungen

| Stelle | Vorher | Nachher |
|--------|--------|---------|
| Zeile 352-363 | `search_domain_filter: [booking.com, airbnb.com, ...]` | Kein Domain-Filter |
| Zeile 353 | `model: 'sonar'` | `model: 'sonar-pro'` |
| Zeile 355 | System: "Du durchsuchst Buchungsportale..." | System: "Du bist ein Reise-Recherche-Experte. Finde Unterkünfte mit Preisen aus allen verfügbaren Quellen." |
| Zeile 298-343 | Prompt fordert Portal-spezifische Suche | Prompt fragt allgemeiner nach Preisen in der Region, erwähnt Portale nur als bevorzugte Quellen |

### Warum das funktioniert
Perplexity `sonar-pro` durchsucht das Web frei und findet Preise über:
- Aggregator-Seiten (Holidu, Trivago, Google Hotels)
- Gecachte Booking.com/Airbnb-Listings in Suchmaschinen
- Reise-Blogs und Vergleichsartikel
- Die Citations liefern dann die Links zu den Inseraten

