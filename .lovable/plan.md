

# Fix: Preis-Scraping funktioniert nicht

## Problem

Zwei Fehler verhindern den Start der Edge Function:

1. **Syntax-Fehler (Zeile 100 + 266):** `const period = monthToScrape;` wird zweimal im selben Block deklariert. Deno/V8 wirft `Identifier 'period' has already been declared` und die Funktion startet gar nicht.

2. **Veraltetes Perplexity-Modell (Zeile 176):** `llama-3.1-sonar-large-128k-online` existiert nicht mehr. Muss auf `sonar` geaendert werden.

## Fix

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

| Zeile | Aenderung |
|-------|-----------|
| 176 | `model: 'llama-3.1-sonar-large-128k-online'` → `model: 'sonar'` |
| 266 | `const period = monthToScrape;` entfernen (bereits in Zeile 100 deklariert, einfach `period` weiter nutzen da es dieselbe Variable ist) |

Danach: Edge Function `scrape-competitor-prices` neu deployen.

