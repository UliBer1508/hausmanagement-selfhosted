# Plan: Datei mit Auth-Lösung im Projekt ablegen

Erstelle die Datei `docs/Auth-Implementation-Plan.md` mit der gesamten Lösungsbeschreibung für den späteren Einsatz.

## Inhalt der Datei

Die Datei dokumentiert die geplante Authentifizierung mit folgenden Eckpunkten:

### Architektur-Übersicht
- **Hauptapp**: Email/Passwort-Login via Supabase Auth (UI-seitiger Schutz, keine RLS)
- **Portale** (`/portal/cleaning`, `/portal/laundry`, `/portal/service`): Bleiben vollständig öffentlich, anonymer Zugriff wie bisher
- **Keine RLS** in der Datenbank — Schutz nur auf UI-Ebene

### User-Verwaltung
- Neue Admin-User werden **manuell** im Supabase Dashboard angelegt (Auth → Users → Add user)
- Self-Signup ist deaktiviert
- Kein User-Profile-Table nötig (reine Login-Funktion, keine Profil-Daten)

### Zu erstellende Dateien
1. `src/hooks/useAuth.tsx` — Auth-Context mit `onAuthStateChange` (zuerst!) und `getSession()`
2. `src/pages/Auth.tsx` — Login-Seite (Email + Passwort + "Passwort vergessen"-Link)
3. `src/pages/ResetPassword.tsx` — Setzt neues Passwort via `supabase.auth.updateUser()`
4. `src/components/ProtectedRoute.tsx` — Wrapper, redirect auf `/auth` wenn keine Session
5. Erweiterung der Top-Navigation (`AppLayout`) — Email-Anzeige + Logout-Button

### Routing-Anpassungen in `src/App.tsx`
```text
Öffentliche Routen (kein Schutz):
  /auth
  /reset-password
  /portal/cleaning
  /portal/laundry
  /portal/service
  (alle weiteren /portal/* Routen)

Geschützte Routen (ProtectedRoute-Wrapper):
  /  (Dashboard)
  Alle übrigen Hauptapp-Routen
```

### Password-Reset Flow
- "Passwort vergessen" → `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })`
- Reset-Seite prüft `type=recovery` im URL-Hash und ruft `updateUser({ password })` auf
- **Voraussetzung**: Auth-Email-Templates via Lovable Auth Email System einrichten (eigener Schritt)

### Login-Verhalten
- Nach erfolgreichem Login: Redirect auf `/` (Dashboard)
- Logout-Button in der Top-Navigation rechts neben Email-Anzeige

### Wichtige Hinweise (in der Datei vermerkt)
- **Sicherheits-Trade-off**: Da keine RLS aktiv ist und Portale anonym zugreifen, bleiben alle Tabellen weiterhin über den anon-key öffentlich lesbar/schreibbar. Der Login schützt nur die Hauptapp-UI, nicht die Datenbank.
- Die offenen Security-Findings im Security-Panel sind dadurch erwartbar und werden bewusst hingenommen.
- Bei späterem Produktiv-Going sollte RLS + verify_jwt für Edge Functions nachgezogen werden.

### Umsetzungs-Reihenfolge (für später)
1. `useAuth`-Hook + Auth-Context anlegen
2. `/auth` und `/reset-password` Seiten bauen
3. `ProtectedRoute` implementieren und in `App.tsx` einbinden
4. Logout-Button in Top-Nav integrieren
5. Ersten Admin-User manuell im Supabase Dashboard anlegen
6. Optional: Auth-Email-Templates (Recovery) brandgerecht aufsetzen

## Aktion in diesem Schritt
Nur die Datei `docs/Auth-Implementation-Plan.md` mit obigem Inhalt anlegen. Keine Code-Änderungen, keine DB-Migrationen, keine Edge-Function-Deployments.
