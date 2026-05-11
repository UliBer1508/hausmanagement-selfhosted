## Ziel
Die beiden Haus-Karten im Wäsche-Dashboard sollen immer **nebeneinander in einer Zeile** dargestellt werden – auch auf schmalen Viewports (aktuell 967px zeigt sie noch nebeneinander, aber unter `lg` (1024px) stapeln sie).

## Änderung
**Datei:** `src/components/Houses/LinenDashboard.tsx` (Zeile 603)

- Grid von `grid-cols-1 lg:grid-cols-2` → **`grid-cols-2`** (immer 2 Spalten).
- `gap-4` → `gap-3`, damit auf schmalen Screens genug Platz bleibt.

## Innerer Karten-Inhalt (Anpassung für Enge)
Damit die Karten auch auf kleinen Breiten lesbar bleiben:
- Die innere Stat-Reihe (`grid-cols-2 md:grid-cols-5`, Zeile 515) bekommt zusätzlich `gap-2` und kleinere Mindestbreiten, damit sie in der halben Card-Breite nicht überläuft.
- `flex-wrap` für die Action-Buttons (Verwalten / Genehmigen), damit sie umbrechen statt zu überlaufen.

Keine Logik-Änderungen, rein Layout/Presentation.