## Ziel

Auf der Login-Seite eine Checkbox "Angemeldet bleiben" hinzufügen. Wenn aktiviert, werden E-Mail und Passwort lokal im Browser gespeichert und beim nächsten Besuch automatisch ins Formular eingetragen.

## Änderungen

**Datei:** `src/pages/Login.tsx`

1. Neuen State `rememberMe` (boolean) hinzufügen.
2. Beim Mount: aus `localStorage` (Key `auth_remember`) gespeicherte Daten laden und Felder + Checkbox vorbefüllen.
3. Im `handleSubmit` nach erfolgreichem Login:
   - Wenn `rememberMe = true`: `{ email, password }` als JSON in `localStorage` unter `auth_remember` speichern (Base64-codiert zur leichten Verschleierung).
   - Wenn `rememberMe = false`: gespeicherten Eintrag entfernen.
4. UI: shadcn `Checkbox` + Label "Angemeldet bleiben" unter dem Passwort-Feld, vor dem Submit-Button.

## Sicherheits-Hinweis

Passwörter im `localStorage` sind grundsätzlich unsicher (XSS-Risiko, Klartext-Lesbarkeit). Da die App nur von einem kleinen Admin-Kreis auf eigenen Geräten genutzt wird und du diese Variante explizit gewählt hast, ist das vertretbar. Die Supabase-Session selbst (Token) wird ohnehin schon in `localStorage` gehalten und bleibt ~1h aktiv — die gespeicherten Credentials dienen also v.a. dem Re-Login nach Token-Ablauf.

Falls du später mehr Sicherheit möchtest, sind Alternativen: nur E-Mail merken, oder Auto-Refresh-Tokens länger laufen lassen.
