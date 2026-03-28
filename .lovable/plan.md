

# Fix: Such- und Filterfunktionen pruefen und korrigieren

## Gefundene Probleme

### 1. Buchungen: Jahresfilter zeigt Buchungen aus naechstem Jahr
**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx` (Zeile 348-364)

Die Overlap-Logik zeigt Buchungen, die den Jahreswechsel ueberspannen, in beiden Jahren an. Bei Jahresfiltern (`current-year`, `next-year`, `last-year`) sollte nur der **Check-in** geprueft werden, nicht der Overlap.

**Fix:** Fuer Jahresfilter pruefen ob `checkIn >= start && checkIn <= end` statt Overlap.

---

### 2. Reinigung Buchungssuche: Hausname-Suche funktioniert nicht
**Datei:** `src/components/Cleaning/CleaningManagement.tsx` (Zeile 92)

```typescript
query = query.or(`guest_name.ilike.%${searchTerm}%, houses.name.ilike.%${searchTerm}%`);
```

Supabase PostgREST unterstuetzt **keine** Filter auf verbundene Tabellen innerhalb von `.or()`. Die Suche nach Hausnamen schlaegt fehl oder wird ignoriert.

**Fix:** Hausname-Suche auf Client-Seite durchfuehren (wie bereits bei den Reinigungsauftraegen gemacht wird).

---

### 3. Reinigung Buchungssuche: Statusfilter wird nicht angewendet
**Datei:** `src/components/Cleaning/CleaningManagement.tsx` (Zeile 76-146)

Der `statusFilter` ist im UI vorhanden (Zeile 384-394), aber:
- Nicht im `queryKey` enthalten
- Nicht in der Query-Funktion angewendet

**Fix:** `statusFilter` zum queryKey hinzufuegen und in der Query anwenden:
```typescript
if (statusFilter !== 'all') {
  query = query.eq('status', statusFilter);
}
```

---

### 4. Reinigungsauftraege: Zeitfilter nicht angewendet
**Datei:** `src/components/Cleaning/CleaningManagement.tsx` (Zeile 160-236)

`taskTimeFilter` ist als State definiert (Zeile 32) und im queryKey (Zeile 161), aber:
- Kein UI-Dropdown fuer den Zeitfilter in der Auftrags-Sektion
- Keine Filterlogik in der Query-Funktion

Der Zeitfilter ist nur fuer die obere "Buchungen pruefen"-Sektion relevant. Er wird unnoetig im queryKey der Auftraege mitgefuehrt, was bei Aenderung des Zeitfilters die Auftraege unnoetig neu laedt.

**Fix:** `taskTimeFilter` aus dem queryKey der Reinigungsauftraege entfernen.

---

## Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `BookingOverviewFixed.tsx` | Jahresfilter: Check-in statt Overlap |
| `CleaningManagement.tsx` | Buchungssuche: Hausname client-seitig filtern |
| `CleaningManagement.tsx` | Buchungssuche: StatusFilter anwenden + queryKey |
| `CleaningManagement.tsx` | Auftraege: `taskTimeFilter` aus queryKey entfernen |

Keine neuen Dateien oder Migrationen noetig.

