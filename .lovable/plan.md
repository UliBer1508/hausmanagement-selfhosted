
## Problem

In der Vorschau (Preview) funktionieren die klickbaren Karten in der Übersicht (Buchung, Reinigung, Wäsche) korrekt. In der **installierten** Published-PWA funktionieren sie nicht — die App zeigt dort einen älteren Build, in dem die `onClick`-Logik noch nicht enthalten war.

Ursache: Auf bereits installierten Geräten läuft ein **alter Service Worker** mit gecachten JS-Bundles. Die aktuelle PWA-Konfiguration (`autoUpdate`, `skipWaiting`, `clientsClaim`, `NetworkFirst` für HTML) ist grundsätzlich korrekt, aber:

1. Es gibt **keinen Version-Check zur Laufzeit** — installierte Clients erfahren erst beim nächsten echten Reload, dass es ein Update gibt.
2. Der `UpdatePrompt`-Listener wartet auf `controllerchange`, aber wenn iOS/Desktop die SW-`update()`-Anfrage gar nicht erst feuert (App lange offen, Standby), bleibt der alte Worker hängen.
3. Es gibt keinen Notausschalter, der einen einmaligen harten Reload erzwingt, sobald ein neues Deployment erkannt wird.

## Ziel

- Installierte PWA holt **garantiert sofort** den neuesten Build.
- Klickbare Karten (Buchungen, Reinigungen, Wäsche) funktionieren auch im installierten Modus.
- Verifikation gegen die Published-URL nach dem Fix.

## Vorgehen

### 1. Build-Versionierung erzwingen

- Beim Build eine Datei `public/version.json` erzeugen, die bei jedem Build einen frischen Hash/Timestamp enthält (über ein kleines Vite-Plugin in `vite.config.ts`).
- Diese Datei ist **nicht cachebar** (Workbox `NetworkOnly` Regel + Lovable-Proxy liefert sie ohnehin mit `no-store`).

### 2. Laufzeit-Version-Check (zentral, einmal pro App)

Neuer Hook `useAppVersionCheck` (in `src/hooks/`), eingebunden in `AppLayout.tsx`:

- Speichert die zuerst geladene Version aus `/version.json` im Memory.
- Pollt alle 60 s `/version.json` (mit `cache: 'no-store'`).
- Bei Versions-Abweichung:
  - Ruft `registration.update()` auf allen aktiven SWs auf.
  - Sendet `SKIP_WAITING` an wartenden Worker.
  - Löscht alle `caches.keys()` außer dem aktuellen Workbox-Precache.
  - Erzwingt `window.location.reload()` (einmalig pro Session via `sessionStorage`-Flag, damit keine Reload-Schleife entsteht).

### 3. UpdatePrompt vereinfachen + härten

- `src/components/PWA/UpdatePrompt.tsx`: zusätzlich beim Tab-Focus (`visibilitychange`) ein `registration.update()` triggern, damit zurückkehrende Nutzer sofort prüfen.
- Wenn `registration.waiting` existiert: sofort `SKIP_WAITING` schicken, ohne Wartezeit.

### 4. Manifest / vite.config.ts

- `display_override: ['window-controls-overlay', 'standalone']` entfernen — `window-controls-overlay` ist auf Desktop-PWAs eine bekannte Ursache für nicht klickbare Bereiche im oberen Bereich (Title-Bar überlagert App-Content). Beibehalten: `display: 'standalone'`.
- Workbox-Option `cleanupOutdatedCaches: true` ist bereits gesetzt — beibehalten.
- Sicherstellen, dass `version.json` über die `runtimeCaching`-Liste explizit `NetworkOnly` läuft.

### 5. Einmaliger Cleanup für bereits installierte alte PWAs

- In `src/main.tsx` einen kleinen Bootstrap-Block ergänzen, der beim Start einmal alle veralteten Caches (`html-cache`, alte Workbox-Precaches mit anderem Revision-Hash) löscht und `registration.update()` auslöst.
- Das gilt nur außerhalb des Lovable-Preview-Iframes (Guard ist bereits vorhanden).

### 6. Verifikation

- Nach Implementierung: Published-Version unter https://my-sweet-home-manager.lovable.app erneut öffnen, einloggen, prüfen ob Übersichts-Karten klickbar reagieren.
- Browser-Tools: prüfen dass `/version.json` als `200` (nicht `from disk cache`) geladen wird, und dass nach einem neuen Deploy der Reload-Trigger feuert.
- Console: keine `Multiple GoTrueClient`-getriggerten Fehler in der Klick-Pfad-Region (separater Hinweis, falls relevant).

## Technische Details

```text
src/
├─ hooks/
│   └─ useAppVersionCheck.ts        (neu — poll /version.json)
├─ components/
│   ├─ Layout/AppLayout.tsx         (neu: useAppVersionCheck einbinden)
│   └─ PWA/UpdatePrompt.tsx         (visibilitychange + sofortiges SKIP_WAITING)
├─ main.tsx                         (Cleanup-Block für alte Caches)
public/
└─ version.json                     (vom Build-Plugin generiert)
vite.config.ts                      (Plugin: version.json + manifest-Anpassung)
```

Erwartetes Verhalten danach:

1. Neuer Deploy → installierte PWA pollt `/version.json` → erkennt neuen Hash → triggert SW-Update + Cache-Clear + Reload.
2. Spätestens 60 s nach Öffnen der installierten App ist die neueste Version aktiv.
3. Klickbare Übersichts-Karten verhalten sich identisch zu Preview und Published-Web.

## Risiken / Hinweise

- **Reload-Schleife** wird durch `sessionStorage`-Flag verhindert (Reload nur einmal pro Session).
- **Erstes Deployment nach diesem Fix**: alte installierte PWAs haben den neuen Version-Check noch nicht — der **eine** harte Reload-Schritt aus Punkt 5 (Cache-Cleanup beim Boot) sorgt dafür, dass sie genau einmal den neuen Build holen. Danach greift der reguläre Mechanismus.
- iOS-PWAs cachen `start_url`/`scope` aus dem Manifest beim Install — das ist hier unverändert, kein Eingriff nötig.
