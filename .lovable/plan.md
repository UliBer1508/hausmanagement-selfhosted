
# Bug-Analyse: Gantt-Balken — falsche Positionen trotz Fix

## Was der Screenshot zeigt (ist korrekt!)

Nach dem letzten Fix zeigt der Screenshot bereits:
- **Lea (4N)** ist sichtbar vom 18.–22. Feb ✅
- **Peter (4N)**, **Daniel (4N)**, **Enrico (7N)**, **Oliver (7N)**, **L.R. (7N)**, **Maximilian (7N)** — alle korrekte Nächte-Zahlen ✅

Die Buchungen werden also angezeigt. Was der User als "falsch" beschreibt ist wahrscheinlich die **visuelle Positionierung** der Balken — sie starten/enden einen halben Tag zu früh oder zu spät.

## Das eigentliche verbleibende Problem: Halbe-Tag-Logik

Die aktuelle `getBarStyle` Funktion enthält diese Logik:

```typescript
// Start: +0.5 wenn Check-in im sichtbaren Monat (15:00 = Nachmittag)
const adjustedStart = startOffset + (isCheckInInMonth ? 0.5 : 0);

// Breite: Duration + 0.5 für Check-out (10:00 = Vormittag endet halben Tag)
const adjustedDuration = duration + (isCheckOutInMonth ? 0.5 : 1) - (isCheckInInMonth ? 0.5 : 0);
```

**Das Problem:** `isCheckInInMonth` und `isCheckOutInMonth` vergleichen `checkIn` (lokale Mitternacht) mit `monthStart`/`monthEnd` (ebenfalls lokale Mitternacht). Wenn Lea Wolf check_in = "2026-02-18" und monthEnd = "2026-02-28", dann ist `checkIn (18.02) <= monthEnd (28.02)` ✅ und `checkIn >= monthStart (01.02)` ✅ — also `isCheckInInMonth = true` → **+0.5 Offset** wird korrekt hinzugefügt.

Lea: startOffset = diff(18.Feb, 01.Feb) = 17 Tage. adjustedStart = 17 + 0.5 = 17.5 → Position bei Tag 18, Nachmittag ✅

**Echter Fehler:** Der `barEnd` Clamp:
```typescript
const barEnd = checkOut > monthEnd ? monthEnd : checkOut;
```
`monthEnd` = 28. Feb (letzter Tag). `checkOut` für Maximilian = 01. März. Also `barEnd = 28. Feb`. Dann:
- `duration = diff(28.Feb, 22.Feb) = 6`
- `isCheckOutInMonth = checkOut (01.März) >= monthStart (01.Feb) && checkOut <= monthEnd (28.Feb)` → **01. März > 28. Feb → false!**
- `adjustedDuration = 6 + 1 - 0.5 = 6.5` statt der erwarteten 6.5 — eigentlich korrekt für den sichtbaren Teil.

## Hauptproblem: Sichtbarkeitscheck-Grenze

Die `isBookingVisible` Funktion prüft:
```typescript
return checkIn <= monthEnd && checkOut >= monthStart;
```

`monthEnd = new Date('2026-02-28T00:00:00')` = 28. Feb Mitternacht.

Für eine Buchung die am **28. Feb eincheckt** (checkIn = 28.Feb 00:00):
- `checkIn (28.Feb 00:00) <= monthEnd (28.Feb 00:00)` → true ✅

Aber für eine Buchung die am **01. März auscheckt** und am **28. Feb** eincheckt ist checkOut = 01. März → `checkOut (01.März) >= monthStart (01.Feb)` → true ✅ — das ist korrekt.

## Echter Fix: monthEnd-Grenze ist zu eng

Das Problem ist, dass `monthEnd` auf den **letzten Tag** gesetzt wird (28. Feb 00:00), aber der Tag selbst hat 24 Stunden. Eine Buchung die am 28. Feb beginnt und am 7. März endet sollte im Februar sichtbar sein — und ist es (weil checkIn = 28.Feb <= monthEnd = 28.Feb ✅).

**Aber** der Balken wird geclamped auf `monthEnd = 28.Feb 00:00`. Der `duration = diff(28.Feb 00:00, 28.Feb 00:00) = 0`. Das ergibt einen Balken mit Breite 0 + Anpassungen = nur 0.5 Tage → **zu schmal**.

Die Lösung: `monthEnd` sollte auf **Ende des letzten Tages** gesetzt werden, also **+1 Tag** nach dem letzten Tag:

```typescript
// Aktuell (falsch): monthEnd = 28. Feb 00:00
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');

// Korrekt: monthEnd = 1. März 00:00 (= Ende von 28. Feb)
const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
```

Dann:
- Sichtbarkeitsprüfung: `checkOut >= monthStart` und `checkIn <= monthEnd (= 1. März 00:00)`
- Clamping: `barEnd = min(checkOut, monthEnd)` — bleibt sinnvoll

## Konkrete Änderungen in `BookingTimeline.tsx`

### 1. `getBarStyle` — `monthEnd` auf Ende des letzten Tages setzen
```typescript
// Vorher:
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');

// Nachher: daysInMonth statt daysInMonth - 1 → = Anfang des nächsten Monats
const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
```

### 2. `isBookingVisible` — gleiche Anpassung
```typescript
// Vorher:
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');

// Nachher:
const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
```

### 3. Halbe-Tag-Logik bereinigen

Die aktuelle Logik für `isCheckOutInMonth` muss ebenfalls angepasst werden — ein Checkout am nächsten Monat (z.B. Maximilian: 01. März) soll im letzten sichtbaren Tag noch "halbiert" enden. Die Prüfung:

```typescript
const isCheckOutInMonth = checkOut >= monthStart && checkOut <= monthEnd;
```

Mit dem neuen `monthEnd = 01. März`: Maximilian checkOut = 01. März 00:00 ≤ monthEnd 01. März 00:00 → `isCheckOutInMonth = true` → Balken endet mit +0.5 Offset ✅

### 4. Balken-Clamping korrigieren

Der Clamp für `barEnd`:
```typescript
const barEnd = checkOut > monthEnd ? monthEnd : checkOut;
```

Mit neuem `monthEnd (01.März)` und Maximilian `checkOut (01.März)`:
- `barEnd = min(01.März, 01.März) = 01.März`
- `duration = diff(01.März, 22.Feb) = 7` ✅
- `adjustedDuration = 7 + 0.5 - 0.5 = 7` ✅

## Ergebnis nach Fix

| Buchung | Vorher | Nachher |
|---------|--------|---------|
| Lea Wolf 18–22.Feb | Möglicherweise gekürzt | 4N korrekt positioniert |
| Maximilian 22.Feb–01.März | Balken endet zu früh (28.Feb geclamped auf 0 width) | Balken geht bis Monatsende + halber Tag |
| Alle anderen | Korrekt | Korrekt |

## Datei
- `src/components/Calendar/BookingTimeline.tsx` — 2 Stellen (`getBarStyle` + `isBookingVisible`)
