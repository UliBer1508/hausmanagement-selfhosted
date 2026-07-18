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

*Erstellt am 15.06.2026 nach einer fehlerhaften Sitzung zur Vereinheitlichung
der Übersichtskarten (Buchung/Reinigung/Wäsche). Ablage: Repo-Root neben
`AGENTS.md`.*

*Ergänzt am 18.07.2026 um Abschnitt 6 (RLS-Blockade als stiller Leerbefund,
Datentyp-Vergleich `date`/`timestamptz` im iCal-Sync, Deploy-Pfad der Website,
Kopplung Website ↔ Hausverwaltung, stille Fehlerbehandlung).*
