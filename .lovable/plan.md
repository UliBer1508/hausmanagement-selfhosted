

# Fix: Datumseingabe wird sofort gelöscht

## Problem
Das Input-Feld ist "controlled" mit `value={customDateFrom ? format(...) : ""}`. Wenn der Nutzer "0" tippt, ist das kein gültiges Datum, der State bleibt `undefined`, und das Feld wird sofort auf `""` zurückgesetzt. Teileingaben sind unmöglich.

## Lösung
Zwei separate String-States (`customDateFromText`, `customDateToText`) für den angezeigten Text im Input. Die Date-States werden nur aktualisiert wenn der Text ein vollständiges gültiges Datum ergibt. Umgekehrt wird der Text-State aktualisiert wenn per Kalender ein Datum gewählt wird.

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

1. Zwei neue States hinzufügen:
```typescript
const [customDateFromText, setCustomDateFromText] = useState("");
const [customDateToText, setCustomDateToText] = useState("");
```

2. Input `value` auf den Text-State binden statt auf den formatierten Date-State:
```typescript
value={customDateFromText}
onChange={(e) => {
  const val = e.target.value;
  setCustomDateFromText(val);
  if (val === "") { setCustomDateFrom(undefined); return; }
  const parsed = parse(val, 'dd.MM.yyyy', new Date());
  if (isValid(parsed) && val.length === 10) {
    setCustomDateFrom(parsed);
  }
}}
```

3. Kalender-Auswahl synchronisiert den Text-State:
```typescript
onSelect={(date) => {
  setCustomDateFrom(date);
  setCustomDateFromText(date ? format(date, "dd.MM.yyyy", { locale: de }) : "");
}}
```

4. Gleiches für das "Bis Datum"-Feld.

