# Datenbank-Sicherung Supabase (Hausverwaltung)

> Stand: 29.09.2026 · läuft auf dem **ASUS PN40 (München)**
> Warum: Die Supabase-Organisation ist im **Free-Plan** — dort gibt es **keine**
> automatischen Backups. Diese Sicherung ersetzt das kostenlos.

## Was gesichert wird

Jede Nacht legt der PN40 im OneDrive einen Ordner `JJJJ-MM-TT_HHMM` an:

| Datei / Ordner | Inhalt |
|---|---|
| `datenbank.dump` | die **komplette** Datenbank `usblrulkcgucxtkhugck`: alle Tabellen, Daten, Funktionen, Trigger und Rechte (welche Schemas genau drin sind, zeigt `datenbank-inhalt.txt`) |
| `datenbank-inhalt.txt` | Inhaltsverzeichnis — Beweis, dass der Dump lesbar ist |
| `storage\house-images\…` | alle Hausbilder |
| `storage\tenant-receipts\…` | alle **Mietbelege** |
| `storage-liste.csv` | Liste aller gesicherten Dateien mit Größe und Status |

Im Sicherungsordner stehen außerdem:
- `LETZTE-SICHERUNG.txt` — **auf einen Blick:** ERFOLGREICH / MIT WARNUNGEN / FEHLGESCHLAGEN
- `sicherung.log` — Protokoll aller Läufe

Sicherungen älter als **30 Tage** werden automatisch gelöscht (nur Ordner mit dem
Datumsmuster, sonst nichts).

**Nicht** enthalten (liegt ohnehin anderswo): Code der Edge Functions (GitHub),
Secrets der Edge Functions (Werte nur bei dir), Dokumente in OneDrive.

## Sicherheit

- Datenbank-Passwort und Secret-Key stehen **in keinem Skript**. Das Setup speichert
  sie mit Windows-Verschlüsselung (DPAPI) **an den PN40 gebunden** — auf einem anderen
  PC sind die Dateien wertlos. Lesen dürfen nur dein Benutzer, Administratoren, SYSTEM.
- Die Sicherungen enthalten **Gästedaten** — nie nach GitHub legen (Repos sind öffentlich).

---

## Einrichtung (einmalig, ca. 15 Minuten)

### Schritt 1 — PostgreSQL-Werkzeuge installieren

1. https://www.postgresql.org/download/windows/ → „Download the installer“ (EDB)
2. Neueste Version für Windows x86-64 herunterladen und starten
3. Bei **„Select Components“** nur **„Command Line Tools“** anhaken
   (PostgreSQL Server, pgAdmin, Stack Builder **abwählen** — du brauchst keinen
   eigenen Datenbank-Server)
4. Durchklicken, fertig. Die Werkzeuge liegen dann unter
   `C:\Program Files\PostgreSQL\<Version>\bin`.

> Die Werkzeug-Version muss **gleich oder neuer** als die Supabase-Datenbank sein.
> Mit der neuesten Version bist du immer auf der sicheren Seite.

### Schritt 2 — Dateien ablegen

Die Datei `supabase-backup.zip` (aus dem Chat mit Claude, 29.09.2026) nach
`C:\Users\<dein Name>\` entpacken. Dadurch entsteht der Ordner
`C:\Users\<dein Name>\supabase-backup` mit:
- `Backup-Supabase.ps1` — die nächtliche Sicherung
- `Setup-SupabaseBackup.ps1` — die einmalige Einrichtung
- `Set-DbPassword.ps1` — Datenbank-Passwort eingeben, prüfen und speichern
- `Set-ServiceKey.ps1` — Secret-Key eingeben und speichern
- diese Anleitung

**Bewusst nicht im OneDrive:** In diesen Ordner legt das Setup auch die
Zugangsdaten (`db-password.bin`, `service-key.bin`, `config.json`). Die sollen den
PN40 nicht verlassen. Außerdem läuft die Sicherung nachts ohne angemeldeten
Benutzer, also ohne OneDrive-Programm. Liegt das Skript im OneDrive als
„nur online verfügbar“, kann Windows es dann nicht laden und die Sicherung fällt aus.
**Die Sicherungen selbst** landen dagegen im OneDrive (Schritt 4).

### Schritt 3 — Zwei Angaben aus dem Supabase-Dashboard bereithalten

1. **Verbindungszeile:** Projekt öffnen → oben **„Connect“** → Methode
   **„Session pooler“** → die Zeile kopieren. Sie sieht so aus:
   `postgresql://postgres.usblrulkcgucxtkhugck:[YOUR-PASSWORD]@aws-….pooler.supabase.com:5432/postgres`
   (Das `[YOUR-PASSWORD]` bleibt so stehen — das Passwort wird getrennt abgefragt.)
2. **Secret-Key** (für die Dateien): **Project Settings → API Keys** →
   „Secret key“ (`sb_secret_…`), oder im Reiter „Legacy“ der `service_role`-Schlüssel.

### Schritt 4 — Setup starten

1. Startmenü → „PowerShell“ → Rechtsklick → **„Als Administrator ausführen“**
2. Eingeben:
   ```
   cd $env:USERPROFILE\supabase-backup
   Set-ExecutionPolicy -Scope Process Bypass
   .\Setup-SupabaseBackup.ps1
   ```
3. Die Fragen beantworten: Verbindungszeile einfügen, Sicherungsordner
   (Enter = OneDrive\Backups\Supabase-Hausverwaltung), Aufbewahrung (Enter = 30).
   Passwort und Secret-Key eintippen oder einfügen (Strg+V / Rechtsklick). Die
   Eingabe ist sichtbar, das Fenster wird danach sofort geleert. Das Passwort wird
   gegen Supabase geprüft und nur gespeichert, wenn die Anmeldung klappt.
   Danach Uhrzeit (Enter = 03:15).
4. Am Ende **Test-Sicherung mit J bestätigen** und das Ergebnis ansehen.

Das Setup legt die geplante Aufgabe **„Supabase-Sicherung Hausverwaltung“** an. Sie
läuft täglich, auch wenn niemand am PN40 angemeldet ist, und holt einen verpassten
Lauf nach, sobald der PC wieder an ist.

> OneDrive lädt die Dateien hoch, sobald der OneDrive-Client läuft. Ist am PN40
> dauerhaft niemand angemeldet, liegen die Sicherungen zunächst nur lokal und werden
> bei der nächsten Anmeldung hochgeladen.

---

## Kontrolle im Alltag

- `OneDrive\Backups\Supabase-Hausverwaltung\LETZTE-SICHERUNG.txt` öffnen — geht auch
  vom Handy aus. Steht dort ein Datum von heute Nacht und **ERFOLGREICH**, ist alles gut.
- Oder am PN40: **Aufgabenplanung** → „Supabase-Sicherung Hausverwaltung“ →
  „Ergebnis der letzten Ausführung“: `0x0` = erfolgreich, `0x2` = mit Warnungen,
  `0x1` = fehlgeschlagen.

---

## Wiederherstellen

> Vor jeder Wiederherstellung: erst **eine frische Sicherung** ziehen
> (Aufgabenplanung → Rechtsklick → „Ausführen“), damit der aktuelle Stand nicht verloren geht.
> Im Zweifel erst zusammen durchgehen — Wiederherstellen überschreibt Daten.

### Einzelne Dateien (Mietbeleg, Bild)
Einfach aus `storage\<bucket>\…` im Sicherungsordner nehmen und im Supabase-Dashboard
unter **Storage** wieder hochladen.

### Nachsehen, was in einem Dump steckt
```
& "C:\Program Files\PostgreSQL\<Version>\bin\pg_restore.exe" --list datenbank.dump
```

### Eine einzelne Tabelle als SQL-Datei herausziehen (zum Ansehen oder gezielten Zurückspielen)
```
& "C:\Program Files\PostgreSQL\<Version>\bin\pg_restore.exe" --data-only --table=bookings --file=bookings.sql datenbank.dump
```
Die Datei `bookings.sql` enthält dann alle Zeilen der Tabelle und kann im
Supabase SQL-Editor gezielt verwendet werden.

### Komplette Datenbank
Nur im Notfall und am besten in ein **neues, leeres Supabase-Projekt** (nicht über
die laufende Produktion). Vorgehen dann gemeinsam planen.

---

## Anzeige und Einstellungen in der Hausverwaltung (ab 30.09.2026)

Einstellungen → Karte **„Datensicherung“**: letzte Sicherung mit Status, Größe,
Dateien, Ordner im OneDrive, Verlauf der letzten Läufe und eine rote Warnung,
wenn die letzte gelungene Sicherung älter als die Warnschwelle ist.
Einstellbar: Sicherung aktiv/pausiert, Dateien mitsichern, Aufbewahrung (Tage),
Warnschwelle (Stunden). Das Skript liest diese Werte zu Beginn jedes Laufs und
meldet am Ende das Ergebnis in die Tabelle `backup_runs`
(`supabase/SQL/60_datensicherung.sql`). Die Uhrzeit bleibt eine Einstellung des
PN40 (Setup erneut ausführen).

## Wo das Datenbank-Passwort steht

Die Datenbank wurde am 31.07.2025 **über Vercel** angelegt (Vercel Marketplace).
Das Datenbank-Passwort hat Vercel erzeugt — es ist **nicht** das Passwort für die
Anmeldung auf supabase.com. Nachsehen: vercel.com → links **Storage** →
**supabase-ferienhausmanagement2** → Kasten „.env.local“ → **Show secret** →
Zeile `POSTGRES_PASSWORD` (nur den Wert zwischen den Anführungszeichen).

Erste erfolgreiche Sicherung: 30.09.2026 08:49 — 4,7 MB, 166 Tabellen mit Daten,
3 Hausbilder, 0 Mietbelege (Bucket `tenant-receipts` war zu diesem Zeitpunkt leer).

## Wenn etwas nicht klappt

| Meldung | Ursache | Lösung |
|---|---|---|
| `password authentication failed` | Passwort falsch — oft das Konto-Passwort statt des Datenbank-Passworts | Wert aus Vercel nehmen (siehe oben) und `.\Set-DbPassword.ps1` erneut |
| `Set-DbPassword`: „DAS IST VERMUTLICH KEIN REINES PASSWORT“ | Mehr als das Passwort eingefügt (Tabulator, Leerzeichen, verdeckte Punkte, Platzhalter) | Nur das Passwort eingeben. Es wird dann **kein** Anmeldeversuch gemacht. |
| `Set-DbPassword`: „Das Problem ist die VERBINDUNG“ | Server nicht erreichbar, Passwort unbeteiligt | Supabase-Status prüfen (status.supabase.com), später erneut |
| Einfügen ins PowerShell-Fenster zeigt nur `*` | Konsole übernimmt Einfügen in verdeckte Eingaben nicht | Deshalb sind die Eingaben jetzt sichtbar (Fenster wird danach geleert) |

Wichtig: Jeder Anmeldeversuch mit falschem Passwort zählt bei Supabase als
Angriffsverdacht; zu viele führen zu einer vorübergehenden Sperre der IP.
Prüfen/aufheben: `supabase network-bans get --project-ref usblrulkcgucxtkhugck --experimental`

## Wartung

| Anlass | Was tun |
|---|---|
| Datenbank-Passwort geändert | `.\Set-DbPassword.ps1` |
| Secret-Key geändert | `.\Set-ServiceKey.ps1` |
| Neue PostgreSQL-Werkzeug-Version installiert | Setup erneut ausführen (findet die neueste selbst) |
| Aufbewahrung/Uhrzeit ändern | Setup erneut ausführen |
| Sicherung abschalten | Aufgabenplanung → Aufgabe deaktivieren |

Konfiguration liegt in `C:\Users\<dein Name>\supabase-backup\config.json`.
Das Feld `ExcludeSchemas` ist leer; nur falls pg_dump in Zukunft wegen eines
Supabase-internen Schemas abbricht, trägt man dessen Namen dort ein.

---

## Getestet (29.09.2026, gegen Test-Datenbank und nachgebauten Speicher)

- Datenbank-Dump + Lesbarkeitsprüfung; **Wiederherstellung einer Tabelle** (5000 Zeilen) ✓
- Dateien mit Umlauten, Leerzeichen, Unterordnern; über 1000 Dateien je Ordner ✓
- Aufräumen nur alter Datums-Ordner, fremde Ordner bleiben ✓
- Falscher Secret-Key → Datenbank trotzdem gesichert, Status „MIT WARNUNGEN“ ✓
- Falsches Passwort → Status „FEHLGESCHLAGEN“ mit Ursache, kein Hängenbleiben ✓
- Passwort mit Sonderzeichen (`:` und `\`) ✓

Der erste Lauf gegen die **echte** Supabase-Datenbank ist die Test-Sicherung am Ende
des Setups.
