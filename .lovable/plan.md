
# Checkbox "auch eingecheckte Buchungen" hinzufügen

## Ziel

Eine Checkbox rechts neben der "Alle Zeiträume"-Dropdown hinzufügen, die es ermöglicht, eingecheckte Buchungen zusätzlich zu den bestätigten Buchungen anzuzeigen.

## Aktuelles Verhalten

- Der Status-Filter steht standardmäßig auf "Bestätigt"
- Es werden nur Buchungen mit dem gewählten Status angezeigt
- Um eingecheckte Buchungen zu sehen, muss man den Status-Filter auf "Eingecheckt" oder "Alle Status" umstellen

## Neues Verhalten

- Neue Checkbox "auch eingecheckte Buchungen" rechts neben "Alle Zeiträume"
- Wenn aktiviert: Zeigt sowohl `confirmed` als auch `checked_in` Buchungen an
- Die Checkbox ist nur sichtbar/relevant, wenn Status-Filter auf "Bestätigt" steht

## Technische Umsetzung

### 1. Neue State-Variable

**Datei:** `src/pages/OriginalDashboard.tsx`

```typescript
// Bei den anderen Filter-States (ca. Zeile 103)
const [includeCheckedIn, setIncludeCheckedIn] = useState(false);
```

### 2. Filter-Logik anpassen

**Datei:** `src/pages/OriginalDashboard.tsx`

```typescript
// Im filteredBookings useMemo (ca. Zeile 614-617)
// Status filter - erweitert um Checkbox-Logik
if (statusFilter !== 'all') {
  if (statusFilter === 'confirmed' && includeCheckedIn) {
    // Zeige confirmed UND checked_in
    if (booking.status !== 'confirmed' && booking.status !== 'checked_in') {
      return false;
    }
  } else if (booking.status !== statusFilter) {
    return false;
  }
}
```

Dependency-Array erweitern:
```typescript
}, [bookingsData, searchTerm, statusFilter, houseFilter, timePeriodFilter, includeCheckedIn]);
```

### 3. Checkbox zur Filter-UI hinzufügen

**Datei:** `src/pages/OriginalDashboard.tsx`

Rechts neben dem Time Period Filter (nach Zeile 2325):

```typescript
{/* Time Period Filter */}
<select 
  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
  value={timePeriodFilter}
  onChange={(e) => setTimePeriodFilter(e.target.value)}
>
  {timePeriods.map(period => (
    <option key={period.value} value={period.value}>
      {period.label}
    </option>
  ))}
</select>

{/* Checkbox: Auch eingecheckte Buchungen */}
{statusFilter === 'confirmed' && (
  <label className="flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap">
    <Checkbox 
      checked={includeCheckedIn}
      onCheckedChange={(checked) => setIncludeCheckedIn(checked === true)}
    />
    <span>auch eingecheckte</span>
  </label>
)}
```

### 4. Checkbox-Import hinzufügen

**Datei:** `src/pages/OriginalDashboard.tsx`

```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

## Ergebnis

| Aktion | Ergebnis |
|--------|----------|
| Status = "Bestätigt", Checkbox aus | Nur bestätigte Buchungen |
| Status = "Bestätigt", Checkbox an | Bestätigte + eingecheckte Buchungen |
| Status = anderer Wert | Checkbox nicht sichtbar, normales Verhalten |

## Änderungen

| Datei | Änderung |
|-------|----------|
| `src/pages/OriginalDashboard.tsx` | Import + State + Filter-Logik + Checkbox-UI |
