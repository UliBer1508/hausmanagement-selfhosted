# Max KI-Assistent — Automatische Terminfragen (Etappe 3)
## Stand und offene Schritte

**Datum:** 07.07.2026
**Repo:** https://github.com/UliBer1508/hausmanagement-selfhosted

---

## Was Max jetzt kann (fertig gebaut & getestet)

Max (der KI-Assistent) prüft anstehende Reinigungstermine und kann Amela/Teuni
automatisch fragen, ob der Termin passt — inklusive der Info, ob die Wäsche
**vor** der Reinigung geliefert ist.

**Getestet im Testlauf (30-Tage-Fenster):** 5 echte Reinigungen korrekt gefunden,
jede mit richtigem Gast, Haus, Uhrzeit und passender Wäsche-Info. Beispiel:
- Niels (18.7.): "Die frische Wäsche ist bereits geliefert (am 10.07.2026)."
- Adnan (22.7.): "Die Wäsche soll am 21.07.2026 geliefert werden – also vor der Reinigung."

---

## Was schon LIVE ist

1. **Migration** (2 Felder in `cleaning_automation_settings`): ausgeführt
   - `max_reminder_enabled` (An/Aus, Standard: false)
   - `max_reminder_days_before` (Vorlaufzeit, Standard: 3)
2. **Edge Function** `max-cleaning-reminders`: deployt + auf GitHub
3. **Einstellungskarte** "Max: Automatische Terminfragen": gebaut
   (in Reinigungs-Verwaltung — An/Aus-Schalter + Vorlaufzeit-Stepper)

### Frontend-Dateien (müssen noch nach GitHub, dann baut Vercel automatisch)
- `src/components/Cleaning/MaxReminderSettingsCard.tsx` (NEU)
- `src/hooks/useCleaningAutomationSettings.ts` (ERSETZT — Interface erweitert)
- `src/components/Cleaning/CleaningManagement.tsx` (ERSETZT — Karte eingebunden)

---

## OFFENE SCHRITTE bis zum Scharfschalten

### Schritt 1 — Cron-Job einrichten (täglicher Auslöser)
Im Supabase SQL Editor ausführen
(https://supabase.com/dashboard/project/usblrulkcgucxtkhugck/sql/new):

```sql
SELECT cron.schedule(
  'max-cleaning-reminders-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url:='https://usblrulkcgucxtkhugck.supabase.co/functions/v1/max-cleaning-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI"}'::jsonb,
    body:='{"dry_run": false}'::jsonb
  ) as request_id;
  $$
);
```
- Läuft täglich um 7:00 Uhr (Wäsche-Cron läuft um 6:00 — keine Überschneidung)
- `dry_run: false` = echter Modus
- WICHTIG: Sendet trotzdem NICHTS, solange der Schalter (max_reminder_enabled)
  in der Einstellungskarte AUS ist. Cron = Auslöser, Schalter = Freigabe.

### Schritt 2 — Einführungsnachricht an Amela (VOR dem Scharfschalten)
Weg 1: über Max im Chat ("schick Amela die Einführung"), Uli gibt frei.
Freigegebener Text:

> Hallo Amela! 👋
> Ich bin Max, der KI-Assistent von Uli für die Steinbock Chalets.
> Ab jetzt melde ich mich manchmal bei dir – zum Beispiel, wenn eine Reinigung
> ansteht, und frage dich, ob der Termin für dich passt. So müssen wir nicht
> immer hin und her telefonieren.
> Wichtig: Wenn du mir antwortest oder eine Frage hast, liest das Uli und meldet
> sich bei dir. Ich stelle nur die Fragen – die Antworten kommen von Uli persönlich.
> Bis bald! 😊
> Max

### Schritt 3 — Scharfschalten
In der Einstellungskarte "Max: Automatische Terminfragen":
- Vorlaufzeit auf gewünschten Wert stellen (z.B. 3 Tage) — Wert mit Amela abstimmen!
- Schalter "Automatische Fragen aktiv" auf AN
- Vorher NICHT vergessen: Testwert von 30 Tagen ist evtl. noch aktiv →
  auf sinnvollen Wert (z.B. 3) zurückstellen.

---

## Sicherheits-Mechanismen (eingebaut)
- **Dreifacher Schutz:** Testlauf-Standard + dry_run:false nötig + max_reminder_enabled nötig
- **Spam-Schutz:** Jede Reinigung wird nur EINMAL gefragt (über related_task_id)
- **Not-Aus:** Schalter in der Einstellungskarte stoppt Max sofort
- **Nur aktive Buchungen** (confirmed) und **geplante Reinigungen** (scheduled)

## Getroffene Entscheidungen
- **Variante A** (Zeitfenster): Max fragt jede Reinigung X Tage vorher, je einmal
  (nicht strikt sequentiell — garantiert genug Vorlauf für Amela zum Antworten)
- **Modell A** (Antworten): Amelas Antworten gehen an Uli, Uli reagiert.
  Max antwortet (noch) nicht selbst — das ist ein späteres, größeres Thema.
- Vorlaufzeit zentral in Hausverwaltung (nicht Amela-Portal-Popup, das nur
  lokal im Browser liegt und für Max unerreichbar ist).

## Noch offen / später
- Teuni-Portal (fresh-spin-portal-selfhosted) gleiche "Max (Assistent)"-Darstellung
  nachrüsten wie im Amela-Portal (erst wenn Amela sich im Alltag bewährt)
- "Max antwortet selbst" auf Amelas Rückfragen (Zukunft, größer)
- Gästezahl-Änderung an Teuni melden (booked_guests ≠ number_of_guests)
- Cron-Migration nach GitHub committen (für vollständige Doku; Betrieb läuft
  über Dashboard)
