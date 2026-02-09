

# Sortierrichtung in der Buchungsuebersicht

## Was wird gemacht

Ein Sortier-Button wird **rechts neben dem Zeitraum-Filter** platziert. Er gilt fuer **alle Status-Auswahlen** (nicht nur fuer einen bestimmten Status). Per Klick wechselt er zwischen aufsteigend und absteigend (nach Check-in-Datum).

## Umsetzung

### Datei: `src/pages/OriginalDashboard.tsx`

**1. Neuer State (bei Zeile ~106, neben den anderen Filter-States)**

```typescript
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
```

**2. Sortierung in `filteredBookings` einbauen (Zeile ~599-656)**

Am Ende des `useMemo`, nach dem `.filter()`, wird `.sort()` angehaengt:

```typescript
return bookingsData.filter(booking => {
  // ... bestehende Filter-Logik ...
}).sort((a, b) => {
  const dateA = new Date(a.check_in).getTime();
  const dateB = new Date(b.check_in).getTime();
  return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
});
```

`sortDirection` wird zur Dependency-Liste hinzugefuegt.

**3. Sortier-Button in der Filterleiste (nach Zeile ~2334, direkt nach dem Zeitraum-Select)**

Ein kompakter Button rechts neben "Alle Zeitraeume":

```tsx
{/* Sort Direction Toggle */}
<button
  className="px-3 py-2 border border-gray-300 rounded-md text-sm flex items-center gap-1 hover:bg-gray-50"
  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
  title={sortDirection === 'asc' ? 'Aufsteigend (aelteste zuerst)' : 'Absteigend (neueste zuerst)'}
>
  {sortDirection === 'asc' ? (
    <ChevronUp className="w-4 h-4" />
  ) : (
    <ChevronDown className="w-4 h-4" />
  )}
  {sortDirection === 'asc' ? '↑ Aufsteigend' : '↓ Absteigend'}
</button>
```

## Ergebnis

- Der Sortier-Button erscheint **rechts neben dem Zeitraum-Filter** in der Filterleiste
- Funktioniert mit **allen Status-Filtern** (Bestaetigt, Eingecheckt, Abgeschlossen, Storniert, Alle)
- Default: Aufsteigend (aelteste Buchung zuerst)
- Per Klick umschalten auf Absteigend (neueste zuerst)

