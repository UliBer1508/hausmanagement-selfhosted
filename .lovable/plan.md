
## Problem

Auf dem Handy (≤ 480 px) gibt es zwei sich ergänzende Layout-Probleme:

1. **Dialoge / Formulare laufen rechts über den Rand** (Beispiel-Screenshot „Buchung bearbeiten"): Eingabefelder und Header werden über den rechten Bildschirmrand hinaus gezeichnet, der Nutzer muss horizontal scrollen.
2. **Außerhalb der Dialoge wird Platz verschenkt**: Listen, Tabs und Karten haben großzügige Außenabstände — anders als im Wäscheportal-Screenshot, wo Dashboard-Kacheln in einem 2-spaltigen Raster mit minimalem Außenabstand fast die volle Bildschirmbreite nutzen.

## Ursachen im Code

- `src/components/ui/dialog.tsx` setzt `p-6` (= 48 px) Innenabstand und kein `overflow-x-hidden`. Bei 390 px Viewport bleiben nur 342 px für Inhalte → längere Selects/Inputs sprengen die Box.
- Mehrere Dialoge erzwingen `max-w-2xl` (= 672 px). Mit Radix-Positionierung `left-50% translate-x-[-50%]` plus überbreitem Inhalt → Box wächst über den Viewport hinaus.
- Seiten-Container nutzen `container mx-auto p-4 md:p-6`. Auf Handy fressen 32 px horizontale Innenabstände + 32 px max-w-Container-Margin den Inhaltsbereich.
- Stat-Cards (`StatsCards.tsx`) sind aktuell `grid-cols-1` auf Mobile, statt `grid-cols-2` wie im Wäscheportal-Beispiel.

## Ziel

- Keine Dialog-Inhalte mehr über den rechten Rand.
- Dashboard- und Listenseiten nutzen die volle Handy-Breite (Vorbild: Wäscheportal-Screenshot).
- **Eine** zentrale Änderung pro UI-Primitive, keine neuen Komponenten, keine Logik-Änderungen, keine Performance-Auswirkung.

## Vorgehen (5 Dateien, ~15 Zeilen Diff)

### 1. `src/components/ui/dialog.tsx` — Dialoge mobile-tauglich machen

In `DialogContent` Basisklassen:

- `w-full` → `w-[calc(100vw-1rem)] sm:w-full` (lässt 8 px Luft links/rechts auf Mobile, ab `sm:` Standardverhalten).
- `p-6` → `p-4 sm:p-6` (16 px statt 24 px Innenabstand auf Mobile).
- Default ergänzen: `max-h-[90dvh] overflow-y-auto overflow-x-hidden`.

→ Wirkt **automatisch für alle Dialoge** (Buchung, Reinigung, Wäsche, Gast-Detail, Preisanalyse …).

### 2. `src/components/ui/sheet.tsx` — gleiches Padding-Pattern

`p-6` → `p-4 sm:p-6` für Konsistenz mit Dialog.

### 3. `src/components/Layout/AppLayout.tsx` — schmaleres globales Padding

`<main>` bekommt `px-2 sm:px-4` als globales Wrapper-Padding.

### 4. Seiten-Container Suchen/Ersetzen

In den ~6 Top-Level-Pages (Dashboard, Bookings, Cleaning, Laundry, Guests, Settings):
`container mx-auto p-4 md:p-6` → `container mx-auto px-2 py-4 sm:px-4 sm:py-6 md:p-6`.
→ Mobile gewinnt **24 px** nutzbare Breite, Desktop unverändert.

### 5. `src/components/Dashboard/StatsCards.tsx` — 2-Spalten auf Mobile (nach Vorbild Wäscheportal)

Grid-Klassen umstellen:
`grid-cols-1 md:grid-cols-2 lg:grid-cols-4` → `grid-cols-2 lg:grid-cols-4`
und `gap-4` → `gap-2 sm:gap-4`.

→ Dashboard-Kacheln stehen ab Mobile in 2 Spalten, identisch zum Wäscheportal-Look.

## Was NICHT geändert wird

- Keine neuen Komponenten, keine neuen Dependencies.
- Keine Verhaltens-/Funktionsänderungen.
- Kein Touch-/Klick-Handling, keine Animationen.
- Keine Tabellen-/Listen-Logik.

## Verifikation

- Browser-Tool 390 × 736: Dashboard öffnen → Stat-Cards 2-spaltig, kein horizontales Scrollen.
- Eine Buchung im Edit-Modus öffnen → Inhalte bleiben innerhalb des Bildschirms.
- Stichproben: CreateBookingDialog, EditCleaningTaskDialog, GuestDetailsDialog.
- Desktop 1280 × 720 Gegencheck: Layout unverändert.

## Aufwand

5 Dateien, ~15 Zeilen Diff insgesamt. Kein Build-Impact, keine Performance-Auswirkung.
