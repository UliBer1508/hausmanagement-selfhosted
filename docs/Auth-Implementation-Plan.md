# Auth-Implementierung – Plan für später

Ziel: Email/Passwort-Login für die Hauptapp, Portale bleiben anonym wie bisher.
Keine RLS in der Datenbank – Schutz erfolgt rein UI-seitig.

## Architektur

- **Hauptapp**: Email/Passwort-Login via Supabase Auth, Routen mit `ProtectedRoute` gewrappt.
- **Portale** (`/portal/cleaning`, `/portal/laundry`, `/portal/service`, ...): Bleiben vollständig öffentlich, anonymer Zugriff über anon-key wie bisher. Keine Token nötig.
- **Datenbank**: Keine RLS. Alle Tabellen weiterhin via anon-key erreichbar.

## User-Verwaltung

- Neue Admin-User werden **manuell** im Supabase Dashboard angelegt (Auth → Users → Add user).
- Self-Signup ist deaktiviert.
- Kein eigenes Profile-Table nötig (reine Login-Funktion). Ein `handle_new_user`-Trigger existiert bereits und füllt `user_profiles` automatisch – bleibt unverändert.

## Zu erstellende Dateien

1. `src/hooks/useAuth.tsx` – Auth-Context.
   - Reihenfolge wichtig: zuerst `supabase.auth.onAuthStateChange(...)` registrieren, **danach** `supabase.auth.getSession()` aufrufen.
   - Stellt `{ session, user, loading, signOut }` bereit.
2. `src/pages/Auth.tsx` – Login-Seite mit Email + Passwort + Link "Passwort vergessen".
3. `src/pages/ResetPassword.tsx` – Setzt neues Passwort via `supabase.auth.updateUser({ password })`. Public route, prüft `type=recovery` im URL-Hash.
4. `src/components/ProtectedRoute.tsx` – Wrapper, redirect auf `/auth` wenn keine Session.
5. Erweiterung der Top-Navigation (`AppLayout`) – Email-Anzeige + Logout-Button rechts.

## Routing (`src/App.tsx`)

```
Öffentliche Routen (kein Schutz):
  /auth
  /reset-password
  /portal/*   (alle Portale)

Geschützte Routen (ProtectedRoute-Wrapper):
  /           (Dashboard)
  Alle übrigen Hauptapp-Routen
```

## Password-Reset Flow

- Auf `/auth`: "Passwort vergessen" → 
  ```ts
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  ```
- `/reset-password` prüft Recovery-Hash und ruft `supabase.auth.updateUser({ password })` auf.
- **Voraussetzung für gebrandete Mails**: Lovable Auth Email Templates (Recovery) aufsetzen. Default-Mails funktionieren auch ohne Setup.

## Login-Verhalten

- Nach erfolgreichem Login: Redirect auf `/` (Dashboard).
- Logout-Button in der Top-Nav rechts neben Email-Anzeige.

## Sicherheits-Trade-off (bewusst akzeptiert)

- Da keine RLS aktiv ist und Portale anonym auf die DB zugreifen, bleiben **alle Tabellen** über den anon-key öffentlich lesbar/schreibbar.
- Der Login schützt **nur die Hauptapp-UI**, nicht die Datenbank.
- Die offenen Findings im Security-Panel (Missing RLS, Open Edge Functions, PII Exposure) sind dadurch erwartbar und werden während der Entwicklung hingenommen.
- Bei Going-Live sollte zusätzlich nachgezogen werden:
  - RLS auf allen Tabellen aktivieren.
  - `verify_jwt = true` für sensible Edge Functions (`send-gmail`, `import-guest-list`, `insert-tenant-payments`, `chat-assistant`).
  - `tenant-receipts` Storage-Bucket privat schalten.
  - Realtime-Policies setzen.

## Umsetzungs-Reihenfolge

1. `useAuth`-Hook + Auth-Context anlegen.
2. `/auth` und `/reset-password` Seiten bauen.
3. `ProtectedRoute` implementieren und in `App.tsx` einbinden (Portale ausnehmen!).
4. Logout-Button + Email in Top-Nav integrieren.
5. Ersten Admin-User manuell im Supabase Dashboard anlegen.
6. Optional: Auth-Email-Templates (Recovery) brandgerecht aufsetzen.

## Hinweise zur Implementierung

- Niemals `localStorage`/`sessionStorage` für Auth-State verwenden – ausschließlich Supabase-Session.
- `signUp` wird nicht angeboten (Self-Signup deaktiviert).
- Beim Login `emailRedirectTo` nicht nötig (kein Signup-Flow).
- Bei `resetPasswordForEmail` immer `redirectTo` mit `/reset-password` setzen.