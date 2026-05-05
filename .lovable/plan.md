## Schritt 3: SettingsTab extrahieren

Ziel: Den ~456 Zeilen langen `case 'Einstellungen'`-Block (Zeilen 1708-2164) aus `src/pages/OriginalDashboard.tsx` in eine eigene Komponente auslagern — **funktional 1:1 identisch**.

### Vorgehen

**Neue Datei**: `src/components/Dashboard/SettingsTab.tsx`

Die Komponente erhält alle Settings-State-Werte und Handler als Props vom Parent. Da die State-Verwaltung (`useSystemSettings`-Hook etc.) bereits zentralisiert in `OriginalDashboard.tsx` liegt und auch von anderen Tabs/Bereichen genutzt werden könnte, bleibt sie vorerst im Parent — wir reichen nur durch.

**Props-Interface** (übergeben aus OriginalDashboard):
- `localProfileSettings`, `setLocalProfileSettings`, `saveProfileSettings`, `isSavingProfile`
- `notificationSettings`, `setNotificationSettings`, `saveNotificationSettings`, `sendTestNotification`
- `localEmailSettings`, `setLocalEmailSettings`, `handleSaveEmailSettings`, `isSavingEmail`
- `localAppearanceSettings`, `handleSaveAppearanceSettings`
- `handleShowUsageReport`, `saveAllSettings`

**Karten in SettingsTab** (alle bestehenden, unverändert):
1. Profil
2. Benachrichtigungen
3. Nutzungsberichte
4. E-Mail-Versand (inkl. Test-E-Mail-Button mit `supabase.functions.invoke('send-gmail')`)
5. Sicherheit
6. Erscheinungsbild
7. `<RatingReminderSettingsCard />`
8. `<GuestImportCard />`
9. System
10. Aktionen

### Änderungen in `OriginalDashboard.tsx`

- Neuer Import: `import { SettingsTab } from '@/components/Dashboard/SettingsTab';`
- `case 'Einstellungen':` ersetzt durch `return <SettingsTab {...settingsProps} />;` — reduziert die Datei um ~456 Zeilen.
- Alle benötigten Imports (User, Bell, FileBarChart, Mail, Shield, Palette, Database, Settings, Save, Send, Clock, CheckCircle, Avatar*, Switch, Select*, RatingReminderSettingsCard, GuestImportCard, supabase, toast) wandern zur neuen Datei. Imports im Parent bleiben (Settings-Icon wird z.B. auch in der Tab-Navigation genutzt) — am Ende prüfe ich mit `rg`, welche Imports im Parent nicht mehr referenziert werden, und entferne nur diese.

### Sicherheitsmaßnahmen

- Keinerlei Logik-Änderungen — reines Verschieben von JSX und Pass-through der Handler.
- Nach dem Edit: visuelle/funktionale Prüfung im Preview (Profil speichern, Test-E-Mail, Theme-Wechsel, "Alle Einstellungen speichern", Bewertungs-Erinnerungen, Gäste-Import).
- Danach folgt Schritt 4 (CalendarTab) und Schritt 5 (OverviewTab + `useDashboardData`).