

# Fix: "Bester Kanal" zeigt falsche Plattformen

## Problem

Die Funktion `getBestChannel` in `src/components/Guests/GuestAnalytics.tsx` (Zeile 405-438) ist **hardcoded**:
- Hochsaison → gibt immer "Booking.com" zurück
- Nebensaison → gibt immer "Belvilla + Airbnb" zurück

Die tatsächlichen Buchungsdaten (`byPlatform`) werden zwar berechnet (Zeile 418-424), aber **nie verwendet**. Deshalb bekommt "Venedigersiedlung" fälschlicherweise "Belvilla" empfohlen, obwohl es dort gar nicht gelistet ist.

## Fix

**Datei:** `src/components/Guests/GuestAnalytics.tsx` — Funktion `getBestChannel` (Zeile 405-438)

Die hardcoded Rückgabewerte ersetzen durch echte Analyse der `byPlatform`-Daten:

1. `byPlatform` wird bereits korrekt berechnet (Buchungen des gleichen Monats, gruppiert nach Plattform)
2. Statt hardcoded Werte: die Plattform mit dem höchsten Umsatz (Hochsaison) bzw. höchster Anzahl (Nebensaison) aus den **tatsächlichen Buchungsdaten des Hauses** zurückgeben
3. Fallback wenn keine historischen Daten: "Direktbuchung" mit Hinweis "Keine historischen Daten für diesen Monat"

```text
Logik:
  1. byPlatform berechnen (wie bisher)
  2. Keine Daten? → Fallback "Keine Daten"
  3. Hochsaison? → Plattform mit höchstem Umsatz wählen
  4. Nebensaison? → Plattform mit meisten Buchungen wählen
  5. Reason dynamisch: "X Buchungen, Ø Y EUR"
```

Nur diese eine Funktion wird geändert. Keine weiteren Dateien betroffen.

