## Windows-Installierbarkeit für die PWA

Die gute Nachricht: Die bereits implementierte PWA ist **technisch schon Windows-kompatibel**. Microsoft Edge und Chrome auf Windows 10/11 unterstützen den `beforeinstallprompt`-Event und installieren die App als eigenständiges Desktop-Fenster (mit Eintrag im Startmenü, Taskleiste-Pin, optional Autostart).

Damit Windows-Nutzer die App jedoch zuverlässig und komfortabel installieren können, sind einige Ergänzungen sinnvoll:

### Was bereits funktioniert
- `manifest.webmanifest` mit `display: standalone`, Icons (192/512/maskable), `theme_color`, `background_color`
- Service Worker (nur in Production, nicht im Editor-Preview)
- `InstallPrompt`-Komponente mit `beforeinstallprompt`-Handler → zeigt Browser-Install-Dialog auch auf Windows

### Was ergänzt werden soll

1. **Windows-spezifischer Hinweistext im Install-Dialog**
   `InstallPrompt.tsx` erkennt aktuell nur iOS-Sonderfall. Ergänzen: Plattform-Erkennung für **Windows Desktop** (Edge/Chrome), mit kurzer Anleitung als Fallback, falls `beforeinstallprompt` (noch) nicht gefeuert hat:
   > "In Edge/Chrome: Adressleiste → Symbol „App installieren" oder Menü ⋯ → „Apps" → „Diese Site als App installieren"."

2. **Manifest-Erweiterungen für Windows-Desktop-Komfort**
   - `"display_override": ["window-controls-overlay", "standalone"]` — erlaubt nahtlose Titelleiste unter Windows 11
   - `"launch_handler": { "client_mode": "navigate-existing" }` — verhindert mehrfaches Öffnen
   - `"categories": ["business", "productivity"]`
   - `"shortcuts"` (Jump-List für Windows-Taskleiste): z. B. „Buchungen", „Reinigung", „Wäsche", „Dashboard" — Rechtsklick auf das Taskleisten-Icon zeigt diese als Schnellzugriffe
   - `"screenshots"` (form_factor `wide` + `narrow`) — verbessert Install-UI in Edge

3. **Tile-Farbe für Windows-Startmenü-Pinning aus dem Browser**
   `<meta name="msapplication-TileColor" content="#0b3d2e">` und `<meta name="msapplication-TileImage" content="/pwa-192x192.png">` in `index.html` — aktuell nur teilweise gesetzt.

4. **Install-Button auch sichtbar nach Erst-Dismiss**
   Der manuelle „App installieren"-Button (Einstellungen) bleibt auf Windows immer verfügbar, falls Nutzer den Auto-Prompt schließen.

5. **Optional (separate Iteration): Microsoft Store via PWABuilder**
   Falls gewünscht, kann die PWA über pwabuilder.com als `.msix` paketiert und im Microsoft Store gelistet werden — kein Code-Change nötig, nur Hinweis.

### Nicht enthalten
- Keine native Electron-/Win32-App (würde komplette zweite Build-Pipeline bedeuten)
- Keine Push-Notifications, kein Background-Sync
- Keine Code-Signatur / MSIX-Paketierung im Repo

### Technische Details

| Datei | Änderung |
|---|---|
| `vite.config.ts` | Manifest erweitern: `display_override`, `launch_handler`, `categories`, `shortcuts`, `screenshots` |
| `public/screenshots/` | 2 Screenshots (1280×720 wide + 750×1334 narrow) generieren |
| `index.html` | `msapplication-TileColor` + `msapplication-TileImage` Meta-Tags |
| `src/components/PWA/InstallPrompt.tsx` | Plattform-Detection (Windows/Edge/Chrome) + entsprechender Hilfetext, Fallback-Anleitung wenn `beforeinstallprompt` nicht verfügbar |

### Verifikation nach Publish
- Edge auf Windows → Adressleiste zeigt Install-Icon → App startet im eigenen Fenster
- Rechtsklick auf Taskleisten-Icon → Shortcuts erscheinen
- An Startmenü anheften möglich
