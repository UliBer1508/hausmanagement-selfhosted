## Befund (Profil)
- **Full Page Load: 11,4 s**, FCP 11,2 s, DOM Content Loaded 11,2 s.
- **250 Script-Requests** beim ersten Aufruf (Dev-Server, jedes `.tsx` einzeln).
- Hauptursache: `OriginalDashboard.tsx` (1.438 Zeilen) importiert **alle** Tab-/Modul-Komponenten statisch und damit deren komplette Abhängigkeitsbäume:
  - `GuestAnalytics.tsx` 68 KB / 1,8 s
  - `LinenOrderDialog.tsx` 47 KB / 1,6 s
  - `SettingsTab.tsx`, `CalendarTab.tsx`, `BookingOverviewFixed`, `HouseManagement`, `TenantManagement`, `LinenDashboard`, `PricingDashboard`, `ProviderTab`, `OverviewTab` … alles eager
  - `lucide-react` Bundle 157 KB
- Routen sind ebenfalls eager (`Login`, `NotFound`, `ChatAssistant`).
- Code-Splitting in `vite.config.ts` ist nur für Vendor-Chunks konfiguriert – die App selbst bleibt monolithisch.
- 23,9 MB JS-Heap & 176 Event-Listener bei 132 DOM-Knoten → eingebundener Code, der gar nicht angezeigt wird.

## Ziel
Initiale Last des Dashboards drastisch verkleinern, damit nur das aktive Tab + dessen Abhängigkeiten geladen werden. Erwartung: Time-to-Interactive < 3 s in Production, deutlich weniger Requests.

## Plan

### 1. Tabs des Dashboards lazy laden (größter Hebel)
In `src/pages/OriginalDashboard.tsx` die schweren Tab-/Modul-Komponenten von statischen Imports auf `React.lazy` umstellen und in `<Suspense fallback={…}>` einhüllen:

- `BookingOverviewFixed`
- `HouseManagement`
- `CleaningManagement`
- `GuestManagement` (zieht `GuestAnalytics` 68 KB nach)
- `TenantManagement`
- `LinenDashboard`
- `PricingDashboard` / `PricingTab`
- `ProviderTab`, `SettingsTab`, `CalendarTab`, `OverviewTab`
- Dialog-Schwergewichte: `LinenOrderDialog`, `UsageReportDialog`, `ProviderManagementDialog`, `ProviderBillingDialog` (nur dynamisch importieren, wenn der jeweilige Trigger geklickt wird)

Einheitlicher Suspense-Fallback (Skeleton/Spinner) je Tab, damit nichts ruckelt.

### 2. Routen lazy laden
`src/App.tsx`: `Login`, `NotFound`, `ChatAssistant` per `lazy()` + `<Suspense>`. Login wird sonst bei jedem Aufruf mitgeladen, obwohl meist direkt der Dashboard kommt.

### 3. Chat-Assistant deferred mounten
`ChatAssistant` wird global gerendert. Optionen:
- a) `lazy()` + `<Suspense fallback={null}>` – bringt sofort Bundle-Reduktion.
- b) Erst nach Idle (`requestIdleCallback`) oder beim ersten Klick auf den Floating-Button mounten. Empfehlung: Variante a) jetzt, b) als Folgeschritt falls weiter nötig.

### 4. Build-Chunks ergänzen
`vite.config.ts → build.rollupOptions.output.manualChunks` um produktive App-Chunks ergänzen, damit Production-Bundle pro Modul gezielt cacht (z. B. `dashboard-bookings`, `dashboard-guests`, `dashboard-linen`). Optional, da React.lazy im Production-Build automatisch separate Chunks erzeugt – Hauptnutzen sind benannte, stabilere Caches.

### 5. Kleinere Hygiene
- `lucide-react`: bereits per Subpath tree-shakeable, aber doppelte Imports prüfen (kein Wildcard `import * as`). Bestätigen via Grep.
- `date-fns`: nur einzelne Funktionen importieren (Stichprobe in Top-Dateien) – Vite shaket das, aber `import * as` vermeiden.
- Eager genutzte schwere Hooks (`useOptimizedLinenManagement`, `useExternalSync`) prüfen, ob sie wirklich auf jedem Tab gebraucht werden; ggf. in den jeweiligen Tab verschieben.

### 6. Verifikation
- Vor / nach: erneut `browser--performance_profile` laufen lassen, Vergleich von **Resource-Count, FCP, DOM Content Loaded**.
- Stichprobe-Klicks pro Tab → Suspense-Fallback erscheint, danach lädt der Tab.

## Was *nicht* gemacht wird (außerhalb Scope)
- Keine Änderungen an Datenmodell, Queries, Realtime, RLS.
- Keine UI-/Design-Änderungen außer minimalen Loading-Skeletons.
- Kein Wechsel der Routing-Library oder SSR-Einführung.

## Rückfrage
1. Soll ich **alle** Tabs lazy machen (Empfehlung) oder nur die schwersten (Guests/Linen/Settings/Calendar)?
2. ChatAssistant: nur lazy laden (sicher) – oder zusätzlich erst nach erstem Klick mounten (mehr Speed, minimale Verhaltensänderung)?