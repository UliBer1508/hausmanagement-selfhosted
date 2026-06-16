## Ziel
In der Handyansicht der Reinigungsservice-Verwaltung (`src/components/Cleaning/CleaningManagement.tsx`) sind die drei Hauptbereiche zu lang. Sie sollen ein-/ausklappbar werden.

## Betroffene Bereiche
1. **Buchungen auf Reinigungsaufträge prüfen** (Filter + Suchergebnisse)
2. **Automatisierung** (`AutoCleaningSettingsCard`)
3. **Reinigungsaufträge** (Filter + Ergebnisliste)

## Umsetzung
- shadcn `Collapsible` (existiert bereits in `components/ui`) um den jeweiligen `CardContent` legen.
- `CardHeader` wird zum `CollapsibleTrigger`: klickbar, mit Chevron-Icon rechts (rotiert bei offen). Cursor pointer, hover-Style dezent.
- State pro Bereich (`useState`) — Default:
  - Mobile (< 768px via `useIsMobile`): alle drei **eingeklappt**
  - Desktop: alle drei **ausgeklappt** (wie bisher)
- Für „Reinigungsaufträge" bleibt der Button `CreateCleaningTaskDialog` im Header rechts und darf NICHT den Collapsible-Trigger auslösen (`onClick` mit `e.stopPropagation()` + eigenes wrapper-Div).
- Die Ergebnisliste der Reinigungsaufträge (Zeile 607–745) liegt aktuell **außerhalb** der Karte. Sie wird in den Collapsible-Bereich der Karte gezogen, damit beim Einklappen auch die lange Kartenliste verschwindet.
- Die Ergebnisse von „Buchungen prüfen" bleiben innerhalb ihres Collapsible.
- Für `AutoCleaningSettingsCard` wird in dieser Komponente intern dieselbe Collapsible-Logik ergänzt (eigene Datei, Header als Trigger, Default-Collapse über `useIsMobile`).

## Mobile-Layout-Check
- Filter-Grids (`md:grid-cols-6` bzw. `md:grid-cols-5`) bleiben auf Mobile `grid-cols-1` (bereits korrekt).
- Header-Zeile „Reinigungsaufträge" nutzt bereits `flex-col sm:flex-row` — bleibt.
- Kein Layout-Bruch zu erwarten; nur Padding der Header leicht erhöht für Touch-Target (min-h-12).

## Technische Details
- Imports: `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` aus `@/components/ui/collapsible`; `ChevronDown` aus `lucide-react`; `useIsMobile` aus `@/hooks/use-mobile`.
- Keine Query- oder Logik-Änderungen. Nur Layout/Styling.
- `version.json` Bump.

## Dateien
- `src/components/Cleaning/CleaningManagement.tsx` (drei Bereiche kollabierbar, Tasks-Liste in Karte verschoben)
- `src/components/Cleaning/AutoCleaningSettingsCard.tsx` (kollabierbar machen)
- `public/version.json`
