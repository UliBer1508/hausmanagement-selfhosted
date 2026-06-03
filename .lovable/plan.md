## Ziel
Den globalen "Abmelden"-Button oben rechts entfernen und stattdessen als zusätzlichen Karten-Button in der Dashboard-Navigation einfügen – an der Position nach "Einstellungen" (also unter "Provider" / rechts neben "Einstellungen" im Grid).

## Änderungen

**1. `src/components/Layout/AppLayout.tsx`**
- Header mit `LogOut`-Button, zugehörigen State (`isAuthed`), `handleLogout`, Auth-Listener und unbenutzte Imports entfernen.

**2. `src/pages/OriginalDashboard.tsx`**
- Im Navigations-Grid (Zeile ~1368) nach den `tabs.map(...)`-Buttons einen zusätzlichen Karten-Button "Abmelden" (🚪) einfügen – gleicher Stil wie die anderen Buttons, aber kein Tab.
- onClick: `supabase.auth.signOut()` → Toast → `navigate('/login')`.
- Imports ergänzen: `useNavigate`, `supabase`, `toast`.

Damit erscheint "Abmelden" im Grid als nächste Karte nach "Einstellungen" (responsives Grid, ohne weitere Layout-Anpassungen).