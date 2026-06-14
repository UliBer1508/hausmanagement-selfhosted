# Reinigungskarte: "Unbekannt" beheben

## Ursache
Im Header der `ServiceTaskCard` steht `Reinigungsauftrag · Unbekannt`, weil der Fallback `task.houses?.name || task.bookings?.houses?.name || 'Unbekannt'` greift. In `OverviewTab` (und teils `ConnectedBookingView`) werden die Tasks ohne die `houses`-Joins geladen — beide Felder sind also leer, obwohl die Karte unter einer Buchung mit bekanntem Chalet hängt.

## Lösung (nur UI/Props, keine Datenlogik-Änderung)

1. **`src/components/Bookings/ServiceTaskCard.tsx`**
   - Neue optionale Prop `houseName?: string`.
   - Header-Anzeige nutzt: `houseName ?? task.houses?.name ?? task.bookings?.houses?.name ?? 'Unbekannt'`.

2. **Caller anpassen, damit der Hausname durchgereicht wird:**
   - `src/components/Dashboard/OverviewTab.tsx` (bzw. die Stelle, die `ServiceTaskCard` rendert): `houseName={booking.houses?.name}` aus der zugehörigen Buchung übergeben.
   - `src/components/Bookings/ConnectedBookingView.tsx`: analog `houseName={booking.houses?.name}` mitgeben.

## Ergebnis
Die Reinigungskarte zeigt im Header z. B. `Reinigungsauftrag · Wald Chalet` statt `Unbekannt`. Keine Änderung am Layout, Datenmodell oder den Dialog-Öffnern.
