## Ziel

Sämtliche E-Mail-Kommunikation läuft ausschließlich über deinen lokal installierten E-Mail-Client via `mailto:`-Links, immer adressiert von `steinbockchalets@gmail.com`. Kein Server-Versand mehr.

## Was sich ändert

### 1. Zentraler `mailto:`-Helper (neu)
Neue Datei `src/lib/mailtoHelper.ts` mit Funktion `openInMailClient({ to, subject, html, text })`:
- Konvertiert HTML → lesbarer Plain-Text (Tags strippen, `<br>`/`<p>` → Zeilenumbruch, Links als „Text (URL)")
- Baut korrekt URL-encodierten `mailto:`-Link
- Öffnet ihn via `window.location.href` → dein Standard-Mail-Client (Outlook/Apple Mail/Thunderbird) öffnet ein neues Mail-Fenster mit Empfänger, Betreff und Body vorausgefüllt
- Du editierst dort den Text und sendest manuell von `steinbockchalets@gmail.com`

### 2. Aufrufstellen umstellen (5 Dateien)
Jeder Aufruf von `supabase.functions.invoke('send-gmail', ...)` wird durch `openInMailClient(...)` ersetzt — die KI-Generierung der Inhalte (Betreff/Body) bleibt unverändert, nur der Versandweg ändert sich:

- `src/hooks/useRebookingScore.ts` → Rebooking-Kampagne öffnet Mail-Client
- `src/components/Guests/GuestCommunication.tsx` (2 Stellen) → Gast-Kommunikation öffnet Mail-Client
- `src/components/Houses/BookingLinenOverview.tsx` → Teuni-Wäsche-Mail öffnet Mail-Client
- `src/components/Houses/LinenOrdersTab.tsx` → Provider-Mail öffnet Mail-Client
- `src/components/Dashboard/SettingsTab.tsx` → Test-Mail Button wird umgestellt (oder durch „mailto-Test" ersetzt)

UI-Toasts/Buttons werden angepasst: statt „E-Mail versendet" steht jetzt „E-Mail-Entwurf im Mail-Client geöffnet".

### 3. Automatischer Supabase-Nutzungs-Report → komplett deaktivieren
- Cron-Job in der Datenbank entfernen (löscht den `cron.schedule`-Eintrag für `check-supabase-usage`)
- Edge Function `check-supabase-usage` bleibt zwar liegen, wird aber nicht mehr getriggert
- UI im SettingsTab, das diesen Report manuell antriggert, wird entfernt/deaktiviert

### 4. Edge Function `send-gmail` außer Betrieb nehmen
- Datei `supabase/functions/send-gmail/index.ts` wird gelöscht
- Eintrag aus `supabase/config.toml` entfernt
- Secret `GMAIL_APP_PASSWORD` bleibt vorerst stehen (du kannst es später im Supabase-Dashboard löschen — sag Bescheid, wenn ich das ebenfalls erledigen soll)

## Was bewusst NICHT geändert wird

- KI-Generierung der E-Mail-Texte (Gemini/Edge Functions wie `generate-personalized-email`) bleibt — die liefern weiterhin Betreff und Body, nur der Versand ist anders
- Mieter-Kommunikation läuft schon via `mailto:` — keine Änderung nötig
- Provider-Messaging (In-App-Chat) — ist keine Mail, bleibt unverändert
- Auth-Mails von Supabase (Passwort-Reset etc.) — laufen weiterhin über Supabase Auth, nicht über `send-gmail`

## Einschränkungen, die du kennen solltest

- **Kein HTML im Mail-Body**: `mailto:` überträgt nur Plain-Text. Formatierungen, Bilder und Inline-Styles aus den KI-Mails gehen verloren — du bekommst sauberen Fließtext mit Zeilenumbrüchen und URLs als Klartext.
- **Zeichenlimit**: `mailto:` ist je nach Mail-Client/OS auf ~2000 Zeichen begrenzt. Sehr lange KI-Mails werden ggf. abgeschnitten. Falls das ein Problem wird, kann ich später eine „Body in Zwischenablage kopieren"-Option ergänzen.
- **Kein automatischer Versand mehr**: jede Mail erfordert deinen Klick im Mail-Client. Damit ist die Rebooking-Kampagne nicht mehr batchfähig — pro Gast öffnet sich ein Fenster.

## Reihenfolge der Umsetzung

1. `mailtoHelper.ts` anlegen
2. 5 Aufrufstellen umstellen (parallele Edits)
3. Cron-Job entfernen (SQL via insert-Tool)
4. `send-gmail`-Function + Config-Eintrag löschen
5. Memory aktualisieren: „Alle E-Mails ausschließlich via mailto, kein SMTP-Versand"
