

# Min. Nächte editierbar machen

## Problem
Aktuell wird die Anzahl der Nächte nur angezeigt (`{nightsCount} Nächte`) und ergibt sich aus Check-in/Check-out. Der User will die Nächte direkt ändern können, damit sich das Check-out automatisch anpasst.

## Änderung

### `ScrapePricesDialog.tsx`

1. **Nächte-Anzeige durch Input ersetzen** (Zeile 370-378): Statt dem statischen Text `{nightsCount} Nächte` ein editierbares Zahlenfeld "Nächte" einfügen. Bei Änderung wird `checkOut` automatisch auf `checkIn + N Tage` gesetzt.

2. **Check-out Änderung synchronisiert Nächte**: Wenn der User das Check-out manuell ändert, berechnen sich die Nächte automatisch (bereits so implementiert über `nightsCount`).

3. **Nächte in gespeicherte Suchparameter aufnehmen** (Zeile 387-391): `nights` zum `scrape_search_params` Objekt hinzufügen und beim Laden wiederherstellen.

Konkret wird die Zeile 370-378 so geändert:
```tsx
<div className="flex items-center gap-4">
  <div className="space-y-2 flex-1">
    <Label>Personen</Label>
    <Input type="number" min={1} max={20} value={guests} onChange={...} />
  </div>
  <div className="space-y-2 w-24">
    <Label>Nächte</Label>
    <Input type="number" min={1} max={30} value={nightsCount} 
      onChange={(e) => {
        const n = parseInt(e.target.value) || 7;
        setCheckOut(addDays(checkIn, n));
      }} 
    />
  </div>
</div>
```

| Datei | Änderung |
|-------|----------|
| `ScrapePricesDialog.tsx` | Nächte-Feld editierbar machen, in Suchparameter speichern |

