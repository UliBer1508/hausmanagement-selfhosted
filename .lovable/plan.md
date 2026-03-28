

# Fix: KI-Analyse fehlgeschlagen — "No function call in response"

## Befund

Die Edge Function `analyze-vacancy` nutzt `geminiStructuredOutput()` aus `_shared/gemini.ts`. Diese Funktion erzwingt eine Gemini Function-Call-Antwort (`mode: ANY`). Gemini 2.5 Flash ignoriert dies manchmal und antwortet stattdessen mit reinem Text (JSON im Freitext). Die Funktion wirft dann den Fehler `"No function call in response"`.

## Fix

**Datei:** `supabase/functions/_shared/gemini.ts` — Funktion `geminiStructuredOutput` (Zeile 265-284)

Fallback-Logik einbauen: Wenn kein Function Call zurückkommt, aber Text vorhanden ist, versuche den Text als JSON zu parsen und die erwarteten Felder zu extrahieren.

```text
geminiStructuredOutput():
  1. API aufrufen (wie bisher)
  2. Function Call vorhanden? → args zurückgeben (wie bisher)
  3. NEU: Kein Function Call? → Text-Antwort prüfen
     a. JSON aus Text extrahieren (regex für {...})
     b. Erfolgreich? → geparstes Objekt zurückgeben
     c. Fehlgeschlagen? → bisherigen Fehler werfen
```

Zusätzlich: `maxOutputTokens` auf 4096 erhöhen (aktuell Default 2048), da die Analyse-Antwort komplex ist und abgeschnittene Antworten ebenfalls zu fehlenden Function Calls führen können.

Keine weiteren Dateien betroffen. Keine Migration nötig.

