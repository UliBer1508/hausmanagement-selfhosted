## Ziel

Die drei Karten-Typen in der Dashboard-Übersicht (Buchung, Reinigung, Wäschebestellung) sollen komplett anklickbar sein und direkt den jeweiligen Bearbeiten-Dialog öffnen — statt nur über das kleine Stift-Icon oben rechts.

## Umfang

Betroffen sind drei Komponenten, die bereits vorhandene Edit-Dialoge nutzen:

| Karte | Datei | Aktion bei Klick |
|---|---|---|
| Buchung | `src/components/Bookings/BookingCard.tsx` | öffnet `EditBookingDialog` |
| Reinigung | `src/components/Bookings/ServiceTaskCard.tsx` | öffnet `EditCleaningTaskDialog` |
| Wäschebestellung | `src/components/Bookings/LaundryOrderCard.tsx` | ruft `onEdit(order)` auf (öffnet `LinenOrderDialog` im Edit-Modus) |

Keine Änderungen an Daten, Hooks oder Dialog-Logik — nur das Klick-Verhalten der Karten.

## Umsetzung

1. **Card-Wrapper klickbar machen**
   - `<Card>` bekommt `role="button"`, `tabIndex={0}`, `cursor-pointer`, dezenten Hover-Effekt (`hover:shadow-md transition-shadow`) und Keyboard-Handler (Enter/Space).
   - Klick öffnet den jeweiligen Edit-Dialog.

2. **EditBookingDialog & EditCleaningTaskDialog auf kontrollierten Modus**
   - Dialog wird über `open` / `onOpenChange` von der Karte gesteuert (statt Trigger-Button).
   - Stift-Icon oben rechts bleibt erhalten als visueller Hinweis, ist aber rein dekorativ bzw. setzt denselben State.

3. **Klick-Bubbling verhindern für interaktive Elemente in der Karte**
   - Buttons innerhalb der Karte (Sync, Delete, Confirm bei Wäsche; Stift-Icon selbst; ggf. Status-Badges mit Aktion) bekommen `onClick={(e) => e.stopPropagation()}` bzw. das vorhandene `onClick` wird mit `stopPropagation` ergänzt.
   - Aufklappbare Bereiche („Artikel (28)") bleiben funktional und stoppen Propagation.

4. **Accessibility**
   - `aria-label` mit kurzer Beschreibung („Buchung von Joke Hauters bearbeiten" o. ä.).
   - Fokus-Ring über bestehendes Tailwind `focus-visible:ring-2 focus-visible:ring-ring`.

## Technische Details

- `EditBookingDialog` muss optional `open` + `onOpenChange` Props akzeptieren (zusätzlich zum bestehenden `trigger`). Falls bereits per `trigger`-Pattern gebaut: kontrollierte Variante einführen, ohne den Trigger-Modus zu brechen (beides unterstützen).
- `LaundryOrderCard` ruft `onEdit(order)` bereits über das Stift-Icon auf — derselbe Handler wird zusätzlich am Card-Wurzelknoten ausgelöst.
- Kein neuer State außerhalb der Karten nötig.

## Verifikation

- Klick irgendwo auf eine Buchungskarte → `EditBookingDialog` öffnet sich.
- Klick auf eine Reinigungskarte → `EditCleaningTaskDialog` öffnet sich.
- Klick auf eine Wäschebestellungskarte → Wäsche-Edit-Dialog öffnet sich.
- Klick auf Sync-/Delete-/Confirm-Button in der Wäschekarte führt **weiterhin nur** die Aktion aus, öffnet nicht zusätzlich den Dialog.
- Tastatur-Navigation (Tab → Enter) öffnet ebenfalls den Dialog.
