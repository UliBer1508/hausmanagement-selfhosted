## Analyse

Screenshot zeigt: Dialog "Buchung bearbeiten" auf Mobile – Inputs/Labels werden rechts abgeschnitten ("Dot Shaw", "Dater…"). Ursache sind mehrere wiederkehrende Mobile-Layout-Probleme in den Forms und Dialogen.

### Gefundene Hauptursachen

1. **`flex` ohne `min-w-0` in Dialog-Children**
   `DialogContent` nutzt intern `grid` (siehe `ui/dialog.tsx`). Grid-/Flex-Items haben default `min-width: auto` – lange Inhalte (z. B. Datums-Buttons "20.06.2026 15:00", lange Select-Werte "Wald Chalet (max. 6 Gäste)") drücken die Spalte über die Dialog-Breite hinaus, da `overflow-x-hidden` zwar clippt, aber die *Children* trotzdem rendern und Geschwister-Layouts beeinflussen.

2. **Button-Reihen mit `flex` ohne `flex-wrap`**
   `CreateBookingForm.tsx:1432` "flex gap-3" mit 3 Buttons (Aktualisieren / Löschen / Abbrechen) ≈ 350px Mindestbreite – passt nicht in 342px Dialog-Innenraum.

3. **Inkonsistente DialogContent-Overrides**
   ~25 Dialoge überschreiben mit `max-w-2xl/3xl/4xl/[800px]/[900px]`. Das Mobile-Clamp `w-[calc(100vw-1rem)]` greift zwar, aber Inhalte sind oft auf Desktop-Breite designed (mehrspaltige Grids, lange Tabs, breite Buttons).

4. **AlertDialog hat keine Mobile-Anpassung**
   `ui/alert-dialog.tsx` verwendet noch `w-full max-w-lg p-6` ohne Viewport-Clamp.

5. **Lange Labels/Werte ohne `truncate` / `break-words`**
   In Selects/Buttons mit fixen Breiten werden Texte abgeschnitten statt umzubrechen.

## Lösung – 4 gezielte Änderungen

### 1. Form-Wrapper innerhalb von Dialogen → `min-w-0`
Eine Helper-Klasse, oder direkt am `<form>` in den 3 Haupt-Forms:
- `src/components/Bookings/CreateBookingForm.tsx` Zeile 893: `space-y-6` → `space-y-6 min-w-0`
- `src/components/Cleaning/EditCleaningTaskDialog.tsx` (Form-Wrapper)
- `src/components/Cleaning/CreateCleaningTaskDialog.tsx`
- `src/components/Houses/LinenOrderDialog.tsx` Form-Container
- `src/components/Houses/EditHouseDialog.tsx` Form-Container

Verhindert dass Grid-Items über die Dialog-Breite wachsen.

### 2. Button-Reihen umbrechen lassen
- `CreateBookingForm.tsx:1432`: `flex gap-3 pt-4` → `flex flex-wrap gap-3 pt-4`
- Gleicher Fix in `EditCleaningTaskDialog`, `LinenOrderDialog` Footer (alle Dialoge mit ≥3 Buttons unten)

### 3. AlertDialog Mobile-Clamp (analog zu Dialog)
`src/components/ui/alert-dialog.tsx` `AlertDialogContent`:
```diff
- "fixed left-[50%] top-[50%] ... w-full max-w-lg ... p-6 ..."
+ "fixed left-[50%] top-[50%] ... w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[90dvh] overflow-y-auto overflow-x-hidden ... p-4 sm:p-6 ..."
```

### 4. Selects/Buttons mit langen Werten → `truncate`
- `SelectValue` in den Form-Selects: per CSS via `[&>span]:truncate` am `SelectTrigger` (eine Stelle in `ui/select.tsx`, default-Klasse erweitern um `min-w-0` und `[&>span]:truncate`).

## Was NICHT geändert wird

- Keine Logik / Datenflüsse / API
- Keine Desktop-Layouts (alles greift nur via `min-w-0` neutral oder mobile-only)
- Keine neuen Komponenten/Pakete

## Dateien (insgesamt 6)

| Datei | Änderung |
|------|----------|
| `src/components/ui/alert-dialog.tsx` | Mobile-Width-Clamp + Padding |
| `src/components/ui/select.tsx` | `min-w-0 [&>span]:truncate` am Trigger |
| `src/components/Bookings/CreateBookingForm.tsx` | `min-w-0` am Form, `flex-wrap` am Footer |
| `src/components/Cleaning/EditCleaningTaskDialog.tsx` | `min-w-0` + `flex-wrap` |
| `src/components/Cleaning/CreateCleaningTaskDialog.tsx` | `min-w-0` + `flex-wrap` |
| `src/components/Houses/LinenOrderDialog.tsx` | `min-w-0` + `flex-wrap` |

## Verifikation

- Dialog "Buchung bearbeiten" bei 390×736: keine horizontale Scrollbar, alle Labels/Inputs sichtbar, Buttons brechen bei Bedarf um
- Reinigungs-Dialog, Wäsche-Dialog gleich
- Desktop 1280×720: optisch identisch (min-w-0 hat keinen visuellen Effekt wenn genug Platz ist)
