
# Bug-Fix: `parseLocalDate` bekommt falschen Input von `.toISOString()`

## Problem

In `BookingTimeline.tsx` wird `monthStart` und `monthEnd` so berechnet:

```typescript
const monthStart = parseLocalDate(startDate.toISOString());
const monthEnd = parseLocalDate(addDays(startDate, daysInMonth - 1).toISOString());
```

`startDate` ist ein lokales JavaScript-Date-Objekt (`startOfMonth(selectedDate)`). Wenn `.toISOString()` darauf aufgerufen wird, **konvertiert es das Datum nach UTC**. In einer CET-Zeitzone (UTC+1) ergibt das:

```
startDate = "2026-02-01T00:00:00" (lokal)  
startDate.toISOString() = "2026-01-31T23:00:00.000Z"  ← Ein Tag früher!
```

`parseLocalDate` nimmt dann die ersten 10 Zeichen: `"2026-01-31"` → Der Monatsstart ist plötzlich der **31. Januar statt 1. Februar**.

Das führt dazu, dass `isBookingVisible` mit falschem `monthStart`/`monthEnd` rechnet und Buchungen wie Lea Wolf (18.–22. Feb) als **nicht sichtbar** eingestuft werden.

Dasselbe gilt für `getBarStyle` — auch dort werden falsche Grenzen berechnet, was Positionen und Breiten verfälscht.

## Lösung

Statt `startDate.toISOString()` muss das Datum direkt mit `format()` zu einem lokalen ISO-String umgewandelt werden, ohne UTC-Konvertierung:

```typescript
// FALSCH: UTC-Offset verfälscht das Datum
parseLocalDate(startDate.toISOString())

// RICHTIG: Direkte Formatierung als lokales Datum
parseLocalDate(format(startDate, 'yyyy-MM-dd') + 'T00:00:00')
```

Oder noch einfacher — da `startDate` bereits ein lokales Date-Objekt ist, kann man es direkt als `monthStart` verwenden ohne Umweg über `parseLocalDate`:

```typescript
const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');
```

## Betroffene Stellen in `BookingTimeline.tsx`

Zwei Funktionen betroffen — jeweils dieselbe falsche Berechnung:

### `getBarStyle` (Zeile 110–111)
```typescript
// Vorher (falsch):
const monthStart = parseLocalDate(startDate.toISOString());
const monthEnd = parseLocalDate(addDays(startDate, daysInMonth - 1).toISOString());

// Nachher (korrekt):
const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');
```

### `isBookingVisible` (Zeile 149–150)
```typescript
// Vorher (falsch):
const monthStart = parseLocalDate(startDate.toISOString());
const monthEnd = parseLocalDate(addDays(startDate, daysInMonth - 1).toISOString());

// Nachher (korrekt):
const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
const monthEnd = new Date(format(addDays(startDate, daysInMonth - 1), 'yyyy-MM-dd') + 'T00:00:00');
```

Außerdem muss `format` zum bestehenden Import hinzugefügt werden (es ist schon importiert — kein Problem).

## Ergebnis nach Fix

| Vorher | Nachher |
|--------|---------|
| `monthStart` = 31. Januar (UTC-Fehler) | `monthStart` = 1. Februar (korrekt) |
| Lea Wolf nicht sichtbar im Februar | Lea Wolf korrekt von 18.–22. Feb angezeigt |
| Balken-Positionen verschoben | Alle Balken korrekt positioniert |

## Technische Datei
- `src/components/Calendar/BookingTimeline.tsx` — 2 Stellen anpassen
