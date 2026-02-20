
# Bug-Fix: Gantt-Balken Datumsberechnung (Zeitzonenkonvertierung)

## Problem-Analyse

**Lea Wolf** hat Check-in am 18.02.2026 (15:00 Lokal) und Check-out am 22.02.2026 (10:00 Lokal).

In der Datenbank gespeichert als UTC:
- `check_in: 2026-02-18 14:00:00+00` (UTC = CET-1)
- `check_out: 2026-02-22 09:00:00+00` (UTC = CET-1)

### Ursache des Bugs

In `BookingTimeline.tsx` Zeile 101-102:
```typescript
const checkIn = startOfDay(parseISO(booking.check_in));
const checkOut = startOfDay(parseISO(booking.check_out));
```

`parseISO("2026-02-22 09:00:00+00")` ergibt in manchen Browser-Umgebungen/Timezones den Zeitstempel direkt als UTC. Wenn dann `startOfDay()` (lokale Mitternacht) berechnet wird, kann das Ergebnis je nach Systemzeit abweichen. Der eigentliche Fehler ist, dass die **Datumsdifferenz** falsch berechnet wird, weil Zeitstempel-Differenzen ohne korrekte lokale Tagesumrechnung genutzt werden.

**`getNights`** berechnet:
```typescript
differenceInDays("2026-02-22 09:00+00", "2026-02-18 14:00+00")
= differenceInDays(3.79 Tage) → trunciert zu 3
```
Statt der korrekten **4 Nächte**.

**`getBarStyle`** nutzt ebenfalls `startOfDay(parseISO(...))` — wenn der Browser UTC läuft oder der Timestamp sehr früh am Morgen liegt, springt `startOfDay` auf den Vortag.

### Lösung

Die Berechnung muss auf **Datum-Ebene** (Jahr/Monat/Tag als lokale Datumswerte) arbeiten, nicht auf Millisekunden-Differenzen von UTC-Timestamps.

**Korrekte Methode:** Extrahiere das lokale Datum direkt aus dem ISO-String (die Datumskomponente vor dem `T`), um Zeitzonenverschiebungen zu vermeiden:

```typescript
// Statt: startOfDay(parseISO(booking.check_out))
// Besser: new Date(booking.check_out.substring(0, 10) + 'T00:00:00')
```

Oder: Nutze `parseISO` und extrahiere nur Jahr/Monat/Tag als Datum ohne Zeitanteil.

## Betroffene Datei

**`src/components/Calendar/BookingTimeline.tsx`**

## Konkrete Änderungen

### 1. Hilfsfunktion `parseLocalDate` hinzufügen (oben in der Datei)
```typescript
// Extrahiert lokales Datum aus ISO-String, ignoriert Zeitzone
const parseLocalDate = (isoString: string): Date => {
  const datePart = isoString.substring(0, 10); // "2026-02-22"
  return new Date(datePart + 'T00:00:00'); // Lokale Mitternacht
};
```
Das "T00:00:00" ohne Timezone-Suffix interpretiert den String immer lokal, egal in welcher Timezone der Browser läuft.

### 2. `getBarStyle` anpassen (Zeile 101-102)
```typescript
const checkIn = parseLocalDate(booking.check_in);
const checkOut = parseLocalDate(booking.check_out);
```

### 3. `isBookingVisible` anpassen (Zeile 141-142)
```typescript
const checkIn = parseLocalDate(booking.check_in);
const checkOut = parseLocalDate(booking.check_out);
```

### 4. `getNights` anpassen (Zeile 152-153)
```typescript
const getNights = (booking: Booking) => {
  const checkIn = parseLocalDate(booking.check_in);
  const checkOut = parseLocalDate(booking.check_out);
  return differenceInDays(checkOut, checkIn);
};
```

### 5. `bookingsOverlap` anpassen (Zeile 70-73)
```typescript
const aStart = parseLocalDate(a.check_in);
const aEnd = parseLocalDate(a.check_out);
const bStart = parseLocalDate(b.check_in);
const bEnd = parseLocalDate(b.check_out);
```

## Ergebnis nach Fix

| Vorher | Nachher |
|--------|---------|
| Lea zeigt "(3N)" | Lea zeigt "(4N)" |
| Balken endet am 19. Feb | Balken endet korrekt am 22. Feb |
| UTC-Zeitstempel verursacht Off-by-One | Lokales Datum immer korrekt |

## Warum dieser Ansatz sicher ist

- Der ISO-String `"2026-02-22 09:00:00+00"` enthält die UTC-Zeit 09:00. Bei `substring(0, 10)` nehmen wir nur `"2026-02-22"` — das ist das **korrekte lokale Datum** des Check-outs (10:00 Uhr Wien = 09:00 UTC → Datum = 22. Feb).
- `new Date("2026-02-22T00:00:00")` ohne Timezone = lokale Mitternacht = stabil in allen Browsern.
- Alle anderen Berechnungen (differenceInDays, isSameDay) arbeiten dann korrekt auf Tages-Ebene.
