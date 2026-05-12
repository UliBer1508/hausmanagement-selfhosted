## Problem

Auf dem Handy (390px) bleibt rechts/links viel ungenutzter Platz. Ursache sind drei aufaddierte Paddings, die sich auf Mobile zu **80px Rand pro Seite** summieren:

1. `.content-main` in `src/index.css` → `p-4 lg:p-6` = **16px** außen
2. Wrapper-Karte in `OverviewTab.tsx` Zeile 202 → `p-6` = **24px** innen
3. Banner-Boxen / Filter-Box (`p-4`) tragen zusätzlich bei
4. (Bereits gefixt) Dialog/Sheet/StatsCards aus letzter Runde

Auf 390px CSS-Pixel verbraucht das ~20% der Bildschirmbreite nur für Luft.

## Lösung (nur CSS-Klassen, keine Logik)

Minimaler Eingriff an **3 Stellen**, ab `sm:` (≥640px) bleibt das Desktop-Layout exakt wie heute.

### 1. `src/index.css` – `.content-main`
```diff
- @apply flex-1 p-4 lg:p-6 overflow-auto;
+ @apply flex-1 px-2 py-3 sm:p-4 lg:p-6 overflow-auto;
```
Spart 16px je Seite auf Mobile (gewinnt 32px Breite).

### 2. `src/components/Dashboard/OverviewTab.tsx` – Buchungs-Wrapper (Zeile 203)
```diff
- <div className="p-6">
+ <div className="p-3 sm:p-6">
```
Spart 24px je Seite (gewinnt 48px). Innere Cards (`BookingCard`, `ServiceTaskCard`, `LaundryOrderCard`) bleiben unverändert.

### 3. `src/components/Dashboard/OverviewTab.tsx` – Filter-Box (Zeile 93)
```diff
- <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
+ <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 mb-6">
```
Kleiner Konsistenz-Fix.

## Ergebnis

- Mobile (<640px): ~80px gewonnene Breite → Karten füllen den Bildschirm
- Tablet/Desktop (≥640px): **unverändert**
- Keine Komponenten-, State- oder Daten-Änderungen
- Keine Performance-Auswirkung (reine Tailwind-Klassen)

## Verifikation
- Preview bei 390×736: keine horizontale Scrollbar, Karten reichen bis ~8px vom Rand
- Preview bei 1280×720: optisch identisch zu vorher
