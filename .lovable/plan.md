## Ziel
Das Fenster „Buchung bearbeiten“ soll sich wieder zuverlässig über den Close-Button schließen lassen.

## Ursache
Der globale Logout-Button in `src/components/Layout/AppLayout.tsx` ist oben rechts fixiert und liegt über dem Dialog-Close-Button des Shadcn-Dialogs. Dadurch fängt er den Klick ab.

## Umsetzung
1. In `src/components/Layout/AppLayout.tsx` den fixierten Logout-Button aus der oberen rechten Ecke entfernen.
2. Den Logout an eine kollisionsfreie Stelle verschieben, ohne andere UI-Elemente zu überdecken:
   - bevorzugt in den Footer,
   - weiterhin nur sichtbar, wenn eine Session besteht.
3. Das bestehende Logout-Verhalten beibehalten:
   - `supabase.auth.signOut()`
   - Toast „Abgemeldet“
   - Redirect zu `/login`

## Technische Details
- `isAuthed`-State und `handleLogout` bleiben bestehen.
- Nur das Rendering/Placement des Buttons wird geändert.
- Keine Änderungen an Dialog-Logik oder Buchungsformular nötig.

## Akzeptanzkriterien
- Der Close-Button im Dialog „Buchung bearbeiten“ funktioniert wieder.
- Das Dialogfenster lässt sich auch per Klick außerhalb schließen.
- Klickbare Karten/Aktionen oben rechts werden nicht mehr blockiert.
- Logout bleibt weiterhin erreichbar und funktionsfähig.