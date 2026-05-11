## Ziel
Im Dashboard (Übersicht) soll die leere Karte „Keine Wäschebestellungen" anklickbar sein, sodass direkt der Wäschebestellungs-Dialog für die jeweilige Buchung geöffnet wird – wie es im `ConnectedBookingView` bereits funktioniert.

## Änderungen

### 1. `src/pages/OriginalDashboard.tsx`
- Neuen Handler `handleCreateLinenOrder(booking)` hinzufügen, der analog zu `ConnectedBookingView.handleCreateLinenOrder` arbeitet:
  - `setSelectedBookingForOrder(booking)`
  - leere `orderItems` setzen
  - `editingOrderId = null`, `editingOrderData = null`
  - `setShowLinenOrderDialog(true)`
- Handler als Prop `handleCreateLinenOrder` an `<OverviewTab />` übergeben.

### 2. `src/components/Dashboard/OverviewTab.tsx`
- Prop `handleCreateLinenOrder: (booking: any) => void` ergänzen.
- Den leeren Zustand (Zeile ~243) durch eine klickbare `Card` ersetzen (gleiches Muster wie in `ConnectedBookingView` Zeilen 502–517):
  - `cursor-pointer`, Hover-States, `role="button"`, `tabIndex={0}`, Tastatur-Handler (Enter/Space)
  - Beim Klick `handleCreateLinenOrder(booking)` aufrufen
  - Text leicht anpassen: „Klicken um Bestellung zu erstellen"
  - Icon (ShoppingCart) optional ergänzen für Konsistenz

### Hinweise
- Reine UI-/Verkabelungs-Änderung, keine Geschäftslogik-Änderung.
- Der Dialog `LinenOrderDialog` ist im Dashboard bereits gemountet; nur das Triggern aus der leeren Karte fehlt.
