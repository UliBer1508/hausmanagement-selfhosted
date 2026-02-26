

# Fix: Visuelle Überlagerung bei Buchungs-Übergaben am selben Tag

## Problem
Wenn eine Buchung am selben Tag endet, an dem die nächste beginnt (z.B. Maximilian check-out 01.03. / Martin check-in 01.03.), treffen sich beide Balken exakt am selben Pixel. Durch die `border-2` Eigenschaft (2px pro Seite) überlappen sich die Ränder visuell um 4px.

## Ursache
- Maximilian endet bei Pixel `(0 + 0.5) * 28 = 14px`
- Martin beginnt bei Pixel `(0 + 0.5) * 28 = 14px`
- Gleicher Startpunkt + 2px Border auf jeder Seite = sichtbare Überlappung

## Lösung
In `BookingTimeline.tsx` die `getBarStyle`-Funktion anpassen: einen kleinen Pixel-Abstand (2px) bei Check-in und Check-out einfügen, damit die Borders nicht kollidieren.

- Check-in-Balken: `startPx + 2px` (Balken beginnt 2px später)
- Check-out-Balken: `endPx - 2px` (Balken endet 2px früher)

Dies erzeugt eine sichtbare 4px Lücke zwischen aufeinanderfolgenden Buchungen, die die Übergabe klar darstellt.

## Technische Änderung

**Datei:** `src/components/Calendar/BookingTimeline.tsx`

In der `getBarStyle`-Funktion die Pixel-Berechnung anpassen:

```typescript
const startPx = (startOffsetDays + (isCheckInInMonth ? 0.5 : 0)) * DAY_WIDTH + (isCheckInInMonth ? 2 : 0);
const endPx = (endOffsetDays + (isCheckOutInMonth ? 0.5 : 0)) * DAY_WIDTH - (isCheckOutInMonth ? 2 : 0);
```

Eine minimale Änderung in einer Datei, zwei Zeilen.
