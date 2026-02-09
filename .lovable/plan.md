
# Problem-Gast Markierung mit Warnung bei Neubuchung

## Was wird gemacht

1. **Neues Feld `is_flagged`** in der `guests`-Tabelle (Boolean, Default: false)
2. **Checkbox im Gast-Bearbeitungsdialog** zum Setzen/Entfernen der Markierung
3. **Visuelles Flag in der Gästeliste** (rotes Warnsymbol bei markierten Gästen)
4. **Warnung bei Buchungserstellung**, wenn ein markierter Gast aus den Vorschlägen ausgewählt wird

## Aenderungen

### 1. Datenbank-Migration

Neue Spalte `is_flagged` (boolean, default false) in der `guests`-Tabelle:

```sql
ALTER TABLE guests ADD COLUMN is_flagged boolean DEFAULT false;
```

### 2. Datei: `src/components/Guests/GuestEditDialog.tsx`

- Neues Feld `is_flagged` im `formData`-State (Boolean)
- Checkbox im Formular unter den Notizen mit Label "Problem-Gast markieren" und Beschreibung "Warnung bei zukuenftigen Buchungen dieses Gastes"
- Beim Speichern wird `is_flagged` in die `guests`-Tabelle geschrieben

### 3. Datei: `src/components/Guests/GuestList.tsx`

- Rotes Warn-Badge neben dem Gastnamen, wenn `is_flagged === true`
- Text: "Problematischer Gast" als visueller Hinweis

### 4. Datei: `src/components/Bookings/GuestSuggestions.tsx`

- `is_flagged` Feld in der Supabase-Abfrage mitlesen
- Bei markierten Gaesten: rotes Warn-Badge in der Vorschlagsliste anzeigen (aehnlich wie "Aehnlicher Name", aber in Rot mit Warnsymbol)

### 5. Datei: `src/components/Bookings/CreateBookingForm.tsx`

- Wenn ein Gast aus den Vorschlaegen ausgewaehlt wird und `is_flagged === true`:
  - AlertDialog anzeigen mit Warnung: "Dieser Gast wurde als problematisch markiert. Moechten Sie trotzdem fortfahren?"
  - Optionen: "Abbrechen" (Gastdaten werden nicht uebernommen) und "Trotzdem uebernehmen" (Gastdaten werden eingefuellt)

### 6. Datei: `src/types/guest.ts`

- `is_flagged` Feld zum `GuestWithBookings` Interface hinzufuegen

## Ablauf

```text
Gast bearbeiten -> Checkbox "Problem-Gast" aktivieren -> Speichern
                                    |
                                    v
Neue Buchung erstellen -> Gastname eingeben -> Vorschlag erscheint mit Warnsymbol
                                    |
                                    v
                        Gast auswaehlen -> AlertDialog: "Problematischer Gast!"
                                    |
                        "Trotzdem uebernehmen" oder "Abbrechen"
```

## Ergebnis

- Gaeste koennen als "problematisch" markiert werden
- Bei jeder zukuenftigen Buchung erscheint eine Warnung
- Die Markierung ist jederzeit wieder entfernbar
- Kein Gast wird blockiert, nur gewarnt
