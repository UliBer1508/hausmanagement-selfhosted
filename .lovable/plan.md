## Ziel

Die Buchungs-Tabelle in „Buchungen → Übersicht" (`BookingOverviewFixed.tsx`) soll komplett klickbar sein: Klick irgendwo auf eine Zeile öffnet „Buchung bearbeiten". Edit-/Lösch-Buttons in der letzten Spalte bleiben unverändert nutzbar.

## Lösung

1. **`src/components/Bookings/BookingOverviewFixed.tsx`** (TableRow ab Z. 879):
   - Lokalen State `rowEditBookingId` einführen, der die aktuell zu bearbeitende Buchung hält.
   - `TableRow` bekommt:
     - `onClick` mit Portal-Bubble-Guard (`e.currentTarget.contains(e.target)`), öffnet die Buchung.
     - `role="button"`, `tabIndex={0}`, Hover-Cursor (`cursor-pointer hover:bg-muted/50`).
     - `onKeyDown` für Enter/Space.
   - Aktionsspalte (`TableCell` mit Edit/Delete) erhält `onClick={(e) => e.stopPropagation()}`, damit Klicks dort nicht die Zeile triggern.
   - Render des Bearbeiten-Dialogs (analog zur bestehenden „Auto-Open"-Variante Z. 977ff.) gesteuert über `rowEditBookingId`.
   - Bestehende Edit-Button-Variante in der Aktionsspalte bleibt erhalten (Redundanz für gewohnte Bedienung).

2. Keine Änderungen an `EditBookingDialog`, `BookingCard` oder anderen Karten.

## Akzeptanzkriterien

- Klick auf eine Zeile in der Buchungs-Tabelle öffnet „Buchung bearbeiten" mit den richtigen Daten.
- Klick auf Edit-Icon bzw. Lösch-Icon in der Aktionsspalte funktioniert wie bisher und öffnet nicht zusätzlich den Bearbeiten-Dialog.
- X-Button, Backdrop und ESC schließen den Dialog zuverlässig (kein Re-Open durch Portal-Bubble).
- Tastatur: Tab fokussiert die Zeile, Enter/Space öffnet den Dialog.
- Keine visuellen Regressionen (Spaltenausrichtung, Hover-Highlight bleibt dezent).
