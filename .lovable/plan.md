
# Fix: Halbtagslogik in Pixeln für Check-in 15:00 / Check-out 10:00

## Das eigentliche Problem

Der User hat Recht: Der 22. Feb ist für Lea der Check-out Tag um 10:00 Uhr. Die neuen Gäste (Maximilian) checken um 15:00 Uhr ein. Der Balken soll das visuell darstellen:

- **Lea (18.Feb 15:00 → 22.Feb 10:00)**:  
  Balken startet in der **Mitte von Tag 18** (15:00 = Nachmittag) und endet in der **Mitte von Tag 22** (10:00 ≈ Vormittag)
- **Maximilian (22.Feb 15:00 → 01.März)**:  
  Balken startet in der **Mitte von Tag 22** (15:00) und geht bis Monatsende

Die alte Implementierung hatte diese Idee, aber verwendete **Prozent** statt **Pixel** → Misalignment mit dem Grid.  
Der letzte Fix hat die Halbtagslogik komplett entfernt → Balken starten jetzt am Tagesbeginn statt um 15:00.

## Korrekte Berechnung mit Pixeln

```
DAY_WIDTH = 28px (pro Tag)

Check-in im sichtbaren Monat → +0.5 * DAY_WIDTH = +14px (15:00 Uhr)
Check-out im sichtbaren Monat → +0.5 * DAY_WIDTH = +14px (10:00 Uhr)
```

### Für Lea (18.Feb–22.Feb):
- `startOffset = 17` (Tage von Monatsanfang bis 18.Feb)
- Check-in im Monat → `startPx = (17 + 0.5) * 28 = 490px` → Mitte von Tag 18 ✅
- `endOffset = 21` (Tage von Monatsanfang bis 22.Feb)
- Check-out im Monat → `endPx = (21 + 0.5) * 28 = 602px` → Mitte von Tag 22 ✅
- `width = 602 - 490 = 112px = 4 Tage` ✅

### Für Maximilian (22.Feb–01.März):
- Check-in im Monat → `startPx = (21 + 0.5) * 28 = 602px` → Mitte von Tag 22 ✅
- Check-out = 01.März = monthEnd (Monatsgrenze) → KEIN +0.5 (Balken geht bis Monatsende)
- `endPx = 28 * 28 = 784px` → Ende von Feb ✅
- `width = 784 - 602 = 182px` ✅

### Für Buchungen die den Monat überschreiten (Eintritt vor Monat):
- barStart = monthStart, checkIn liegt VOR dem Monat → KEIN +0.5 (Balken beginnt am Monatsanfang)
- `startPx = 0 * 28 = 0px` ✅

## Neue `getBarStyle` Logik

```typescript
const getBarStyle = (booking: Booking) => {
  const checkIn = parseLocalDate(booking.check_in);
  const checkOut = parseLocalDate(booking.check_out);
  const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
  const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
  
  const barStart = checkIn < monthStart ? monthStart : checkIn;
  const barEnd = checkOut > monthEnd ? monthEnd : checkOut;
  
  // +0.5 nur wenn check_in/out im sichtbaren Monat liegt (nicht geclampt)
  // → check_in im Monat = Check-in um 15:00 Nachmittag
  // → check_out im Monat (vor Monatsgrenze) = Check-out um 10:00 Vormittag
  const isCheckInInMonth = checkIn >= monthStart && checkIn < monthEnd;
  const isCheckOutInMonth = checkOut > monthStart && checkOut < monthEnd;
  
  const startOffsetDays = differenceInDays(barStart, monthStart);
  const endOffsetDays = differenceInDays(barEnd, monthStart);
  
  const startPx = (startOffsetDays + (isCheckInInMonth ? 0.5 : 0)) * DAY_WIDTH;
  const endPx = (endOffsetDays + (isCheckOutInMonth ? 0.5 : 0)) * DAY_WIDTH;
  
  return {
    left: `${startPx}px`,
    width: `${Math.max(endPx - startPx, DAY_WIDTH * 0.5)}px`
  };
};
```

## Entscheidende Unterschiede zur alten (fehlerhaften) Logik

| Problem | Alt (Prozent) | Neu (Pixel) |
|---------|--------------|-------------|
| Positionierungstyp | `%` → skaliert mit Container | `px` → exakt wie Grid `w-7` |
| Halbtag-Check-in | `isCheckInInMonth = checkIn <= monthEnd` (zu weit) | `checkIn < monthEnd` (strikt) |
| Halbtag-Check-out | `isCheckOutInMonth = checkOut <= monthEnd` | `checkOut < monthEnd` (strikt, schließt Monatsgrenze aus) |
| Berechnung | `adjustedStart` + `adjustedDuration` (fehleranfällig) | `startPx` + `endPx` (direkt und klar) |

## Visuelles Ergebnis für Februar 2026

```
Tag:    18        19        20        21        22
        |----✗----|---------|---------|----✗----|
             Lea (15:00)              (10:00)
                                          |----|
                                     Maximilian (15:00→)
```

- Lea's Balken beginnt in der Mitte von Tag 18 und endet in der Mitte von Tag 22 ✅
- Maximilian's Balken beginnt in der Mitte von Tag 22 ✅
- Zwischen 10:00 (Lea checkout) und 15:00 (Maximilian checkin) am 22. Feb ist eine sichtbare Lücke ✅

## Datei

Nur eine Datei zu ändern: `src/components/Calendar/BookingTimeline.tsx`

Einzige Änderung: Die `getBarStyle` Funktion (ca. Zeilen 108–127) ersetzen mit der neuen Pixel+Halbtag-Logik.
