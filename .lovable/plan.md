

# Fix: Checkout am Monatsanfang bekommt keinen Halbtag-Versatz

## Problem
Maximilian checkt am 1. März aus, Martin checkt am 1. März ein. Beim Betrachten von **März** wird `isCheckOutInMonth` für Maximilian zu `false`, weil die Bedingung `checkOut > monthStart` bei `1. März > 1. März` fehlschlägt (strict greater). Der Balken endet daher bei Pixel 0 statt bei 14px (Tagesmitte), und es gibt keine sichtbare Lücke zu Martins Balken.

Image 2 (Peter/Lea/Maximilian) zeigt das korrekte Verhalten bei Übergaben **innerhalb** eines Monats -- dort funktioniert die Halbtag-Logik bereits.

## Lösung

**Datei:** `src/components/Calendar/BookingTimeline.tsx`, Zeile 121

Änderung von `>` zu `>=`:

```typescript
// Vorher:
const isCheckOutInMonth = checkOut > monthStart && checkOut < monthEnd;

// Nachher:
const isCheckOutInMonth = checkOut >= monthStart && checkOut < monthEnd;
```

Damit wird ein Checkout am 1. Tag des Monats korrekt als "im Monat sichtbar" erkannt und bekommt den Halbtag-Versatz (+0.5 Tage = 14px). In Kombination mit dem 2px-Buffer ergibt sich eine saubere 4px-Lücke zwischen Maximilian und Martin.

## Auswirkung
- Checkout am Monatsanfang: Balken endet nun bei ~12px statt 0px
- Checkout mitten im Monat: Keine Änderung (war schon korrekt)
- Checkout am Monatsende / außerhalb: Keine Änderung

Eine Zeile, ein Zeichen.

