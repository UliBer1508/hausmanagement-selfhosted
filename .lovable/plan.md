## Ziel
Jede Buchungs-Zeile in der Tabelle "Buchungen" soll wie eine eigenständige Karte mit **runden Ecken** wirken. Die Status-Pills in **Services** und **Wäsche** bleiben unverändert.

## Lösung
In `src/components/Bookings/BookingOverviewFixed.tsx`:

1. `<Table>` (Zeile ~860) auf getrennte Zellen-Borders umstellen, damit Zeilen als eigene Blöcke gerendert werden:
   ```tsx
   <Table className="border-separate border-spacing-y-2">
   ```

2. `<TableRow>` (Zeile ~879) mit Karten-Styling versehen:
   ```tsx
   className="cursor-pointer bg-card hover:bg-muted/50 shadow-sm
              focus-visible:outline-none focus-visible:bg-muted/50"
   ```

3. Damit die runden Ecken sauber wirken, an erste/letzte `<TableCell>` Border-Radius geben:
   - Erste Zelle (Gast, Zeile ~896): `className="font-medium rounded-l-lg border-l border-y"`
   - Alle mittleren Zellen: `className="border-y"` (bestehende `className`s ergänzen)
   - Letzte Zelle (Aktionen, Zeile ~950): zusätzlich `rounded-r-lg border-r border-y`

   → Effekt: Jede Zeile wirkt wie eine abgerundete Karte mit dezentem Rand und Abstand.

4. Header-`<TableRow>` bleibt wie bisher (kein Karten-Look).

Keine Änderung an Service-Pills (Zeile 490) und Wäsche-Pills (Zeile 514).

## Hinweis
Falls dir der Effekt zu "kartig" wird (z. B. doppelte Borders sichtbar), kann ich alternativ nur Schatten + `rounded-lg` ohne Border einsetzen. Sag kurz Bescheid, sonst gehe ich mit der Border-Variante.