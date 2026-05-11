## Ziel
Beim Klick auf "Keine Wäschebestellungen → Klicken um Bestellung zu erstellen" soll der Dialog mit den passenden Bestellpositionen vorbefüllt werden, statt mit einer leeren Liste zu öffnen.

## Festgestellter Stand
- `handleCreateLinenOrder` in `src/pages/OriginalDashboard.tsx` setzt aktuell nur die Buchung und öffnet den Dialog mit leeren Items.
- Es existiert bereits eine Edge Function `generate-booking-linen-order`, die anhand der Buchung die exakten Positionen (inkl. `linen_color` und `item_variants`) berechnet. Sie wird bereits an zwei Stellen genutzt:
  - `src/components/Bookings/CreateBookingForm.tsx` (Button "Wäschebestellung erstellen")
  - `src/hooks/useBookingLinenOrders.ts` (`createOrderMutation`)
- Der Dialog `LinenOrderDialog` liest die initialen Positionen über die Prop `orderItems`.

## Umsetzung
1. In `src/pages/OriginalDashboard.tsx` die Funktion `handleCreateLinenOrder` so anpassen, dass sie zuerst `generate-booking-linen-order` aufruft und das Ergebnis als Vorbefüllung in den Dialog gibt:
   - `editingOrderData` mit `items`, `linen_color`, `item_variants` aus dem Edge-Function-Ergebnis vorbelegen.
   - `delivery_date` standardmäßig auf den Vortag des Check-in setzen (gleiche Logik wie in `useBookingLinenOrders`).
   - `mode` bleibt `create`, damit beim Speichern eine neue Bestellung angelegt wird (kein `editingOrderId`).
2. Während des Aufrufs einen Lade-Toast anzeigen und Fehler abfangen:
   - Erfolg: kurze Info "X Teile berechnet".
   - Fehler (z. B. keine `linen_set_definitions`): Toast mit Hinweis und Dialog trotzdem leer öffnen, damit der Nutzer manuell ergänzen kann.
3. Mehrfachklicks verhindern (Lade-Status), keine Änderung am Dialog selbst nötig.

## Technische Details
- Betroffene Datei: `src/pages/OriginalDashboard.tsx` (nur die Funktion `handleCreateLinenOrder` und ggf. ein kleiner Loading-State).
- Keine Änderungen an der Edge Function, am Dialog oder am Schema.
- Vorbild für den Aufruf: `generateLinenOrderMutation` in `CreateBookingForm.tsx` und `createOrderMutation` in `useBookingLinenOrders.ts`.