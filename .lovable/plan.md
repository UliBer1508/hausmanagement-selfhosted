## Ziel
Updates der PWA werden auf Handy und PC **automatisch** eingespielt, ohne dass der User auf „Aktualisieren" klicken muss. Versionsnummer im Footer ist dann immer aktuell.

## Änderungen

### 1. `vite.config.ts` — HTML immer frisch laden
`runtimeCaching` um eine `NetworkFirst`-Regel für HTML-Navigationen ergänzen, damit der Browser bei Online-Verbindung immer die neueste `index.html` (und damit den Verweis auf das neue JS-Bundle) bekommt:

```ts
runtimeCaching: [
  {
    urlPattern: ({ request }) => request.mode === 'navigate',
    handler: 'NetworkFirst',
    options: { cacheName: 'html', networkTimeoutSeconds: 3 },
  },
  // ... bestehende Regeln (Google Fonts, Supabase) bleiben
]
```

### 2. `src/components/PWA/UpdatePrompt.tsx` — Auto-Apply statt Dialog
- Sobald ein neuer Service Worker im Status `installed` ist und ein `controller` existiert (= echtes Update, nicht Erstinstallation), **sofort** `SKIP_WAITING` senden.
- Den `controllerchange`-Listener behalten — er löst dann automatisch `window.location.reload()` aus.
- Sichtbarer Dialog/Card entfällt; stattdessen kurzer Toast „App wird aktualisiert…" direkt vor dem Reload.
- Erstinstallation (kein vorhandener `controller`) löst **kein** Reload aus.

### 3. `src/components/PWA/AppStatusBar.tsx` — konsistent halten
Den manuellen „Update"-Button entfernen (bzw. den `showUpdateButton`-Pfad), da Updates jetzt automatisch laufen. Online/Offline- und PWA-Badge bleiben unverändert.

## Verhalten nach Umsetzung
- **PC**: Beim nächsten Tab-Focus / Reload erkennt der SW das Update, installiert es, aktiviert sofort, lädt die Seite neu → neue Version + neue Versionsnummer im Footer.
- **Handy (installierte PWA)**: Beim Öffnen der App prüft der SW auf Updates, spielt sie ohne Nachfrage ein, kurzer Reload → neue Version sichtbar.
- **Offline**: Letzter Cache wird weiterhin ausgeliefert, kein Bruch.

## Hinweise
- Einmalige Übergangsphase: Geräte mit dem **alten** SW müssen einmal manuell aktualisiert werden (Hard-Reload PC, App-Switcher schließen Handy). Danach greift der neue Auto-Update-Mechanismus dauerhaft.
- Risiko: User kann theoretisch mitten in einer Eingabe von einem Reload überrascht werden. Da die App keine langen Formular-Workflows ohne Zwischenspeicherung hat, ist das Risiko gering.
