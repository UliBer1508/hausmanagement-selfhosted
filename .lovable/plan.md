
# Bug-Fix: Gantt-Kalender — Falsche Balken-Positionierung

## Wurzel des Problems (100% identifiziert)

### Problem 1: `flex-1` macht Spalten breiter als 28px

Das Grid-Header verwendet:
```html
<div class="flex-1 min-w-[28px] md:min-w-[32px]">
```

`flex-1` bedeutet: Jede Spalte wächst gleichmäßig um den verfügbaren Platz zu füllen. Auf einem 1200px Desktop:

```
Container = 1200px - 160px (Haus-Spalte) = 1040px
Spaltenbreite = 1040px / 28 Tage = 37.1px pro Tag (NICHT 28px!)
```

Aber `getBarStyle` rechnet mit `dayWidth = 100 / 28 = 3.571%`:
- `left = 17.5 × 3.571% = 62.5%`
- 62.5% von 1040px = **650px**
- Korrekte Position von Tag 18: `17 × 37.1px = 631px`

Das ergibt einen **Versatz von 19px** — das entspricht fast einem halben Tag-Fehler.

Und mit der zusätzlichen `+0.5` Halbe-Tag-Verschiebung wird es noch schlimmer.

### Problem 2: Halbe-Tag-Logik addiert einen falschen Versatz

```typescript
const adjustedStart = startOffset + (isCheckInInMonth ? 0.5 : 0);
```

Für Lea Wolf (check_in = 18. Feb):
- `startOffset = 17`
- `adjustedStart = 17 + 0.5 = 17.5` ← falsch, soll genau bei Tag 18 starten
- `left = 17.5 × 3.571% = 62.5%`

Statt 17 × 3.571% = 60.71% (= Anfang Tag 18). Der Balken startet sichtbar bei **Tag 19** statt Tag 18.

### Warum Lea als 16.–19. erscheint

Mit beiden Fehlern zusammen:
- `flex-1` Spalten sind breiter als 28px (z.B. 37px)
- `+0.5 Tag` Offset verschiebt nach rechts
- Prozentwert stimmt nicht mit der tatsächlichen Spaltenbreite überein

Kombiniert: Der Balken erscheint 2 Tage zu spät und hat falsche Breite.

## Die Lösung: Prozent statt `flex` + kein Halbtag-Offset

### Ansatz 1 (bevorzugt): Grid auf feste Pixelbreite umstellen

Statt `flex-1` (wächst) → feste Breite `w-7` (= 28px) für jede Spalte. Dann stimmt die Pixel-Positionierung exakt:

**Header-Spalten:** `flex-1 min-w-[28px]` → `w-7 shrink-0` (= genau 28px)
**Hintergrund-Raster:** gleiche Änderung
**Container:** `minWidth: daysInMonth * 28` bleibt gleich (scroll funktioniert weiter)
**Balken:** `left = startOffset * 28 + "px"`, `width = duration * 28 + "px"`

### Konkrete Änderungen in `BookingTimeline.tsx`

#### 1. Konstante `DAY_WIDTH = 28` hinzufügen

```typescript
const DAY_WIDTH = 28; // px — identisch zu w-7 (7 × 4px = 28px)
```

#### 2. `getBarStyle` — vereinfacht, kein Halbtag, Pixel statt Prozent

```typescript
const getBarStyle = (booking: Booking) => {
  const checkIn = parseLocalDate(booking.check_in);
  const checkOut = parseLocalDate(booking.check_out);
  const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
  const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
  
  const barStart = checkIn < monthStart ? monthStart : checkIn;
  const barEnd = checkOut > monthEnd ? monthEnd : checkOut;
  
  const startOffset = differenceInDays(barStart, monthStart);
  const duration = differenceInDays(barEnd, barStart);
  
  return {
    left: `${startOffset * DAY_WIDTH}px`,
    width: `${Math.max(duration * DAY_WIDTH, DAY_WIDTH * 0.5)}px`
  };
};
```

**Ergebnis für Lea Wolf (18.–22. Feb):**
- `startOffset = diff(18.Feb, 01.Feb) = 17`
- `left = 17 × 28 = 476px` → Exakt Anfang der Spalte für Tag 18 ✅
- `duration = diff(22.Feb, 18.Feb) = 4`
- `width = 4 × 28 = 112px` → Exakt 4 Tages-Spalten breit ✅

**Ergebnis für Maximilian (22.Feb – 01.März):**
- `startOffset = 21` → `left = 21 × 28 = 588px` = Anfang Tag 22 ✅
- `duration = diff(01.März, 22.Feb) = 7` → `width = 7 × 28 = 196px` ✅

#### 3. Header-Spalten: `flex-1 min-w-[28px]` → `w-7 shrink-0`

```tsx
// Vorher:
<div className="flex-1 min-w-[28px] md:min-w-[32px] text-center text-xs ...">

// Nachher:
<div className="w-7 shrink-0 text-center text-xs ...">
```

#### 4. Hintergrund-Raster: gleiche Änderung

```tsx
// Vorher:
<div className="flex-1 min-w-[28px] md:min-w-[32px] border-r border-border/50 ...">

// Nachher:
<div className="w-7 shrink-0 border-r border-border/50 ...">
```

#### 5. Balken-Element: `minWidth` anpassen

```tsx
style={{ 
  left: style.left,   // jetzt px statt %
  width: style.width, // jetzt px statt %
  top: `${8 + verticalOffset}px`
  // minWidth: '45px' kann bleiben oder entfernt werden
}}
```

## Verifikation der Berechnung

| Buchung | DB check_in | startOffset | left (px) | duration | width (px) | Korrekt? |
|---------|-------------|-------------|-----------|----------|------------|---------|
| Oliver | 01.Feb | 0 | 0px | 7 | 196px | ✅ Tag 1–8 |
| Peter | 14.Feb | 13 | 364px | 4 | 112px | ✅ Tag 14–18 |
| Lea Wolf | 18.Feb | 17 | 476px | 4 | 112px | ✅ Tag 18–22 |
| Maximilian | 22.Feb | 21 | 588px | 7 | 196px | ✅ Tag 22–01.März |
| L.R. Prins | 21.Feb | 20 | 560px | 7 | 196px | ✅ Tag 21–28 |

## Dateien

- `src/components/Calendar/BookingTimeline.tsx` — alle Änderungen in einer Datei:
  1. `DAY_WIDTH = 28` Konstante hinzufügen
  2. `getBarStyle` vereinfachen (Pixel, kein Halbtag)
  3. Header-Spalten: `flex-1 min-w-[28px]` → `w-7 shrink-0`
  4. Raster-Spalten: gleiche Änderung
