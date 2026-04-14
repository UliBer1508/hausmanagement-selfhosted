

# Perplexity-Suche testen: Chalets mit Preiszusammenfassung

## Aktion

Zwei Testaufrufe der Edge Function `scrape-competitor-prices` durchführen — einmal für Booking.com und einmal für Airbnb — um zu prüfen, ob Perplexity konkrete Chalets mit Preisen in der Region Neukirchen am Großvenediger findet.

## Schritte

1. **Booking.com-Suche** via `curl_edge_functions` mit Testparametern (Neukirchen, Juli 2025, 6 Gäste, `platforms: ['booking.com']`)
2. **Airbnb-Suche** mit denselben Parametern (`platforms: ['airbnb']`)
3. **Ergebnisse hier zusammenfassen** — Listings, Preise, Bewertungen, Citations-Qualität

Keine Code-Änderungen nötig — rein ein Test der bestehenden Funktion.

