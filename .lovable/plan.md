

## Plan: App-Bewertungen Filterlogik korrigieren

### Problem-Analyse

Die App-Bewertungen werden nicht angezeigt, weil die Filterlogik in `AppReviewsSection.tsx` fehlerhaft ist:

**Aktuelle Situation:**
- `GuestAppTracking.tsx` uebergibt: `selectedHouseId={filters.houseId === 'all' ? '' : filters.houseId}`
- Das bedeutet: Wenn "Alle Haeuser" gewaehlt ist, wird ein **leerer String** `''` uebergeben

**Fehlerhafte Logik in AppReviewsSection.tsx:**
```typescript
if (selectedHouseId !== 'all') {
  query = query.eq('bookings.house_id', selectedHouseId);
}
```

**Problem:**
- `'' !== 'all'` ergibt `true`
- Die Query filtert dann nach `house_id = ''`
- Das liefert keine Ergebnisse!

### Loesung

In `AppReviewsSection.tsx` beide Query-Filter korrigieren:

**Aenderung 1 - Zeile 76-78 (App Reviews Query):**
```typescript
// Von:
if (selectedHouseId !== 'all') {
  query = query.eq('bookings.house_id', selectedHouseId);
}

// Zu:
if (selectedHouseId && selectedHouseId !== 'all') {
  query = query.eq('bookings.house_id', selectedHouseId);
}
```

**Aenderung 2 - Zeile 95-97 (Total Bookings Count Query):**
```typescript
// Von:
if (selectedHouseId !== 'all') {
  query = query.eq('house_id', selectedHouseId);
}

// Zu:
if (selectedHouseId && selectedHouseId !== 'all') {
  query = query.eq('house_id', selectedHouseId);
}
```

### Technische Details

| Datei | Zeilen | Aenderung |
|-------|--------|-----------|
| `src/components/Guests/AppReviewsSection.tsx` | 76-78 | `selectedHouseId &&` vor Filterung hinzufuegen |
| `src/components/Guests/AppReviewsSection.tsx` | 95-97 | `selectedHouseId &&` vor Filterung hinzufuegen |

### Ergebnis

Nach der Korrektur:
- Leerer String `''` oder `'all'` = Keine Filterung, alle Bewertungen werden angezeigt
- UUID = Nur Bewertungen fuer das spezifische Haus
- Die vorhandene Bewertung (5 Sterne von Test Gast) wird korrekt angezeigt

