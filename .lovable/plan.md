

# Freie Datumseingabe für Buchungsfilter

## Problem
Die benutzerdefinierten Datumsfelder ("Von Datum" / "Bis Datum") erlauben nur Auswahl per Kalender-Popup. Der Nutzer möchte auch direkt ein Datum eintippen können (z.B. "15.03.2026").

## Lösung
Die Popover-Buttons durch eine Kombination aus **Text-Input + Kalender-Icon-Button** ersetzen. Das Input-Feld akzeptiert Freitext im Format `dd.MM.yyyy`, das Kalender-Icon öffnet weiterhin den Kalender-Picker.

## Technische Änderung

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

Für beide Datumsfelder (Von/Bis):

1. Input-Feld mit `type="text"` und Placeholder `TT.MM.JJJJ` hinzufügen
2. Bei Eingabe wird `parse(value, 'dd.MM.yyyy', new Date())` aus `date-fns` verwendet um den String zu parsen
3. Kalender-Icon als Button daneben, der den Popover-Kalender öffnet
4. Wenn ein gültiges Datum per Kalender gewählt wird, wird das Input-Feld aktualisiert
5. Layout: Input + Kalender-Button nebeneinander in einer Gruppe (`flex` mit `relative`)

Import hinzufügen: `parse` aus `date-fns`.

Keine neuen Komponenten nötig, nur Umbau der bestehenden Zeilen 641-698.

