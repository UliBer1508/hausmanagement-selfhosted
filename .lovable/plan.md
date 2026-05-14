## Ziel
Schließen-Button bekommt **das gleiche Blau wie der "Aktiv"-Badge** im Screenshot (kräftiges Blau, weißes Icon) — konsistente Optik. Sicherstellen, dass er keine Inhalte verdeckt.

## Farbe
Im Screenshot ist der Badge ein kräftiges Blau (≈ `hsl(217 91% 60%)`, Tailwind `blue-500/600`). Wir nutzen dafür den semantischen Token `--primary` der App (gleicher Blauton, bereits für Aktiv-Badges verwendet).

- Hintergrund: `bg-primary`
- Icon/Text: `text-primary-foreground` (weiß)
- Hover: `hover:bg-primary/90`
- Form: `rounded-full` (passend zum Pill/Badge-Look)

## Änderungen

### 1. `src/components/ui/close-button.tsx`
- Default-Variante (`subtle`) → kräftig blauer Pill:
  - `bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-sm`
- `solid`-Variante bleibt identisch (gleicher Look, für API-Kompatibilität).
- Größe bleibt 44×44 px, Icon 20 px.

### 2. `src/components/ui/dialog.tsx`
- Inline-Close-Button auf gleichen Look bringen: `bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-sm`.
- Damit der jetzt sichtbarere Button keinen Titel verdeckt:
  - `DialogContent` Padding-Top auf Mobile erhöhen → `px-4 pb-4 pt-14 sm:p-6`.
  - `DialogHeader` bekommt `pr-12`, damit lange Titel nicht unter den Button laufen.
- Position bleibt `absolute right-3 top-3`.

### 3. `src/components/ui/sheet.tsx`
- Gleicher blauer Pill-Look wie Dialog.
- Header-Bereich `pr-12`, Position `right-4 top-4`.

### 4. Bestehende `<CloseButton>`-Aufrufe
Übernehmen den neuen Look automatisch in:
`ChatAssistant`, `InstallPrompt`, `RatingReminderBanner`, `CalendarTab`, `PricingDashboard`, `OperationsDashboard`. Visuell prüfen, dass nichts überlappt — bei Bedarf am benachbarten Heading `pr-12` ergänzen.

## Verifikation
- Mobile-Preview (390×): Edit-Booking-Dialog → blauer Pill-Close-Button rechts oben sichtbar, Titel nicht verdeckt.
- Optik gleicht dem "Aktiv"-Badge aus dem Screenshot.
- Banner & Chat-Assistent kurz prüfen.
