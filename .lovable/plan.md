## Ziel
Mobile-Optimierung der Action-Buttons im Buchungsformular (`CreateBookingForm.tsx`):
1. "Buchung aktualisieren" und "Löschen" passen nebeneinander auf Mobile.
2. "Wäschebestellung..."-Button wandert **über** diese Buttons und bekommt grünen Hintergrund (analog Wäsche-Karten: `bg-green-600 hover:bg-green-700 text-white`).

## Änderungen
**Datei:** `src/components/Bookings/CreateBookingForm.tsx`

### 1. Wäschebestellung-Block verschieben (Zeile 1592–1614 → vor Submit-Buttons in Zeile 1431)
- Den gesamten Block (`{mode === 'edit' && initialData && (...)}`) aus dem Bereich nach `</AlertDialog>` herausnehmen und direkt **vor** dem `{/* Submit Buttons */}`-Container einfügen.
- Klassen am Button anpassen: `variant="default"`, neue Klasse `bg-green-600 hover:bg-green-700 text-white w-full`.
- Text ggf. kürzen auf "Wäschebestellung erstellen" für Mobile-Lesbarkeit (Original-Text sehr lang).

### 2. Submit-Button-Reihe kompakter (Zeile 1431–1459)
- Container: `flex flex-wrap gap-3 pt-4` → `flex flex-col sm:flex-row gap-2 pt-4`.
- "Buchung aktualisieren": `flex-1 bg-black hover:bg-gray-800 text-white` bleibt → füllt Mobile voll.
- "Löschen" (edit-mode): `flex-1` ergänzen → teilt sich auf Mobile mit Submit. Text bleibt "Löschen".
- "Abbrechen": `w-full sm:w-auto` ergänzen → eigene Zeile auf Mobile.
- Damit Aktualisieren + Löschen **nebeneinander** auf Mobile (zwei Spalten via `flex-row` immer): Container final `flex flex-row flex-wrap gap-2 pt-4`, Submit + Löschen je `flex-1`, Abbrechen `w-full sm:w-auto basis-full sm:basis-auto`.

## Resultat
- Mobile (390px):
  - Grüner "Wäschebestellung erstellen"-Button (volle Breite)
  - Darunter: [Buchung aktualisieren] [Löschen] nebeneinander, je halbe Breite
  - Darunter: [Abbrechen] volle Breite
- Desktop: gleicher Look, alles in einer Reihe wie bisher.

## Nicht ändern
- Logik, Handler, Disabled-States, Reihenfolge der Felder, Dialoge.
