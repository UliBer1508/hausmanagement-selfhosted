# Systemstatus in der Hausverwaltung

> Stand: 23.11.2026 · Vorbild: Heizung (`smartfox-insight-ai-selfhosted`, `doc/SYSTEMSTATUS-2026-11-05.md`)

## Was

Ein Symbol in der Kopfleiste neben „Abmelden“ zeigt einen grünen Punkt oder „1 Problem“. Im Fenster stehen:

1. **„Alles läuft“** bzw. die Problemliste
2. Karte **„Sicherungen“**: Hausverwaltung (eigene Datenbank) und Heizung, jeweils wann zuletzt
   gesichert wurde, von welchem PC, die Größe und „PC Österreich übersprungen“
   (`sicherungKurz()` in `lib/backupStatus.ts`)
3. **München-PC** und **Österreich-PC** mit allen Diensten (gemeldet vom Dienste-Wächter alle 30 s),
   mit Start, Stop und Neustart
4. **Cloud** der Heizung (Heizungsautomatik, Fronius, Thermostate, München-Collector, pg_cron, Functions, Webseiten)

## Woher die Daten kommen

PCs, Dienste und Cloud liegen in der **Heizungs-Datenbank** (`pflnniklvqbwjwrjswaz`). Die Hausverwaltung
fragt über eine Brücke an:

```
App (hooks/useSystemStatus.ts, alle 30 s)
  → Edge Function system-status (Hausverwaltung, nur Admin: requireAdmin)
  → Heizung: Edge Function system-bridge (Kopfzeile x-bridge-token = Secret BRIDGE_TOKEN)
  → system_problems(), system_hosts, system_services, service_commands, system_cloud_status(), backup_runs
```

- Befehle prüft die Heizung mit `service_command_allowed()`: Der Dienst muss bekannt sein, Fernzugriff
  (Tailscale, Cloudflare) darf nur gestartet werden, und es darf kein gleicher Befehl offen sein.
  Ausgeführt wird er vom Dienste-Wächter.
- „Jetzt ausführen“ (Heizungsautomatik) gibt es nur in der Heizungs-App.
- Mails bei Problemen der PCs verschickt weiter die Heizung (`system-alert`).
- Gemeinsamer Code: `supabase/functions/_shared/bridge.ts`. Die Datei ist in beiden Repos gleich.
  Die Karte (`components/layout/SystemBackupsCard.tsx`) und `lib/backupStatus.ts` sind es ebenfalls.

## Einrichtung (einmalig)

1. **Token in beiden Projekten setzen.** Der Wert muss in beiden gleich sein. PowerShell im Repo-Ordner:
   ```
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $t = ($b | ForEach-Object { $_.ToString('x2') }) -join ''
   supabase secrets set BRIDGE_TOKEN=$t --project-ref usblrulkcgucxtkhugck
   supabase secrets set BRIDGE_TOKEN=$t --project-ref pflnniklvqbwjwrjswaz
   ```
2. **Heizung:** PR mergen. Die GitHub-Aktion deployt `system-bridge` (`verify_jwt = false`).
3. **Hausverwaltung:** PR mergen, dann `supabase functions deploy system-status`.

## Fehlerbilder

| Anzeige | Ursache |
|---|---|
| „Heizung: Status nicht abrufbar – Secret BRIDGE_TOKEN fehlt“ | Schritt 1 in der Hausverwaltung fehlt |
| „… Heizung lehnt das Token ab“ | Token in den Projekten verschieden, oder Heizung ohne Token |
| „… Gegenseite antwortet 404“ | `system-bridge` in der Heizung nicht deployt |
| Symbol fehlt ganz | angemeldet ohne Admin-Rolle, oder `system-status` nicht deployt |
