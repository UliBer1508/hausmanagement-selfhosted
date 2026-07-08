# Konzept: Max als proaktiver Morgen-Assistent

> **Ziel:** Max übernimmt die tägliche Morgen-Zusammenfassung, führt sie
> serverseitig aus (auch ohne offene App) und stellt sie proaktiv zu.
> **Erstellt:** 08.07.2026 · **Umsetzung geplant:** 09.07.2026

---

## 1. AUSGANGSLAGE (verifiziert im Code)

**Was es heute gibt:**
- `src/hooks/useMorningSummary.ts` — ein **Frontend-Hook**, der eine reiche
  Tagesübersicht baut. Läuft aber NUR, wenn Uli die App öffnet. Zeigt die
  Zusammenfassung einmal täglich im Chat (localStorage-Merker `chat-summary-shown`).
- Max hat bereits `check_upcoming_bookings` (4 Wächter: fehlende Reinigung,
  fehlende Wäsche, Wäsche-Timing, offene Zahlung) und die wiederverwendbare
  `runUpcomingBookingsControl()` + `getControlSettings()` (liest system_settings
  key `max_control_settings`).
- `send-guest-email` Edge Function existiert (denomailer/Gmail). Parameter:
  `{ recipients: [{email, ...}], subjectTemplate, bodyTemplate }`.

**Das Problem / die Lücke:**
Der Morgen-Prozess ist reichhaltig, läuft aber passiv (nur bei App-Öffnung) und
lebt im Frontend. Er deckt mehr ab als Max' Wächter: Gästekontakt vor Anreise,
Bewertungen nachtragen, Marketing-Aktionen, offene Wäsche, kommende Buchungen,
Reinigungen, bestätigte Lieferungen.

**Die Inhalte der heutigen Morgen-Übersicht (aus useMorningSummary):**
1. 📞 Gäste vor Anreise kontaktieren (5–10 Tage vorher, `guest_contact_status=pending`,
   nur rental_type='tourist') — inkl. Marketing-Aktionen + Familien-Tag
2. ⭐ Bewertungen nachtragen (nach Checkout, Fenster aus rating-Settings,
   `external_rating IS NULL`) — inkl. Marketing-Priorität
3. 🔔 Offene Wäschebestellungen (Status 'offen') zu bestätigen
4. 📥 Kommende Buchungen (nächste 7 Tage, confirmed)
5. 🧹 Reinigungen heute + kommende (scheduled/draft)
6. 🧺 Bestätigte Wäsche-Lieferungen (Status 'ausstehend')

---

## 2. ZIELBILD

Max wird zum proaktiven Assistenten in zwei Ebenen:

**Ebene 1 — Max kann die Übersicht auf Anfrage liefern (jederzeit):**
Uli fragt "Was steht heute an?" → Max ruft ein neues Tool `get_morning_summary`
und gibt die volle Übersicht. Erreichbar per Chat, nicht nur bei App-Öffnung.

**Ebene 2 — Max liefert die Übersicht proaktiv jeden Morgen:**
Ein Cron-Job (z.B. 06:30) ruft serverseitig die Übersicht ab und stellt sie zu.
Zustellung wählbar: (A) per E-Mail an Uli, und/oder (B) als Chat-Nachricht, die
beim nächsten App-Öffnen schon bereitliegt.

---

## 3. ARCHITEKTUR (der saubere Weg, ohne Doppellogik)

**Kernproblem vermeiden:** Die Logik darf nicht doppelt existieren (einmal im
Frontend-Hook, einmal serverseitig) — sonst driften sie auseinander. Deshalb:

**Neue Edge Function `morning-summary`** als EINZIGE Quelle der Wahrheit.
Sie enthält die gesamte Sammel- und Formatier-Logik (aus useMorningSummary
portiert). Sie hat zwei Betriebsarten:
- **Abruf** (von Max oder Frontend aufgerufen): gibt die Zusammenfassung als
  Text/JSON zurück. Sendet nichts.
- **Proaktiv** (vom Cron aufgerufen, `deliver: true`): erstellt die Übersicht
  UND stellt sie zu (E-Mail und/oder Chat-Nachricht).

Dann docken alle an dieselbe Funktion an:
- `useMorningSummary` (Frontend) → ruft künftig die Edge Function auf statt
  eigener Logik (oder bleibt vorerst parallel; siehe Migrationsschritt).
- Max-Tool `get_morning_summary` → ruft die Edge Function im Abruf-Modus.
- Cron → ruft sie im Proaktiv-Modus.

---

## 4. BAUSTEINE (konkrete Umsetzungsschritte für morgen)

### Baustein A — Edge Function `morning-summary`
- Neue Datei `supabase/functions/morning-summary/index.ts`.
- Portiert die 6 Abfragen + Formatierung aus `useMorningSummary.ts`
  (1:1 dieselben Filter/Fenster, damit die Übersicht identisch ist).
- Rückgabe: `{ summary_markdown, sections: {...}, hasData }`.
- Betriebsart über Body: `{ deliver?: boolean, channel?: 'email'|'chat'|'both' }`.
- Sicherheit: Standard = nur Abruf (deliver=false). Senden nur bei deliver=true.

### Baustein B — Max-Tool `get_morning_summary`
- In `chat-assistant/index.ts`: Tool-Definition + Dispatcher + execute-Funktion,
  die die Edge Function `morning-summary` im Abruf-Modus aufruft und das
  Ergebnis zurückgibt.
- Prompt-Regel: bei Fragen wie "Was steht heute an?", "Tagesübersicht",
  "Guten Morgen" nutzt Max dieses Tool.

### Baustein C — Einstellungen (system_settings key `morning_summary_settings`)
Analog zu `max_control_settings`. Felder:
```json
{
  "enabled": false,          // proaktive Zustellung an/aus (Not-Aus, Standard aus)
  "time": "06:30",           // wann der Cron läuft
  "channel": "email",        // email | chat | both
  "email_to": "uli.berresheim@hotmail.de",
  "include": {               // welche Abschnitte in die Übersicht
    "guest_contact": true,
    "ratings": true,
    "open_linen": true,
    "upcoming_bookings": true,
    "cleanings": true,
    "confirmed_deliveries": true
  }
}
```
Einstellungskarte im Dashboard (analog zu den Max-Reminder-Karten).

### Baustein D — Zustellung
- **E-Mail:** ruft `send-guest-email` mit `recipients=[{email: email_to}]`,
  `subjectTemplate="Guten Morgen – deine Tagesübersicht"`, `bodyTemplate=summary`.
  (Prüfen: send-guest-email erwartet Gäste-Felder; ggf. kleine Anpassung, damit
  eine reine Text-Mail ohne Gast-Platzhalter sauber durchläuft.)
- **Chat:** schreibt die Zusammenfassung als Nachricht, die beim App-Öffnen
  bereitliegt (Mechanismus noch festzulegen — evtl. eigene Tabelle
  `assistant_messages` oder Wiederverwendung eines vorhandenen Kanals).

### Baustein E — Cron-Job
Im SQL-Editor, analog zu `max-cleaning-reminders-daily`:
```sql
select cron.schedule(
  'morning-summary-daily',
  '30 6 * * *',   -- 06:30 täglich
  $$ select net.http_post(
       url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/morning-summary',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>"}'::jsonb,
       body := '{"deliver": true, "channel": "email"}'::jsonb
     ); $$
);
```
Erst einrichten, wenn getestet und `enabled=true`.

---

## 5. SICHERHEIT / VORSICHT (wie bei den Reminder-Funktionen)
- Proaktive Zustellung standardmäßig AUS (`enabled=false`).
- Abruf-Modus sendet nie etwas.
- Erst Testlauf (deliver=false → nur Anzeige), dann scharf schalten.
- Keine Gästedaten in Logs.

---

## 6. UMSETZUNGS-REIHENFOLGE FÜR MORGEN
1. **Baustein A** (Edge Function) bauen — Logik aus useMorningSummary portieren.
2. Testlauf im Abruf-Modus (deliver=false) → prüfen, ob die Übersicht stimmt.
3. **Baustein B** (Max-Tool) — Max kann die Übersicht auf Anfrage liefern (Ebene 1
   erreicht). Testen: "Max, was steht heute an?"
4. **Baustein C** (Einstellungen + Karte).
5. **Baustein D** (Zustellung) — erst E-Mail, im Testlauf an Uli.
6. **Baustein E** (Cron) — zuletzt, wenn alles getestet ist, dann enabled=true
   (Ebene 2 erreicht).

Schritt 1–3 bringen schon den Kernnutzen (Max liefert die volle Übersicht auf
Anfrage). Schritt 4–6 machen ihn proaktiv. Man kann nach Schritt 3 pausieren.

---

## 7. OFFENE ENTSCHEIDUNGEN (morgen kurz klären)
- **Zustellkanal:** E-Mail, In-App-Chat, oder beides? (Empfehlung: erst E-Mail,
  das ist am einfachsten und erreicht Uli auch ohne App.)
- **Uhrzeit:** 06:30? (nicht mit 07:00 Amela-Reminder / 07:30 Teuni kollidieren)
- **Frontend-Hook:** useMorningSummary später auf die Edge Function umstellen
  (eine Quelle), oder vorerst parallel lassen? (Empfehlung: erst parallel,
  Umstellung als separater sauberer Schritt.)
- **Chat-Zustellung:** braucht einen Kanal/Tabelle — nur bauen, wenn Kanal
  gewünscht ist. Für den Start reicht E-Mail.
