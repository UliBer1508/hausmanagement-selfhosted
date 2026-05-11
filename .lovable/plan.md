## Ziel
Eingeloggte Nutzer sollen sich überall in der App per Klick auf ein Logout-Icon ausloggen können.

## Umsetzung
- In `src/components/Layout/AppLayout.tsx` einen kleinen, fest positionierten Logout-Button (oben rechts, `LogOut`-Icon aus lucide-react, ghost variant) hinzufügen.
- Beim Klick:
  - `supabase.auth.signOut()` aufrufen
  - Toast "Abgemeldet" anzeigen
  - Mit `navigate('/login', { replace: true })` zur Login-Seite weiterleiten
- Den Button nur rendern, wenn eine Session vorhanden ist (per `supabase.auth.getSession` + `onAuthStateChange`), damit er auf der Login-Seite nicht erscheint.
- Tooltip "Abmelden" für Klarheit.

## Technische Details
- Nur eine Datei betroffen: `src/components/Layout/AppLayout.tsx`.
- Imports: `LogOut` (lucide-react), `Button`, `supabase`, `useNavigate`, `useToast`, `useEffect/useState`.
- Keine DB- oder Routing-Änderungen.