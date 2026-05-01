# Mobile-Optimierung: Automatisierungs-Karte

Die Karte `AutoLinenOrderSettingsCard.tsx` hat auf dem Handy mehrere Layout-Probleme (Switch + Label überlappen mit "Jetzt prüfen"-Button, "Speichern"-Button fehlt im Sichtbereich, Sektion "Wäsche Oberpinzgau Sync" bricht ebenfalls).

## Änderungen in `src/components/Houses/AutoLinenOrderSettingsCard.tsx`

### 1. Header-Bereich (Zeilen 162–222)
- Header-Aktionsleiste auf mobil **vertikal stapeln**, ab `sm` horizontal.
- Switch + Label in eine eigene Zeile, Buttons in eine zweite Zeile mit `flex-wrap` und `w-full sm:w-auto`.
- Kürzere Button-Labels auf mobil:
  - „Einstellungen speichern" → mobil nur „Speichern" (`hidden sm:inline` / `sm:hidden`).
  - „Jetzt prüfen" bleibt (passt).
- Buttons mit `flex-1 sm:flex-initial`, damit sie auf Handy gleichmäßig die Breite teilen und nichts überlappt.
- `shrink-0` auf Switch + Icons.

### 2. Eingabefelder-Grid (Zeilen 226–317)
- Aktuell `grid-cols-1 md:grid-cols-4`. Auf mobil bleibt 1 Spalte → bereits ok.
- Card-Padding auf mobil reduzieren (`CardContent` bekommt `p-3 sm:p-6` Verhalten via `space-y-4 sm:space-y-6`).

### 3. Sektion „Wäsche Oberpinzgau Sync" (Zeilen 461–493)
- `flex items-center justify-between` → auf mobil `flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between`.
- Aktionsleiste (Mapping-Button + Switch + Label) wird ebenfalls vertikal/`flex-wrap` für mobil; Mapping-Button erhält `w-full sm:w-auto`.

### 4. Ergebnis-Tabellen (Zeilen 350–456)
- Tabellen in einen Wrapper mit `overflow-x-auto` packen, damit sie auf 390px-Viewport horizontal scrollbar sind statt zu brechen.

## Nicht geändert
- Logik, State, Hooks, Edge-Function-Aufrufe.
- Desktop-Darstellung bleibt visuell identisch (alle neuen Klassen sind mobil-first mit `sm:`-Reset).

## Testkriterien
- Bei 390×736 Viewport: kein Element überlappt, alle Buttons vollständig sichtbar, Switch-Label nicht abgeschnitten.
- Tabellen scrollen horizontal statt umzubrechen.
- Bei ≥640 px (sm) sieht alles aus wie vorher.
