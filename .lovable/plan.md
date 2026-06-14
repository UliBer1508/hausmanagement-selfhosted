## Ziel

Die große Reinigungs- und Wäschekarte sollen:
1. Ein **Notiz-Icon** im Kopfbereich erhalten. Klick öffnet einen kleinen Dialog, in dem die Notiz angezeigt UND direkt bearbeitet/gespeichert werden kann (auch wenn noch keine existiert → „Notiz hinzufügen").
2. Den **Karteninhalt deutlich kompakter** zeigen, indem die einzelnen Angaben (Datum, Buchung, Gast, Provider, Kosten, Bezahlung, Personal) auf einem responsiven **Mehrspalten-Grid** nebeneinander angeordnet werden statt jede Zeile untereinander.

## Konzept der neuen Karte

```text
┌─ Kopfbalken (Gradient blau) ────────────────────────────────────┐
│ 🧹  REINIGUNG · WALD CHALET                       [📝]  [Geplant]│
│     Reinigung                                                    │
└──────────────────────────────────────────────────────────────────┘
📍 Trattenbach 299/17, 5741 Neukirchen am GV
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Service     │ Buchung     │ Gast        │ Provider    │
│ 20.6. 10:00 │ 20.–27.6.   │ Dot Shaw(3) │ Amela       │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Kosten      │ Bezahlung   │ Personal    │             │
│ 90,00 EUR   │ [Offen]     │ Amela       │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

- Layout: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2`.
- Jede Zelle: kleines Label (text-xs muted) oben, Wert (text-sm) darunter — Icons werden inline ins Label gehoben statt eine eigene Spalte zu verbrauchen.
- Adresse bleibt als schmale Zeile darüber (volle Breite).
- Statuswechsel-Info („Geändert von …") rutscht als dezente Fußzeile unter das Grid.
- Höhe der Karte reduziert sich um ~40–50 %.

## Notiz-Icon

- Position: rechts im Kopfbalken, **vor dem Status-Badge**.
- Icon: `StickyNote` (Lucide). Badge-Punkt rechts oben, wenn `task.notes`/`order.notes` vorhanden.
- Klick: stoppt Card-onActivate (kein Edit-Dialog), öffnet `NotesQuickDialog`:
  - Textarea, „Speichern" / „Abbrechen".
  - Speichern → Supabase-Update auf `service_tasks.notes` bzw. `linen_orders.notes` + React-Query-Invalidation.

## Umsetzung (technisch)

1. **Neue Komponente** `src/components/shared/NotesQuickDialog.tsx`
   - Props: `open`, `onOpenChange`, `value`, `onSave(value)`.
   - Wiederverwendbar für Reinigung & Wäsche.

2. **Reinigungskarte** — `src/components/Cleaning/CleaningManagement.tsx` (Zeilen ~590–717)
   - Kopfbalken: Notiz-Icon-Button einfügen (mit `e.stopPropagation()`).
   - `CardContent`-Block durch das neue Grid ersetzen.
   - State + `useMutation` für Notiz-Update (`service_tasks`).
   - Gleiche Anpassung in `src/components/Bookings/ServiceTaskCard.tsx`, damit die Karte überall konsistent aussieht (FileText-Tooltip dort entfällt zugunsten Icon im Header).

3. **Wäschekarte** — `src/components/Houses/LinenOrdersList.tsx` (bzw. die Stelle, die die große Bestell-Karte rendert)
   - Gleiches Kopfbalken-Pattern + Notiz-Icon.
   - Felder (Bestelldatum, Lieferdatum, Buchung, Gast, Menge, Kosten, Bezahlstatus, Status) ins 2/3/4-Spalten-Grid.
   - Notiz-Update auf `linen_orders.notes`.

4. **DB**: `service_tasks.notes` und `linen_orders.notes` existieren bereits — keine Migration nötig (wird beim Bauen verifiziert; falls `linen_orders.notes` fehlt, wird eine Migration mit Spalte + GRANTs ergänzt).

## Vor dem Bauen — kurze Rückfrage

Bevor ich umsetze: soll ich beide Karten gleichzeitig umbauen oder erstmal nur die Reinigungskarte als Muster, das du absegnest, und danach die Wäschekarte analog?