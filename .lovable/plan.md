
# Bug-Fix: "Belegt"-Status berücksichtigt Status `completed` nicht

## Problem

Das Dashboard zeigt **Wald Chalet als "Belegt"** (rot) an, obwohl die Buchung bereits abgeschlossen ist.

### Root Cause

Die aktuelle Buchung für Wald Chalet:
- **Gast**: Oliver Grandt
- **Check-in**: 01.02.2026 14:00
- **Check-out**: 08.02.2026 09:00 UTC
- **Status**: `completed` (bereits abgeschlossen)

**Problem**: Die Belegungslogik in der Funktion `housesWithStatus` (Zeile ~794) prüft:

```typescript
booking.status !== 'cancelled' &&
new Date(booking.check_in) <= now &&
new Date(booking.check_out) >= now
```

Der Status `completed` wird **nicht ausgeschlossen**. Eine abgeschlossene Buchung zählt weiterhin als "belegt", solange die Checkout-Zeit noch nicht überschritten ist (aktuell 07:58 UTC, Checkout 09:00 UTC).

## Geschäftslogik-Erklärung

- **confirmed**: Buchung bestätigt, im Zeitraum → **belegt**
- **checked_in**: Gast aktiv vor Ort → **belegt**
- **completed**: Gast ist ausgecheckt → **NICHT belegt** ❌ (wurde übersehen)
- **cancelled**: Storniert → **nicht belegt**

## Lösung

Die Belegungsprüfung muss nur **aktive Buchungen** (`confirmed` oder `checked_in`) berücksichtigen und explizit `completed` ausschließen.

### Änderungen

**Datei: `src/pages/OriginalDashboard.tsx`**

**Stelle 1 - Funktion `housesWithStatus` (Zeile ~794-798)**

Aktuell:
```typescript
const activeBooking = bookingsData.find(booking => 
  booking.houses?.id === house.id &&
  booking.status !== 'cancelled' &&
  new Date(booking.check_in) <= now &&
  new Date(booking.check_out) >= now
);
```

Neu:
```typescript
const activeBooking = bookingsData.find(booking => 
  booking.houses?.id === house.id &&
  (booking.status === 'confirmed' || booking.status === 'checked_in') &&
  new Date(booking.check_in) <= now &&
  new Date(booking.check_out) >= now
);
```

**Stelle 2 - Kalender-Events (Zeile ~1118-1128)**

Überprüfen, dass auch die roten "Belegt"-Events nur für aktive Buchungen gezeichnet werden:

Aktuell:
```typescript
realBookings.forEach(booking => {
  if (booking.status === 'cancelled') return;
  // ... Kalender-Event erstellen
```

Sollte sein:
```typescript
realBookings.forEach(booking => {
  if (booking.status === 'cancelled' || booking.status === 'completed') return;
  // ... Kalender-Event erstellen
```

## Ergebnis

Nach dieser Änderung wird:
- ✅ Wald Chalet als "Frei" angezeigt (da `completed`)
- ✅ Venediersiedlung Chalet als "Frei" angezeigt (keine aktiven Buchungen)
- ✅ Zukünftige Buchungen werden weiterhin korrekt als "belegt" gezeigt
- ✅ Stornierte Buchungen bleiben "frei"

