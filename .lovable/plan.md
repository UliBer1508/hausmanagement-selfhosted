# Plan: Klickbare Reinigungskarte in der Buchungsübersicht

## Ziel
Die leere Reinigungskarte in der Buchungsübersicht soll anklickbar sein und direkt den bestehenden Dialog zum Erstellen eines Reinigungsauftrags öffnen.

## Umsetzung
1. `src/components/Dashboard/OverviewTab.tsx`
   - Die leere Karte „Keine Service-Aufträge“ als interaktives Element ausführen.
   - Klick- und Tastatur-Interaktion ergänzen.
   - Eine Callback-Prop aufrufen, die die aktuelle Buchung an den Eltern-Container übergibt.

2. `src/pages/OriginalDashboard.tsx`
   - State für „ausgewählte Buchung zur Reinigungserstellung“ ergänzen.
   - Handler hinzufügen, der beim Klick auf die leere Karte die aktuelle Buchung setzt und den Dialog öffnet.
   - Den bestehenden `CreateCleaningTaskDialog` unterhalb der Übersicht einbinden und mit `preselectedBooking` öffnen.

3. Bestehende Logik beibehalten
   - Keine Änderung an der Reinigungslogik, Datenstruktur oder dem Erstellungsdialog selbst.
   - Nur die fehlende Verknüpfung in der Übersicht ergänzen.

## Technische Details
- Es wird der vorhandene `CreateCleaningTaskDialog` wiederverwendet.
- Die aktuelle Buchung wird per `preselectedBooking` übergeben, damit Haus/Buchung direkt vorbelegt sind.
- Für Barrierefreiheit bekommt die Karte `role="button"`, `tabIndex` und Enter/Leertaste-Unterstützung.

## Ergebnis
Wenn bei einer Buchung noch keine Reinigung existiert, kann die leere Reinigungskarte direkt angeklickt werden, um sofort einen Reinigungsauftrag für diese Buchung anzulegen.