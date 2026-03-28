

# Fix: Reinigungskosten-Berechnung zu hoch

## Befund

Die `cleaningCostsForYear`-Berechnung in `BookingOverviewFixed.tsx` (Zeile 411-421) summiert **alle** `service_tasks` mit `service_type === 'cleaning'` im gewählten Jahr — ohne stornierte (`cancelled`) Aufträge auszuschließen.

Das bedeutet: Stornierte Buchungen mit Reinigungsaufträgen, die ebenfalls storniert wurden, fließen trotzdem in die Kostensumme ein.

## Fix

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

Eine zusätzliche Filterbedingung in der `cleaningCostsForYear`-Berechnung:

```typescript
const yearTasks = serviceTasks.filter(t => 
  t.service_type === 'cleaning' && 
  t.scheduled_date && 
  t.status !== 'cancelled' &&   // ← NEU: Stornierte ausschließen
  new Date(t.scheduled_date).getFullYear() === selectedYear
);
```

Nur diese eine Zeile wird ergänzt. Keine weiteren Änderungen nötig.

