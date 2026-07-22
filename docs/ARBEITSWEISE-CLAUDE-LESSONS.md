# Arbeitsweise für Claude — verbindliche Lessons Learned

> **Zweck:** Diese Datei existiert, weil eine Arbeitssitzung schlecht lief
> (15.06.2026). Sie hält fest, **was schiefging** und **welche Schritte
> verbindlich** sind, damit es sich nicht wiederholt. Sie ergänzt `AGENTS.md`,
> `CODE-INDEX.md` und `CODING-GUIDE.md` — ersetzt sie nicht.
>
> **Claude liest diese Datei zuerst, zusammen mit `AGENTS.md` und
> `CODE-INDEX.md`, BEVOR es irgendeine Aussage über den Code trifft.**

---

## 0. Die eine Grundregel

**Erst verstehen, dann reden, dann schreiben.** Keine Diagnose, kein Auftrag,
kein Prompt, bevor der **tatsächliche aktuelle Code** der betroffenen Dateien
gelesen wurde. Nicht aus dem Gedächtnis, nicht aus einer früheren Antwort, nicht
aus einem Konzeptdokument — aus dem echten, aktuellen Stand im Repo.

---

## 1. Was am 15.06.2026 schiefging (echte Fehler, nicht beschönigt)

1. **Index nicht zuerst gelesen.** Sofort im Code gewühlt statt `CODE-INDEX.md`
   zu nutzen → bei der falschen Datei `ConnectedBookingView.tsx` (Tab
   „Buchungen") gelandet, obwohl das Problem im Tab „Übersicht"
   (`OverviewTab.tsx` ← `OriginalDashboard.tsx`) lag.
2. **Doppelgänger-Falle ignoriert.** Der Index warnt ausdrücklich: die
   „Reinigungskarte" existiert DREIMAL. Genau diese Warnung wurde übergangen.
3. **Auftrag vor Analyse geschrieben.** Ein fertiger „Lovable-Auftrag" wurde
   erstellt, bevor der Datenfluss (Query → Props → Karte) verstanden war.
4. **Datenquelle nicht geprüft.** Kernregel „fehlendes Feld = zuerst Query/Props
   prüfen" missachtet. Die wahre Ursache (Query lädt `bookings`-Relation nicht)
   wurde erst nach mehreren Schleifen gefunden.
5. **Prompts auf veralteten Zeilennummern.** Mehrfach Prompts gebaut, ohne den
   Ist-Zustand frisch zu lesen → Lovable änderte das Falsche / ließ Teile aus.
6. **Annahmen statt Verifikation.** Felder/Verknüpfungen behauptet, ohne sie im
   Schema/Code zu belegen (z. B. ob `bookings` ein `status_changed_by` hat).

Gemeinsamer Nenner: **Reden vor Lesen.** Jeder einzelne Fehler wäre durch
„zuerst die richtige Datei im Ist-Zustand lesen" vermieden worden.

---

## 2. Pflicht-Reihenfolge VOR jeder Aussage/Änderung

Diese Schritte sind **nicht optional** und werden **in dieser Reihenfolge**
ausgeführt:

1. **Regeln laden.** `AGENTS.md` + `CODE-INDEX.md` + diese Datei lesen.
2. **Tab bestimmen.** „Welcher Tab?“ — nie „welche Route?“. Bei UI-Themen:
   den Screenshot/Tab eindeutig dem Einstiegspunkt zuordnen
   (`CODE-INDEX.md` Abschnitt 2).
3. **Doppelgänger ausschließen.** `CODE-INDEX.md` Abschnitt 3 prüfen. Wenn eine
   Komponente mehrfach existiert (Reinigungskarte, Wäschekarte, Dashboard …):
   **explizit benennen, welche gemeint ist und welche NICHT.**
4. **Kette folgen.** Vom Tab-Einstieg den Imports/Props bis zur konkreten Datei
   folgen — inklusive der Frage „woher kommen die Daten?“ (Query in welcher
   Datei?).
5. **Ist-Zustand frisch lesen.** Die betroffene(n) Datei(en) im aktuellen Stand
   ganz lesen (GitHub `main` / Repo). Bei Daten-Bugs zusätzlich die Query lesen.
6. **Datenquelle vor UI.** Fehlt ein Feld in der Anzeige: zuerst prüfen, ob die
   Query/Props es überhaupt laden. Erst dann die Karte ansehen.
7. **Erst jetzt** diagnostizieren, Plan vorschlagen oder Prompt schreiben.

> Wenn einer dieser Schritte übersprungen wird, ist die Antwort potenziell
> falsch. Im Zweifel: Schritt nachholen statt raten.

---

## 3. Regeln für Lovable-Prompts (damit sie sicher umgesetzt werden)

> **Geltungsbereich (Stand 18.07.2026):** Dieser Abschnitt gilt **nur noch für
> `web-takeover-buddy` / `steinbockchalets.com`** — das einzige Projekt, das
> weiterhin über Lovable entwickelt und deployt wird. Die vier
> selfhosted-Repos werden über den GitHub-Browser-Editor bearbeitet; dort
> gelten stattdessen die Liefervorgaben aus `AGENTS.md` (vollständige,
> hochladefertige Dateien statt Prompts). Siehe Abschnitt 6.3.

- **Immer am frisch gelesenen Ist-Zustand orientieren.** Keine Zeilennummern aus
  dem Gedächtnis. Wenn Zeilen genannt werden, vorher verifizieren.
- **Ziel beschreiben, nicht nur Zeilen.** Lovable bricht an starren
  Zeilenangaben; robuster ist „ersetze den Block, der mit X beginnt, durch Y“.
- **Genau eine Quelle der Wahrheit pro Verhalten.** Nicht zwei Wege anbieten
  („Prop ODER Fallback“) — Lovable wählt sonst den falschen. Den gewollten Weg
  eindeutig vorgeben.
- **Doppelgänger im Prompt benennen.** Immer dazuschreiben, welche Datei NICHT
  gemeint ist.
- **Nichts erfinden lassen.** Existiert ein Feld nicht (z. B. `status_changed_by`
  in `bookings`), Lovable anweisen zu prüfen und wegzulassen statt zu erfinden.
- **Abschluss-Pflichten in jeden Prompt:** Build grün, keine ungenutzten
  Imports, kein `console.log`, `CODE-INDEX.md` im selben Commit pflegen.

---

## 4. Verbindlicher Selbst-Check vor dem Absenden einer Antwort

Claude beantwortet diese Fragen für sich, bevor es eine Code-Aussage oder einen
Prompt herausgibt. Wenn eine Antwort „nein/unklar“ ist → zurück zu Abschnitt 2.

- [ ] Habe ich `CODE-INDEX.md` benutzt und den **richtigen Tab/Datei** bestimmt?
- [ ] Habe ich geprüft, ob es **Doppelgänger** gibt, und benannt, welche gemeint
      ist?
- [ ] Habe ich den **aktuellen Code** der Datei(en) frisch gelesen (nicht aus
      Erinnerung)?
- [ ] Bei fehlendem Feld: Habe ich die **Query/Props** geprüft, nicht nur die UI?
- [ ] Behaupte ich nur, was ich im Code/Schema **belegt** habe?
- [ ] Enthält mein Prompt **keine** ungeprüften Zeilennummern und **keine**
      „A oder B“-Wege?

---

## 5. Tonregeln

- Unsicherheit offen benennen statt überzeugt zu raten („ich muss erst prüfen“).
- Keine voreiligen „fertig/funktioniert“-Aussagen ohne Beleg.
- Wenn ein früherer Schritt falsch war: benennen, korrigieren, weiter — ohne
  Beschönigung.

---

## 6. Lessons aus der Sitzung 18.07.2026 (Website-Kalender, iCal-Kollisionen)

### 6.1 Leeres Ergebnis ohne Fehler = zuerst Policy-Verdacht

**Symptom:** Der Verfügbarkeitskalender auf `steinbockchalets.com` zeigte
„Aktuell keine bestätigten Buchungen" — obwohl 20 bestätigte Buchungen in der
Datenbank standen. Keine Fehlermeldung, kein roter Alert, HTTP 200.

**Ursache:** Auf `bookings` existierte nur die Policy `bookings_auth_all` für
die Rolle `{authenticated}`. Die Website liest anonym, ist also Rolle `anon`,
fällt durch kein Policy-Raster.

**Die eigentliche Lehre:** **Supabase gibt bei RLS-Blockade kein Fehlerobjekt
zurück, sondern ein leeres Array.** Aus Sicht des Frontends ist „darfst du
nicht" ununterscheidbar von „gibt es nicht".

**Regel:** Ein leeres Ergebnis ohne Fehlermeldung ist **zuerst ein
Berechtigungsverdacht, nicht ein Datenverdacht.** Prüfreihenfolge:

1. `select count(*) from <tabelle>;` im SQL-Editor — sind überhaupt Daten da?
2. `select policyname, roles, cmd from pg_policies where tablename = '<tabelle>';`
   — gibt es eine Policy für die aufrufende Rolle?
3. Erst danach die Filterlogik im Frontend prüfen.

**Ergänzende Falle:** Auch der SQL-Editor läuft in einem RLS-Kontext. Eine
`group by`-Abfrage lieferte „no rows returned", während `select count(*)` auf
derselben Tabelle 120 ergab. **Ein leeres Ergebnis im SQL-Editor ist kein
Beweis für eine leere Tabelle.** Immer mit einer zweiten, anders formulierten
Abfrage gegenprüfen (bestehendes Prinzip „No rows returned ist normal", hier
auch für SELECT gültig).

**Lösung im konkreten Fall:** Statt `anon`-Policy auf `bookings` (würde
Gastnamen, E-Mails und Preise öffentlich lesbar machen) eine View mit nur den
nötigen Spalten:

```sql
create or replace view public.public_availability
with (security_invoker = off) as
select house_id, check_in, check_out, status
from public.bookings
where status in ('confirmed', 'checked_in');

grant select on public.public_availability to anon;
```

`cancelled` bleibt draußen (darf nicht blockieren), `completed` ebenfalls (nur
Vergangenheit, der Kalender graut sie ohnehin aus).

---

### 6.2 String-Vergleich von `date` gegen `timestamptz`

**Symptom:** Der iCal-Sync meldete dauerhaft „7 Kollision(en) erkannt" —
sämtliche eigenen Airbnb-Buchungen.

**Zwei Ursachen, beide in einer Zeile (`ical-sync/index.ts`):**

```javascript
ev.start < b.check_out && ev.end > b.check_in
```

**(a) Datentyp-Mismatch.** `external_blocks.start_date` ist `date`
(`"2027-01-05"`), `bookings.check_out` ist `timestamptz`
(`"2027-01-05T09:00:00+00"`). In JavaScript gilt
`"2027-01-05" < "2027-01-05T09:00:00+00"` → **true**, weil der kürzere String
ein Präfix des längeren ist. Ein Gästewechsel (Abreise 09:00, neuer Block ab
demselben Tag) wurde als Überlappung gewertet.

**(b) Rückkopplung.** Der eigene `ical-export` ist bei Airbnb/VRBO als externer
Kalender hinterlegt. Die Portale melden dieselben Zeiträume zurück. Der
Abgleich sah `external_block` gegen `booking` mit identischem Zeitraum und
meldete Kollision — obwohl es dieselbe Buchung war.

**Regel:** **Beim Vergleich von Spalten unterschiedlichen Typs immer beide
Seiten auf dasselbe Format bringen** (`String(v).slice(0, 10)` für
tagesgenauen Vergleich). Und: **Bei bidirektionalen Schnittstellen prüfen, ob
das eigene System seine eigenen Daten zurückgespiegelt bekommt.**

**Warum das mehr als ein Schönheitsfehler war:** Sieben Dauerfehlalarme
bedeuten, dass eine echte Doppelbuchung im Rauschen untergeht. Eine Warnung,
die immer feuert, ist schlechter als keine Warnung — sie erzeugt
Alarmmüdigkeit und wiegt in falscher Sicherheit.

**Vorgehen beim Fix:** Die korrigierte Logik wurde vor dem Deploy gegen alle
sieben realen Fälle **und** gegen vier konstruierte echte Doppelbuchungen
getestet (voll überlappend, teilweise vorne, teilweise hinten, ein Tag
mittendrin). Erst als alle sieben verschwanden und alle vier weiterhin
erkannt wurden, ging der Code raus. **Ein Filter-Fix braucht immer beide
Testrichtungen: Verschwindet das Rauschen? Bleibt das Signal?**

---

### 6.3 Deploy-Pfad prüfen, bevor „hochgeladen" mit „live" verwechselt wird

**Symptom:** Die korrigierte `AvailabilityCalendar.tsx` lag im GitHub-Repo
`web-takeover-buddy`, die Live-Seite änderte sich nicht.

**Ursache:** `web-takeover-buddy` hat **keine GitHub-Verbindung**. Der einzige
Git-Remote zeigt auf Lovables internen Storage. Das GitHub-Repo ist eine tote
Kopie. Deployt wird ausschließlich über **Lovable Publish** (Hosting:
Cloudflare, erkennbar am Response-Header `Server: cloudflare` +
`X-Deployment-Id`, kein `x-vercel-id`).

**Regel:** **Die Notiz „Lovable wird nicht mehr genutzt" gilt nur für die vier
selfhosted-Repos** (`hausmanagement-selfhosted`, `amela-clean-hub-selfhosted`,
`fresh-spin-portal-selfhosted`, `smartfox-insight-ai-selfhosted`). Für
`web-takeover-buddy` / `steinbockchalets.com` gilt sie **nicht**.

**Zusatzbefund — Datenbank:** Die Website-DB `xcohqbdgzprkixeycdhk` ist eine
**Lovable-Cloud-Instanz**, kein normales Supabase-Projekt. Es gibt dafür
**kein Supabase-Dashboard**, weder im eigenen Konto noch in einem anderen —
deshalb war sie nie auffindbar. Zugriff nur über die Lovable-Oberfläche. Das
betrifft `houses` (Marketing-Variante), `gallery_images`, `promotions`,
`reviews`, `seasons`, `categories`, `booking_inquiries`.

**Konsequenz für die Praxis:** Bevor eine Änderung an der Website als erledigt
gilt, muss geprüft werden, **über welchen Weg sie live geht**. Ein Commit
allein ändert dort nichts.

---

### 6.4 Kopplung Website ↔ Hausverwaltung (Ist-Stand 18.07.2026)

Die Verbindung ist **minimal** — nur zwei Berührungspunkte im gesamten
Website-Code:

| Richtung | Datei | Tabelle (Hausverwaltung) | Zweck |
|---|---|---|---|
| Lesen | `AvailabilityCalendar.tsx` | `public_availability` (View) | Belegte Tage |
| Schreiben | `BookingForm.tsx` | `booking_inquiries` | Anfrage weiterreichen |

Alles Übrige liegt in der Lovable Cloud.

**Zwei offene Punkte, die sich daraus ergeben:**

1. **`houses` existiert in beiden Datenbanken** — Doppelgänger über
   Systemgrenzen hinweg, verbunden nur über `houses.external_house_id`.
2. **Preise sind dupliziert.** `BookingForm.tsx` rechnet mit
   `house.price_winter ?? 450` / `price_summer ?? 380` /
   `price_offseason ?? 320` aus der Website-eigenen `houses`-Tabelle. Die
   Pricing-Infrastruktur der Hausverwaltung (`pricing-engine`,
   `daily-pricing`, `expand-daily-prices`) wird **nicht** genutzt. Ein Gast
   sieht auf der Website möglicherweise einen anderen Preis als den
   berechneten.

---

### 6.5 Stille Fehlerbehandlung ist ein Datenverlust-Risiko

In `BookingForm.tsx` wurde ein fehlgeschlagener Insert in die
Hausverwaltungs-DB nur mit `console.warn` protokolliert; der Gast sah
trotzdem die normale Erfolgsmeldung. Die Anfrage wäre nie angekommen, ohne
dass es jemand merkt.

**Regel:** **Eine Erfolgsmeldung an den Nutzer darf nie ausgegeben werden,
wenn ein Teilschritt fehlgeschlagen ist** — auch dann nicht, wenn der
Hauptschritt geklappt hat. Entweder der Nutzer erfährt es, oder es gibt eine
Benachrichtigung an den Betreiber. Ein `console.warn` ist beides nicht.

Verwandt mit dem bestehenden Prinzip „Deployed ist nicht Verified", hier als
**„Erfolgsmeldung ist nicht Erfolg"**.

---

## 7. Lessons aus der Sitzung 18./19.07.2026 (iCal-Sync, Kalender-Abgleich)

### 7.1 Upsert ohne Aufräumen ist unvollständig

**Symptom:** Uli gab bei Booking.com einen 183-Nächte-Zeitraum frei. Booking.com
meldete ihn nicht mehr (`last_event_count` fiel von 12 auf 6). Der Block blieb
trotzdem in `external_blocks` stehen und wurde weiter als Belegung angezeigt und
ausgewertet.

**Ursache:** `ical-sync` machte ausschließlich Upserts. Es gab **kein einziges
`delete`** in der ganzen Function. Das Feld `last_seen_at` wurde zwar bei jedem
Lauf geschrieben — aber nie ausgewertet.

**Die allgemeine Lehre:** Wer externe Daten periodisch einliest, muss auch
behandeln, **was nicht mehr geliefert wird.** Ein Upsert allein bildet nur
Hinzufügen und Ändern ab, nicht Entfernen. Das betrifft jede stornierte
Portal-Buchung und jede zurückgenommene Sperre — der Bestand wächst still an
Karteileichen, und darauf aufbauende Auswertungen rechnen mit Belegungen, die es
nicht mehr gibt.

**Sicherheitsbedingungen beim Löschen** (beide sind nötig):

1. **Nur nach erfolgreichem Abruf.** Bei einem Feed-Fehler wird die Schleife per
   `continue` verlassen, die Löschstelle also gar nicht erreicht. Sonst wäre bei
   einer kurzen Störung bei Booking.com der komplette Bestand weg.
2. **Nur bei nicht-leerem Ergebnis** (`events.length > 0`). Ein leerer Feed ist
   entweder ein Portal-Fehler oder ein wirklich leerer Kalender — in beiden
   Fällen ist Nichtstun die sichere Wahl.

**Muster:** Zeitstempel VOR dem Verarbeiten merken, danach alles löschen, was
älter ist:

```javascript
const laufBeginn = new Date().toISOString();
// ... Events verarbeiten (setzen last_seen_at bzw. Spalten-Default now())
if (!dryRun && events.length > 0) {
  await supabase.from('external_blocks').delete()
    .eq('house_id', feed.house_id).eq('platform', feed.platform)
    .lt('last_seen_at', laufBeginn);
}
```

**Wie es gefunden wurde:** Nur weil Uli die Freigabe im Portal machte *und
danach nachsah, ob sie ankommt.* Ohne diese Gegenprobe wäre der Fehler
unbemerkt geblieben — die Function meldete durchgehend `status: ok`.

---

### 7.2 Herkunft schlägt Datumsvergleich

**Symptom:** Nach dem Datentyp-Fix (Abschnitt 6.2) meldete der Sync weiterhin
zwei Dauerkollisionen — beide Booking.com gegen Booking.com-Buchungen.

**Warum der Datumsvergleich nicht reichte:** Der Fix vom 18.07. prüfte auf
*exakte* Datumsgleichheit. Die traf hier nicht zu:

| Fall | Portal-Block | Eigene Buchung |
|---|---|---|
| Kerscher | 25.12.–05.01. | 25.12.–29.12. |
| Kaloyan | 22.01.–31.01. | 21.01. 23:00 UTC – 30.01. 23:00 UTC |

Booking.com fasst aufeinanderfolgende Buchungen zu **einem** Block zusammen
(Kerscher + Fischer) und meldet teils breitere Sperrzeiträume als die Buchung
lang ist. Zeitzonen verschieben zusätzlich.

**Die bessere Prüfung ist inhaltlich, nicht rechnerisch:**

```javascript
if (b.platform && b.platform === feed.platform) return false;
```

Stammt der Block von derselben Plattform wie die Buchung, ist es dieselbe
Buchung. Booking.com kann nur Booking.com-Buchungen melden, Airbnb nur
Airbnb-Buchungen. **Eine echte Doppelbuchung entsteht immer zwischen
verschiedenen Kanälen** — nie innerhalb eines Portals, denn kein Portal vergibt
denselben Zeitraum zweimal.

**Verallgemeinert:** Wenn ein Datums- oder Zahlenvergleich immer neue Sonderfälle
produziert, lohnt die Frage, ob es ein **fachliches** Unterscheidungsmerkmal
gibt. Das ist meist robuster als eine weitere Toleranzregel.

---

### 7.3 Schnittstelle prüfen, nicht raten — die Mail kam nie an

**Symptom:** Der Sync meldete im Toast „Details in der Morgen-Übersicht **und
per E-Mail**". Es kam nie eine E-Mail.

**Ursache:** Der Aufruf übergab die naheliegenden Feldnamen:

```javascript
body: { to: ..., subject: ..., body: ... }        // FALSCH
```

`send-guest-email` erwartet aber:

```javascript
body: { recipients: [{ email: ... }], subjectTemplate: ..., bodyTemplate: ... }
```

Bei falschen Namen antwortet die Function mit **HTTP 400** — die Mail geht nie
raus. Der Fehler wurde zwar per `console.error` protokolliert, aber nur in die
Edge-Function-Logs, die im Alltag niemand liest.

**Zwei Lehren:**

1. **Vor dem Aufruf einer fremden Function deren Signatur lesen.** Die
   naheliegenden Namen (`to`, `subject`, `body`) waren falsch. Ein Blick in
   `send-guest-email/index.ts` hätte es sofort gezeigt.
2. **Ein `console.error` ist keine Fehlerbehandlung.** Wenn ein Fehlschlag nur
   im Log landet und die Oberfläche weiter Erfolg meldet, ist der Fehler
   unsichtbar. Verwandt mit „Erfolgsmeldung ist nicht Erfolg" (6.5).

**Prüfmuster für die Zukunft:** Alle Aufrufer einer Function auf einmal
kontrollieren — der Doppelgänger existiert auch bei Schnittstellen:

```bash
grep -rn -A 5 "invoke('send-guest-email'" supabase/functions/ src/
```

Das förderte zutage, dass `morning-summary` und `MailPreviewProvider` es richtig
machten, `ical-sync` aber nicht.

---

### 7.4 Wiederholte Meldungen brauchen eine Merk-Logik

Beim Kalender-Abgleich stellte sich die Frage, wie oft eine E-Mail bei einem
offenen Befund verschickt wird. Eine fehlende Buchung bleibt bestehen, bis Uli
sie nachträgt — das kann Tage dauern.

**Ohne Merk-Logik käme jeden Morgen dieselbe Mail.** Nach der dritten würde sie
ignoriert, und genau dann geht die nächste, wirklich neue unter. Dasselbe Muster
wie bei den Dauerkollisionen (6.2): Eine Warnung, die immer feuert, ist
schlechter als keine.

**Umsetzung:** Tabelle `kalender_abgleich_meldungen`, Schlüssel ist der Befund
selbst (Haus + Art + Plattform + Zeitraum). Verschiebt sich der Zeitraum, ist es
ein neuer Befund und wird erneut gemeldet — richtig so, denn dahinter steckt
dann eine andere Belegung.

**Zwei Details, die leicht übersehen werden:**

- **Erst nach erfolgreichem Versand merken.** Schlägt die Mail fehl, wird beim
  nächsten Lauf erneut versucht. Besser eine Mail zu viel als eine fehlende
  Buchung, von der niemand erfährt.
- **`coalesce` im Unique-Index.** Bei `feed_fehler` sind von/bis NULL, und NULL
  ist in Postgres nicht mit sich selbst gleich — ohne `coalesce` würde jeder
  Feed-Fehler als neuer Befund gelten.

Die Morgen-Übersicht zeigt weiterhin **alle** offenen Befunde. Nur die Mail ist
einmalig.

---

### 7.5 Warum die Kollisionsprüfung die falsche Frage stellte

Wert für künftige Konzepte, nicht nur für iCal:

Die ursprüngliche Kollisionswarnung (Phase 1) wurde gegen die Gefahr „zwei
Buchungen für denselben Zeitraum" gebaut. Im Betrieb stellte sich heraus:

- **Alle** gemeldeten Kollisionen waren Rückspiegelungen — Fälle, in denen alles
  korrekt war.
- Der eine reale Fehler (Cathrin Clausnitzer, Booking.com-Buchung fehlte im
  System) wurde **nicht** gemeldet, weil „Block ohne Buchung" für die Logik der
  Normalfall ist.

**Das System meldete die Fälle, in denen alles stimmt, und schwieg bei dem, in
dem etwas fehlte.** Genau verkehrt herum.

**Die Lehre:** Bei einem Wächter zuerst fragen, *welcher reale Schaden* verhindert
werden soll — nicht, welche Auffälligkeit sich am leichtesten berechnen lässt.
Hier war der teure Fall die fehlende Buchung (kein Gästekontakt, keine Reinigung,
keine Wäsche, Zeitraum könnte doppelt vergeben werden), nicht die Überschneidung.

---

## 8. Lessons aus der Sitzung 21.07.2026 (Portal-Links, Reinigung ohne Buchung)

### 8.1 Der Wächter prüfte den Normalfall und schwieg beim Sonderfall

**Symptom:** Reinigungen ohne Buchung (Generalreinigung, Fensterreinigung)
standen auf „Geplant", ohne dass der Dienstleister je gefragt wurde, ob der
Termin passt. Keine Fehlermeldung — der Cron meldete durchgehend Erfolg.

**Ursache:** In `max-cleaning-reminders/index.ts` stand

```javascript
if (!booking || booking.status !== 'confirmed') continue;
```

Die Bedingung sollte stornierte Buchungen aussortieren. Sie sortierte aber auch
jede Reinigung aus, zu der es gar keine Buchung gibt — die Terminfrage entfiel,
`max_actions` bekam keinen Vorgang, die 24-h-Eskalation lief nie an.

**Die Lehre:** **Eine Prüfung auf „X muss gültig sein" schließt still alle Fälle
aus, in denen es X gar nicht gibt.** Richtig ist „falls X existiert, muss es
gültig sein":

```javascript
const hasBooking = !!task.booking_id;
if (hasBooking && (!booking || booking.status !== 'confirmed')) continue;
```

Verwandt mit Abschnitt 7.5: Auch hier meldete das System brav die Fälle, in denen
alles seinen gewohnten Gang ging, und schwieg bei dem, der Aufmerksamkeit
gebraucht hätte.

### 8.2 Ein Ersatztext ist keine Antwort auf „gibt es nicht"

Der Wäsche-Hinweis in der Nachricht war mit
`'Zur Wäsche liegt mir aktuell keine Info vor.'` vorbelegt. Bei einer
Generalreinigung gibt es **prinzipiell** keine Wäschelieferung — der Satz hätte
dort einen Mangel suggeriert, wo keiner ist.

**Regel:** Zwischen „Wert fehlt" und „Wert kann es hier nicht geben"
unterscheiden. Im zweiten Fall den Satz **weglassen**, nicht durch eine
Ersatzformulierung ersetzen.

### 8.3 Ein Feld nutzen heißt prüfen, ob die Query es lädt

Der neue Nachrichtentext sollte den Anlass aus `service_tasks.notes` ziehen.
`notes` stand nicht in der `.select`-Liste — `task.notes` wäre stumm `undefined`
geblieben, ohne Fehler, und die Klammer im Text wäre leer geblieben.

Das ist die bekannte Regel aus `AGENTS.md` („fehlt ein Feld: zuerst die Query
prüfen"), hier in der Schreibrichtung: **Wer ein Feld neu verwendet, muss es
auch neu anfordern.**

### 8.4 Testdaten nicht im selben Schritt löschen wie anlegen

Beim Verifizieren wurde die Testreinigung zusammen mit der Anlege-Anweisung
gelöscht. Der anschließende Testlauf fand nichts, und der Verdacht fiel
zunächst auf den Code. **Aufräum-SQL erst ausgeben, wenn der Beleg vorliegt.**

### 8.5 Deployment-Domains gehören nicht in Datensätze

Die Portal-Links der Dienstleister stehen in `service_providers.portal_token` als
vollständige URL. Nach dem Wechsel auf Vercel zeigten sie weiter auf die alten
Adressen — es gibt keinen Code, der sie ableitet, und keine Prüfung, ob sie
erreichbar sind.

**Regel für die Zukunft:** Hosting-abhängige Adressen an **einer** Stelle
konfigurieren (Basis-URL) und den Rest ableiten. Sonst kostet jeder
Hosting-Wechsel eine stille Nachpflege in Datensätzen, die niemandem auffällt,
bis ein Dienstleister auf einen toten Link klickt.

## 9. Lessons aus der Sitzung 22.07.2026 (Notiz-Speicherung, Gemini-Budget, Tools ohne Ablauf)

### 9.1 Ein Direkt-Update ohne Hook sieht aus wie „nicht gespeichert"

Im Boris-Portal ließen sich Notizen scheinbar nicht speichern: Text eingeben,
speichern, grüner Erfolgshinweis — beim nächsten Öffnen stand wieder der alte
Text da. Der Verdacht fiel auf RLS, dann auf einen Trigger. Beides falsch.

Der Wert **wurde die ganze Zeit korrekt in die Datenbank geschrieben.**
`handleNotesUpdate` war der einzige Handler in `CleaningPortal.tsx` ohne
`await forceRefresh()` — Status, Termin und Personal laufen über `useBookings`
und aktualisieren dort den lokalen State. Die Notiz umging den Hook und schrieb
direkt gegen die Tabelle. `combinedEntries` behielt den alten Wert, und
`CleaningActionTiles` initialisiert sein Textfeld beim Öffnen aus dem Prop.

**Regel:** Wer an einer Tabelle vorbei am Hook schreibt, muss den Refresh selbst
auslösen. Und: Bei „wird nicht gespeichert" zuerst prüfen, ob es ein
Anzeige- statt ein Schreibproblem ist — ein SELECT auf den Datensatz kostet
zehn Sekunden und spart die Suche in der falschen Richtung.

Derselbe Fehler steckte unverändert im Amela-Portal (`amela-clean-hub-selfhosted`),
weil Boris daraus kopiert wurde. **Doppelgänger-Prinzip: Nach jedem Fund im
kopierten Portal aktiv im Original nachsehen — und umgekehrt.**

### 9.2 `.select()` gehört an jedes Supabase-UPDATE

`update(...).eq('id', ...)` ohne `.select()` liefert `error === null`, **auch
wenn null Zeilen betroffen waren** — etwa weil RLS blockiert oder die ID nicht
existiert. Der Erfolgshinweis im Portal war deshalb keine Aussage über den
Datenbankzustand, sondern nur darüber, dass die Anfrage angekommen ist.

**Regel:** Jedes schreibende Supabase-Kommando bekommt `.select()` und eine
Prüfung auf `data.length === 0`. Ohne das meldet ein stiller Fehlschlag Erfolg.

### 9.3 HTTP 429 von Gemini hat zwei völlig verschiedene Ursachen

Max meldete „Zu viele Anfragen. Bitte warte einen Moment." Warten half nicht —
im Log stand der wahre Grund: `Your prepayment credits are depleted`. Das
Guthaben war leer, nicht die Rate begrenzt.

Zwei Fehler wirkten zusammen:

1. `useChat.ts` warf bei 429 das geparste `errorData` weg und zeigte pauschal
   den Warte-Text. Die Ursache kam nie an der Oberfläche an.
2. Die Edge Function versuchte bei jedem 429 einen Retry nach 2 Sekunden. Bei
   leerem Guthaben ist der zweite Versuch garantiert ebenfalls 429 — reine
   Verzögerung plus ein zusätzlicher API-Aufruf.

Beides ist behoben: Die Function unterscheidet über den Meldungstext
(`credits are depleted`, `quota exceeded`, `resource_exhausted`) und reicht ein
Feld `reason` mit; das Frontend zeigt die echte Meldung.

**Regel:** Ein HTTP-Status ist eine Kategorie, keine Diagnose. Wo ein Anbieter
mehrere Fälle unter denselben Code legt, muss der Meldungstext ausgewertet
werden — und er gehört ungefiltert bis zum Nutzer durchgereicht.

### 9.4 Die Selbstprüfung schaute nur in eine Richtung

`max-ablaeufe-pruefen` fragte seit jeher: „Gibt es den Baustein, den dieser
Ablauf nennt?" Die Gegenfrage — „Gibt es zu diesem Werkzeug einen Ablauf?" —
wurde zwar **berechnet** (`tools_ohne_ablauf`), landete aber nur im Log und im
JSON-Response. In die Morgen-Übersicht gehen ausschließlich Zeilen mit
`geprueft_status = 'fehler'`.

Der Befund am 22.07.2026: 15 von 30 Werkzeugen kamen in keinem Ablauf vor.
Darunter `save_knowledge` — Max schreibt damit in `assistant_knowledge`, was zur
Laufzeit in seinen System-Prompt geladen wird. Er verändert also seine eigene
Arbeitsgrundlage, und dafür gab es keine SOLL-Definition.

Beim Sichtbarmachen war die Trennung entscheidend: Elf der fünfzehn sind reine
Lesewerkzeuge (`get_*`, `search_*`), die zu Recht keinen Ablauf haben. Würden
sie täglich gemeldet, entstünde genau der Dauerfehlalarm, den Abschnitt 7.4
beschreibt. Gemeldet wird deshalb nur, was **schreibt**.

**Regel:** Eine Prüfung, die etwas berechnet, es aber nicht dorthin bringt, wo
jemand hinsieht, ist keine Prüfung. Und: Was gemeldet wird, muss handlungsrelevant
sein — sonst trainiert man sich das Wegklicken an.

Die Liste der schreibenden Werkzeuge ist **Handarbeit** und veraltet damit
prinzipiell. Bewusst in Kauf genommen, weil beide Automatiken danebenlagen:
Namenspräfixe (`draft_guest_welcome_email` schreibt nichts) ebenso wie eine
Code-Analyse auf `.insert`/`.update` (`update_provider_action` schreibt über
einen Helfer). Ausfallmodus ist eine **verpasste Warnung, kein Fehlalarm** —
das ist die verträglichere Richtung. Bei neuen Werkzeugen gehört der Name in
`SCHREIBENDE_TOOLS` ergänzt.

### 9.5 Der Code war providerneutral, nur die Beschreibung nicht

`max_ablaeufe` sprach durchgehend von „Amela": Label „Termin-Check Amela",
„Absage an Amela", Trigger `notify_amela_on_cleaning_release`. Nach dem Start des
Boris-Portals lag die Vermutung nahe, dass für ihn ein Ablauf fehlt.

Die Prüfung am Code ergab das Gegenteil. Der `chat-assistant` lädt
`service_providers` dynamisch, `max-cleaning-reminders` fragt jeden Provider
einer Reinigung und kennt Boris beim `waiting_for`, und der Trigger arbeitet
ausschließlich über `NEW.provider_id`. **Es fehlte kein Code — es fehlte die
Nachführung der Beschreibung.**

Das ist gefährlicher, als es klingt: Wer die SOLL-Definition liest, hält Boris
für nicht abgedeckt und baut möglicherweise ein zweites Mal, was es schon gibt.
Das Doppelgänger-Muster eine Ebene höher — nicht doppelter Code, sondern
doppelte Arbeit.

**Regel:** Bei „X ist nicht abgedeckt" zuerst am Code prüfen, nicht an der
Dokumentation. Und wenn ein Name historisch geworden ist
(`notify_amela_on_cleaning_release` gilt längst für alle), die **Kommentare**
richtigstellen statt umzubenennen — der Name steht in `max_ablaeufe` und in der
täglichen Prüfung, eine Umbenennung wäre Risiko ohne Gewinn.

### 9.6 Erinnerung mit Quittung: Max erklärte den Mechanismus falsch

Auf „Hinweis zum Kalender ist erledigt" antwortete Max, der Hinweis verschwinde
automatisch, sobald der Zeitraum in den Portalen geblockt sei. Das ist falsch und
hätte zu unbegrenztem Warten geführt.

`kalender-abgleich` kann das gar nicht prüfen — iCal-Feeds exportieren nur die
eigenen Buchungen eines Portals. Die einzige Bedingung ist
`.is('portale_geprueft_am', null)`. Der Hinweis verschwindet **ausschließlich**
durch das Häkchen in der Buchungskarte.

**Regel:** Wo ein Ablauf bewusst eine menschliche Quittung verlangt, muss das in
`max_ablaeufe` **und** in `assistant_knowledge` stehen. Sonst reimt sich Max eine
plausible Automatik zusammen — und plausibel klingende Falschauskünfte sind
schlimmer als ein ehrliches „weiß ich nicht".

### 9.7 Wo das Gemini-Budget hingeht

Gemessen am 22.07.2026, pro Chat-Anfrage und **vor** der ersten Antwort:

| Bestandteil | Zeichen | ~Tokens |
|---|---|---|
| System-Prompt | 15.723 | ~3.900 |
| Tool-Definitionen (30 Werkzeuge) | 31.015 | ~7.750 |
| **Fixkosten je Aufruf** | | **~11.700** |

Dazu der Gesprächsverlauf, der bei jeder Nachricht vollständig mitgeht, und der
Multiplikator der Tool-Schleife: `maxIterations = 5`, wobei jede Iteration die
vollen Fixkosten erneut sendet.

Eine Anfrage aus fünf Wörtern kostet damit rund 12.000 Token, bevor Gemini
anfängt zu arbeiten.

**Ansatzpunkte, falls es einmal nötig wird** (nicht umgesetzt, bewusst notiert):
Context Caching für die konstanten Teile; Werkzeuge nach `context.page` filtern
(die Seite wird bereits übertragen, aber nicht genutzt); den System-Prompt von
historischen Begründungen befreien — die gehören in diese Datei, nicht in einen
Text, den Gemini bei jedem Aufruf liest.

**Betrieblich:** Der API-Schlüssel gehört in ein Projekt mit sichtbarer
Abrechnung. Lief er über ein automatisch angelegtes Projekt, taucht der Verbrauch
in der eigenen Cloud-Console gar nicht auf, und ein leerer Prepay-Topf meldet sich
erst, wenn Max nicht mehr antwortet.

---

*Erstellt am 15.06.2026 nach einer fehlerhaften Sitzung zur Vereinheitlichung
der Übersichtskarten (Buchung/Reinigung/Wäsche). Ablage: Repo-Root neben
`AGENTS.md`.*

*Ergänzt am 19.07.2026 um Abschnitt 7 (Upsert ohne Aufräumen, Herkunft statt
Datumsvergleich, Schnittstelle von send-guest-email, Merk-Logik für wiederholte
Meldungen, falsche Fragestellung der Kollisionsprüfung).*

*Ergänzt am 18.07.2026 um Abschnitt 6 (RLS-Blockade als stiller Leerbefund,
Datentyp-Vergleich `date`/`timestamptz` im iCal-Sync, Deploy-Pfad der Website,
Kopplung Website ↔ Hausverwaltung, stille Fehlerbehandlung).*

*Ergänzt am 21.07.2026 um Abschnitt 8 (Gültigkeitsprüfung schließt Nicht-Existenz
aus, Ersatztext bei prinzipiell fehlenden Werten, neu genutztes Feld in der Query,
Testdaten-Reihenfolge, Deployment-Domains in Datensätzen).*

*Ergaenzt am 22.07.2026 um Abschnitt 9 (Direkt-Update ohne Hook, .select() bei
UPDATE, zwei Ursachen hinter HTTP 429, Gegenrichtung der Selbstpruefung,
providerneutraler Code bei Amela-Benennung, Erinnerung mit Quittung,
Gemini-Kostenstruktur).*
