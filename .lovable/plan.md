

# Fix: Perplexity-Prompt toleranter fuer Preisfindung

## Problem

Perplexity findet Objektdetails, aber keine Preise, weil:
- Der Zeitraum (April-Oktober 2026) zu weit in der Zukunft liegt
- Der Prompt nur nach buchbaren Preisen fuer exakte Daten fragt
- Preisinformationen aus general_info (z.B. "236-456€/Nacht") nicht als Preise extrahiert werden

## Loesung

### 1. Prompt ueberarbeiten (Edge Function)

**Datei:** `supabase/functions/scrape-competitor-prices/index.ts`

Den Prompt so aendern, dass Perplexity breiter sucht:

- **Auch vergangene/aktuelle Preislisten akzeptieren** ("Was kostet die Unterkunft generell?")
- **Preistabellen von der eigenen Website** suchen (viele Chalets haben Saisonpreislisten)
- **Explizit nach Preislisten, Ratenblättern, Saisonpreisen fragen** -- nicht nur buchbare Daten
- **Zeitraum weglassen oder optional machen**: "Finde alle bekannten Preise, egal fuer welchen Zeitraum"
- Neuen Preis-Typ `"list"` ergaenzen fuer Preistabellen-Eintraege

Neuer Prompt-Kern:
```
AUFGABE: Finde ALLE bekannten Preise fuer diese Ferienunterkunft.

WICHTIG - BREITE SUCHE:
- Suche auf der eigenen Website nach Preislisten/Ratenblättern
- Suche auf Buchungsportalen nach aktuellen oder vergangenen Preisen
- Auch Preise aus vergangenen Saisons sind relevant
- Saisonpreise, Wochenpreise, Nachtpreise -- ALLES ist relevant
- Wenn keine exakten Preise: Gib Preisspannen oder Richtwerte an
- Endreinigungskosten, Nebenkosten separat auflisten
```

### 2. general_info als Fallback-Preis parsen

Wenn `prices` leer ist aber `general_info` Preisangaben enthaelt (z.B. "200-350€/Nacht"), einen synthetischen Preis-Eintrag vom Typ `"info"` erzeugen, damit das Frontend "Keine Preise" nicht anzeigt.

### 3. Frontend: "Keine Preise" durch general_info ersetzen

**Datei:** `src/components/Houses/CompetitorAnalysis/ScrapePricesDialog.tsx`

Wenn `r.found === false` aber `r.general_info` existiert, zeige statt "Keine Preise" den Badge "Info" und darunter den `general_info` Text. So sieht der User zumindest die gefundenen Preisinformationen.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `scrape-competitor-prices/index.ts` | Prompt breiter (keine Zeitraum-Pflicht, Preislisten suchen, neuer Typ "list"/"info") + general_info Fallback |
| `ScrapePricesDialog.tsx` | general_info anzeigen wenn keine Preise, Badge "Info" statt "Keine Preise" |

