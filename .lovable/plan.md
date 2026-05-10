# Plan: Voller PWA mit Offline-Support

⚠️ **Wichtig vorab:** PWA-Features (Offline, Installations-Prompt, Service-Worker) funktionieren **nur in der published Version** — nicht im Lovable-Editor-Preview, weil der Preview im iframe läuft. Im Code wird die Service-Worker-Registrierung deshalb für `id-preview--*` und iframe-Kontexte deaktiviert.

## Schritte

### 1. Icon generieren
Ein hochwertiges App-Icon im Steinbock-Chalets-Stil (Bergsilhouette + Steinbock-Andeutung, dunkelgrüner Akzent, klares zentrales Motiv mit Padding) — Quellbild 1024×1024 PNG.
Daraus per Skript exportieren: `192×192`, `512×512`, `512×512 maskable`, `apple-touch-icon 180×180`. Ablage in `public/icons/`.

### 2. `vite-plugin-pwa` installieren & konfigurieren
- Dev-Dependency: `vite-plugin-pwa`
- `vite.config.ts` erweitern:
  - `registerType: 'autoUpdate'`
  - `devOptions: { enabled: false }` (kein SW im Dev/Preview)
  - `workbox.navigateFallbackDenylist: [/^\/~oauth/, /^\/api/, /supabase/]`
  - Runtime-Caching: HTML = `NetworkFirst` (3 s Timeout), Assets = `CacheFirst`, Supabase-Calls **nicht cachen**
  - Manifest: `name: "Steinbock Chalets Manager"`, `short_name: "Steinbock"`, `display: standalone`, `theme_color`, `background_color`, alle Icons inkl. maskable

### 3. Registrierungs-Guard in `src/main.tsx`
Snippet einfügen, das den Service-Worker im iframe / auf `*lovableproject.com` / `id-preview--*` **nicht** registriert und vorhandene Registrierungen dort entfernt. Verhindert Cache-Probleme im Editor.

### 4. `index.html` Meta-Tags
- `<link rel="manifest" href="/manifest.webmanifest">`
- Apple-Tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (180px)
- `theme-color` Meta passend zum Manifest

### 5. Install-Hilfe-Komponente (optional, klein)
Ein dezenter Button „App installieren" in den Einstellungen, der das `beforeinstallprompt`-Event abfängt und manuell triggert (Chrome/Edge/Android). Auf iOS Hinweis-Dialog: „Teilen → Zum Home-Bildschirm".

### 6. Build-Verifikation
Nach Build prüfen, dass `dist/sw.js`, `dist/manifest.webmanifest` und Icons existieren. Hinweis an dich: Nach **Publish** aufrufen → Lighthouse / Browser-Install-Prompt sollte erscheinen.

## Was der User danach tun muss
1. App publishen (Update-Button im Editor)
2. Auf Mobil/Desktop die published URL öffnen
3. Browser-Menü → „Installieren" / „Zum Home-Bildschirm hinzufügen"

## Was NICHT enthalten ist
- Push-Notifications (separates Setup, später)
- Background-Sync
- Offline-Schreibfähigkeit (nur Lese-Cache für statische Assets/HTML)
