## Ziel
Die 5 Info-Karten im Wäsche-Dashboard (Zeilen 523–589 in `src/components/Houses/LinenDashboard.tsx`) auf **eine kompakte Karte** reduzieren. „Häuser" entfällt komplett.

## Vorschlag: Eine Karte mit 4 Werten in einer Zeile

```text
┌─────────────────────────────────────────────────────────────┐
│  Wäsche-Übersicht                                            │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ ✅  9        │ 📦  0        │ ⚠️  13       │ 📝  0          │
│ Mit          │ Ausstehend   │ Ohne         │ Zu genehmigen  │
│ Bestellung   │              │ Bestellung   │ (2 dringend)   │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### Eigenschaften
- **Eine `<Card>`** statt fünf — deutlich weniger vertikaler Platzverbrauch.
- **4 Spalten** über `grid grid-cols-2 sm:grid-cols-4`, getrennt durch dezente vertikale Divider (`divide-x divide-border`).
- Pro Spalte: Emoji + farbige Zahl (gleiche Farben wie heute: grün/blau/gelb/amber) + Label klein darunter.
- „Dringend"-Hinweis bleibt erhalten, wird unter „Zu genehmigen" als kleiner roter Badge angezeigt.
- Auf Mobile: 2 Spalten (2×2 Raster), damit auf 390 px nichts überlappt.
- Karte ohne CardHeader → kompakt; nur `CardContent p-4`.

### Entfernt
- Karte „Häuser" (Zahl `overallStatus.totalHouses`) — nur die UI, der Wert bleibt im Datenobjekt bestehen für andere Verwendungen.

### Geänderte Datei
- `src/components/Houses/LinenDashboard.tsx` (Zeilen 523–589 ersetzen)

Keine Logik-, Daten- oder Style-Token-Änderungen außerhalb dieses Blocks.
