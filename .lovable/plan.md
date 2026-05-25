## Ziel
Im Banner "Gast vor Anreise kontaktieren" soll ein Klick auf die Gastkarte direkt eine E-Mail an den Gast über den lokalen Mail-Client (`mailto:`) öffnen. Fehlt eine E-Mail-Adresse, soll ein klarer Hinweis (Toast) erscheinen.

## Änderungen

**Datei:** `src/components/Dashboard/GuestContactAlertBanner.tsx`

1. Die äußere Karte (`<div key={booking.id} …>`) wird klickbar:
   - `role="button"`, `tabIndex={0}`, `cursor-pointer`, Hover-Style, Focus-Ring
   - `onClick` und `onKeyDown` (Enter/Space) → öffnen `mailto:` mit vorbefülltem Betreff (z.B. „Ihre Anreise am DD.MM.YYYY – {Hausname}") via `window.location.href = 'mailto:…'`
   - Wenn `booking.guest_email` fehlt → Toast (variant `destructive`): „Keine E-Mail-Adresse hinterlegt – bitte Gastdaten prüfen."

2. Klick-Propagation verhindern für innere interaktive Elemente, damit deren eigene Aktionen nicht ungewollt die Mail öffnen:
   - Buttons „Nicht nötig" / „Kontaktiert": `onClick` mit `e.stopPropagation()`
   - bestehende `mailto:`/`tel:`-Links: `onClick={(e) => e.stopPropagation()}` (Verhalten bleibt wie heute)
   - Marketing-Aktionen-Block (Checkbox + Label): Wrapper-`div` mit `onClick={(e) => e.stopPropagation()}`

3. Keine Logik-/Daten-Änderungen, keine neuen Hooks, keine Backend-Änderungen.

## Hinweis zur Umsetzung
`mailto:` ist explizit gewünscht (Memory: Tenant/Guest-Kommunikation nur via mailto). Kein In-App-Mail-Editor.
