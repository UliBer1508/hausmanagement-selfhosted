## Ziel
Entfernung der "Bearbeiten"- und "Löschen"-Buttons aus den Buchungskarten in `BookingOverviewFixed.tsx`.

## Hintergrund
Die Buchungskarten wurden soeben auf das Karten-Layout (wie Gäste-Liste) umgestellt. Ein Klick auf die gesamte Karte öffnet bereits den Edit-Dialog (`onActivate`). Die separaten Buttons sind daher redundant.

## Änderung
**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

- **Entfernen** des gesamten "Aktionen"-Blocks (Zeilen ~931–958):
  - `<div className="flex justify-end gap-2" …>` mit `EditBookingDialog`-Trigger-Button und `Löschen`-Button.
- **Beibehalten:** `onActivate` am `ClickableCard` → Klick auf die Karte öffnet weiterhin den Edit-Dialog.
- **Beibehalten:** Der unsichtbare Auto-Open-Dialog für Chat-Navigation (Zeilen 978–995) bleibt erhalten.
- **Beibehalten:** Der Lösch-Bestätigungsdialog (ab Zeile 997) bleibt im Code – er wird über den Edit-Dialog oder ggf. spätere UI erreicht.

## Optionale Folgefrage
Soll ein Löschen weiterhin möglich sein (z. B. innerhalb des Edit-Dialogs), oder ist die Löschfunktion vollständig obsolet?
