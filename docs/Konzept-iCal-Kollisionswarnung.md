# Konzept: iCal-Sync mit Kollisionswarnung

**Stand:** 17.07.2026 · Status: Konzept (noch kein Code)
**Ziel:** Externe Plattform-Belegungen (Airbnb, Booking.com, VRBO, Belvilla) per
iCal-Feed einlesen und Uli warnen, wenn ein belegter Zeitraum mit einer bestehenden
Buchung im eigenen System kollidiert — um Doppelbuchungen zu verhindern.

---

## 1. Das Problem (aus der Praxis)

- Plattform-iCal-Feeds liefern **nur Belegt-Zeiträume, keine Gastdaten** (Name,
  Anzahl, Kontakt fehlen — das ist eine Grenze der Plattformen, nicht behebbar).
- **Doppelbuchungsgefahr:** Jemand bucht auf Booking.com, Uli wird nicht/zu spät
  informiert. Parallel fragt jemand direkt an, Uli sagt zu — ohne zu wissen, dass
  der Zeitraum schon weg ist. Kollision.

**Gewünschte Lösung (bewusst schlank):**
- Nur **Kollisionswarnung** — keine automatische Gastanlage, keine Buchungserstellung.
- Meldung in der **Morgen-Übersicht** (gebündelt) — UND bei einer Kollision
  **sofort/proaktiv** beim nächsten Chat-Öffnen.

---

## 2. Was schon da ist (darauf bauen wir auf)

- **Plattform-Liste existiert** (`CreateBookingForm.tsx`, Feld `platform`):
  `booking.com`, `airbnb`, `vrbo`, `belvilla`, `direct`, `other`. Dieselben Werte
  nutzt der Sync — kein neues Vokabular.
- **Spalte `bookings.import_platform`** existiert bereits in der DB (types.ts),
  wird aber im Frontend nicht genutzt — mutmaßlich Überrest eines früheren
  Import-Ansatzes. Kann als Herkunfts-Kennzeichen wiederverwendet werden.
- **Wächter-Muster existiert:** `check_upcoming_bookings` + `morning-summary`
  melden bereits fehlende Reinigung/Wäsche/Zahlung. Die Kollisionswarnung ist eine
  **weitere Prüfung im selben, vertrauten Muster** — kein Fremdkörper.
- **Cron-Infrastruktur** (pg_cron) läuft bereits für andere Automatiken.

---

## 3. Was die Portale hergeben (recherchiert 17.07.2026)

| Plattform | iCal Import | iCal Export | Hinweis |
|---|---|---|---|
| **Airbnb** | ✅ | ✅ | Export bis 365 Tage voraus, Import bis 2 Jahre; je Listing eigene URL |
| **Booking.com** | ✅ | ✅ | Export-URL im Extranet (Connectivity/Kalender) |
| **VRBO** | ✅ | ✅ | max. 5 Import-Kalender/Objekt; nur ohne Drittanbieter-PMS |
| **Belvilla** | ✅ | ✅ | **unterstützt iCal doch** (My-Belvilla-Konto). Ulis Annahme „kein iCal" war nicht korrekt — Feed-URL dort suchen. |

**Dein System = Master-Kalender.** Da die Portale untereinander verbunden sind, aber
nicht mit dir, schließt dein System die Lücke: Es importiert alle Portale (Kollisionen
sehen) und exportiert deine Direktbuchungen an alle Portale (damit die sie blocken).

### ⚠️ Endlosschleifen-Regel (kritisch — aus der Recherche)

Ein importierter iCal-Link darf **nur** Buchungen *dieser* Plattform enthalten. Der
**Export-Feed deines Systems darf ausschließlich die `direct`-Buchungen ausgeben** —
NIEMALS die per iCal reimportierten Fremd-Blocks. Sonst schaukeln sich die Plattformen
gegenseitig hoch (Update-Endlosschleife). Master-Kalender geben nur die *eigenen*
Buchungen aus.

### Ehrliche Grenze: Sicherheitsnetz, kein Echtzeit-Schutz

iCal ist pull-basiert und nur Verfügbarkeit — die Plattformen holen Updates nach
eigenem Zeitplan (teils nur alle paar Stunden). Eine frische Plattform-Buchung
erscheint bei uns also mit Verzögerung. Die Kollisionswarnung reduziert das Risiko
stark, eliminiert es aber nicht. Bei knappen Direktzusagen weiterhin kurz direkt prüfen.

### Zwei Richtungen (beide nötig)

- **Import (Plattform → mein System):** Portal-Export-URL abonnieren, Belegungen lesen.
- **Export (mein System → Plattform):** eigener iCal-Feed (nur `direct`-Buchungen),
  den Uli bei Airbnb/Booking/VRBO/Belvilla als externen Kalender einträgt.

---

## 4. Vorgeschlagene Architektur

### 4.1 Datenmodell (neue Tabellen)

**`ical_feeds`** — je Haus + Plattform eine Import-URL:
```
id, house_id, platform (booking.com/airbnb/vrbo/belvilla),
feed_url (die Export-URL der Plattform), is_active,
last_synced_at, last_status, created_at
```

**`external_blocks`** — die eingelesenen Belegungen (nur Zeiträume):
```
id, house_id, platform, external_uid (die UID aus dem VEVENT, für Dedupe),
start_date, end_date, summary (roher Text, z.B. "CLOSED - Not available"),
first_seen_at, last_seen_at, collision_booking_id (NULL, oder die kollidierende Buchung)
```

### 4.2 Import-Function `ical-sync` (Cron)

1. Alle aktiven `ical_feeds` durchgehen, Feed per HTTP abrufen.
2. iCal parsen: nur `VEVENT`-Blöcke → `DTSTART`/`DTEND` → Zeiträume.
   (Kein Gastname erwartet — Plattform-Grenze.)
3. Pro Belegung in `external_blocks` **upserten** (über `external_uid`, damit
   dieselbe Belegung nicht doppelt entsteht).
4. **Kollisionsprüfung:** Für jede (neue oder geänderte) externe Belegung prüfen,
   ob ein Datumsüberlapp mit einer bestehenden `bookings`-Zeile desselben Hauses
   besteht (Status nicht `cancelled`). Überlappungsregel:
   `block.start < booking.check_out AND block.end > booking.check_in`.
5. Bei Kollision: `collision_booking_id` setzen → das ist das Signal für die Meldung.

### 4.3 Export-Feed `ical-export` (öffentliche, tokengeschützte URL)

- Liefert **NUR die `platform = 'direct'`-Buchungen** eines Hauses als iCal
  (`VEVENT` je Buchung, nur Zeitraum, kein Gastname → Datenschutz gegenüber der
  Plattform). **Reimportierte Fremd-Blocks NIEMALS mit ausgeben** (Endlosschleife,
  siehe §3).
- Pro Haus eine schwer-rätbare Token-URL (wie `portal_token` bei Providern),
  die Uli bei Airbnb/Booking/VRBO/Belvilla als externen Kalender einträgt.

### 4.4 Meldung an Uli (drei Wege, gemäß Ulis Vorgaben)

- **Morgen-Übersicht** (`morning-summary`): Abschnitt „⚠️ Kalender-Kollisionen"
  ganz oben, analog zu überfälligen Vorgängen. Listet: Plattform, Zeitraum, Haus,
  kollidierende eigene Buchung.
- **Sofort/proaktiv im Chat:** Findet der Sync eine **neue** Kollision, wird sie so
  hinterlegt, dass sie beim nächsten Chat-Öffnen aktiv gemeldet wird (gleicher
  Auto-Insert-Mechanismus wie bei überfälligen Vorgängen in `ChatAssistant.tsx`).
- **E-Mail bei Kollision** (von Uli gewünscht): sofort bei einer NEUEN Kollision
  eine E-Mail an **max.steinbock@gmail.com** über `send-guest-email`
  (denomailer/Gmail-SMTP). Betreff z.B. „⚠️ Kalender-Kollision: <Plattform>
  <Zeitraum> <Haus>". Nur bei neu erkannten Kollisionen, nicht täglich wiederholen.

### 4.5 UI (minimal)

- **Haus-Einstellungen:** je Plattform ein Feld für die iCal-Import-URL +
  Anzeige der eigenen Export-URL zum Kopieren.
- **Kalender/Timeline:** externe Blocks als graue Balken (optional, Phase 2 —
  laut Uli reicht zunächst die Warnung).

---

## 5. Bewusste Grenzen (kein Scope Creep)

- **Keine** automatische Gast-/Buchungsanlage aus iCal (Daten fehlen ohnehin).
- **Keine** Preis-/Zahlungslogik.
- iCal-Feeds sind teils **verzögert** (Booking/Airbnb aktualisieren im
  Stunden-Takt) — die Warnung ist ein Sicherheitsnetz, kein Echtzeit-Schutz.
  Das ehrlich kommunizieren.

---

## 6. Umsetzungs-Phasen

**Phase 1 — Import + Kollisionswarnung (der Kern):**
1. Tabellen `ical_feeds`, `external_blocks` (SQL-Migration, versioniert im Repo).
2. Edge Function `ical-sync` (Parser + Kollisionsprüfung).
3. Cron dafür — **diesmal als SQL-Migration ins Repo**, nicht nur in der DB.
4. `morning-summary` um den Kollisions-Abschnitt erweitern.
5. Proaktive Chat-Meldung bei neuer Kollision.
6. Minimale UI zum Eintragen der Feed-URLs.

**Phase 2 — Export-Feed (damit Plattformen meine Buchungen kennen):**
1. Edge Function `ical-export` (tokengeschützt, pro Haus).
2. UI zeigt die Export-URL zum Kopieren.
3. Uli trägt sie bei den Plattformen ein.

**Phase 3 (optional) — externe Blocks im Kalender sichtbar machen.**

---

## 7. Von Uli bereits entschieden

- **Kein Channel-Manager.** Uli verbindet die Portale nicht untereinander mit sich;
  das eigene System wird der Master-Kalender. ✔
- **Sync 1× täglich** — mit der Morgen-Automatik. ✔
- **E-Mail bei Kollision** an **max.steinbock@gmail.com** (zusätzlich zu Chat +
  Morgen-Übersicht). ✔
- **Import UND Export** beide gewünscht (Phase 1 + Phase 2). ✔

## 8. Noch zu klären (kleiner)

1. **Belvilla-Feed:** Uli dachte, Belvilla könne kein iCal — laut Recherche doch.
   Uli prüft im „My Belvilla"-Konto, ob die iCal-Export-URL auffindbar ist. Falls
   dort wirklich keine da ist, läuft Belvilla eben nur über die anderen Kanäle mit.
2. **Feed-URLs sammeln:** Pro Haus + Plattform die Export-URL aus dem jeweiligen
   Portal kopieren (Airbnb: Verfügbarkeit → Kalender synchronisieren → Kalender
   exportieren; Booking: Extranet → Kalender/Connectivity; VRBO: Owner Dashboard →
   Kalender → Verbinden → Exportieren). Diese trägt Uli später in der neuen UI ein.
3. **Reihenfolge:** Vorschlag — Phase 1 (Import + Warnung) zuerst live, dann Phase 2
   (Export-Feed). So hast du den Doppelbuchungs-Schutz schnell, der Export folgt.

---

## 9. Phase 2 UMGESETZT (17.07.2026) — Export-Feed

**Gebaut:**
- `supabase/functions/ical-export/index.ts` — oeffentlicher iCal-Feed pro Ferienhaus.
  Aufruf: `.../functions/v1/ical-export/<TOKEN>.ics`
- `supabase/SQL/33_ical_export_token.sql` — Spalte `houses.ical_export_token`,
  Tokens automatisch fuer alle Ferienhaeuser erzeugt.
- `CalendarSyncCard.tsx` — Abschnitt "Mein Kalender fuer die Portale" mit
  Kopieren-Button je Haus.
- `supabase/config.toml` — `verify_jwt = false` fuer `ical-sync` UND `ical-export`
  (Portale rufen den Feed anonym ab; Schutz = geheimes Token in der URL).

### Harte Regeln im Export (aus der Plattform-Recherche — nicht aendern!)

| Regel | Warum |
|---|---|
| **Nur `platform = 'direct'`-Buchungen** ausgeben | Reimportierte Fremd-Blocks wuerden eine Update-Endlosschleife zwischen den Portalen ausloesen |
| **Nur Ganztages-Daten** (`DTSTART;VALUE=DATE:20260725`), nie `T000000` | Airbnb lehnt seit 04/2025 zeitbehaftete Eintraege ab ("This iCal URL is invalid") |
| **URL endet auf `.ics`** | Mehrere Portale validieren die URL-Form statt des Inhalts |
| **Feed nie leer** — Platzhalter-Event, wenn keine Direktbuchung existiert | Ein Feed ohne zukuenftiges Event gilt beim Hinzufuegen als ungueltig |
| **CRLF + vollstaendiger RFC-5545-Rumpf** (VERSION, PRODID, UID, DTSTAMP) | Sonst schlaegt die Validierung fehl |
| **Keine Gastnamen** — `SUMMARY:Belegt` | Datenschutz gegenueber den Portalen |

### Realistische Erwartung je Plattform

| Plattform | Import (Portal -> uns) | Export (wir -> Portal) |
|---|---|---|
| Airbnb | ✅ | ✅ (Dialog "Mit anderer Website verknuepfen", Schritt 2) |
| VRBO | ✅ | ✅ |
| Belvilla | ✅ | ✅ (falls im My-Belvilla-Konto auffindbar) |
| **Booking.com** | ✅ | ❌ **akzeptiert seit 03/2025 keine Feeds von privaten Seiten** — dort bleibt nur der Import + unsere Kollisionswarnung |

### Airbnb-Besonderheit (Korrektur einer frueheren Annahme)

Airbnb trennt Export und Import NICHT: Der Dialog "Mit anderer Website verknuepfen"
zeigt in **Schritt 1** die Airbnb-URL (fuer unseren Import, Phase 1) und verlangt in
**Schritt 2** unsere URL (Phase 2). Schritt 1 laesst sich kopieren, ohne Schritt 2
abzuschliessen — der Dialog verhindert nur das Speichern, nicht das Kopieren.

---

## 8. Phase 4 — Kalender-Abgleich (Konzept, 18.07.2026)

> **Anlass:** Am 18.07.2026 stellte sich heraus, dass eine Booking.com-Buchung
> (Cathrin Clausnitzer, 06.–13.02.2027) im System fehlte. Der iCal-Sync hatte den
> Zeitraum korrekt eingelesen — er wurde nur **nicht gemeldet**, weil Phase 1 nur
> Überschneidungen prüft. Ein Block ohne passende Buchung ist für die bestehende
> Logik der Normalfall.

### 8.1 Die Fehleinschätzung in Phase 1

Phase 1 wurde gegen die Gefahr „zwei Buchungen für denselben Zeitraum" gebaut.
Im laufenden Betrieb ist die häufigere und teurere Gefahr aber die andere:

**Eine Portal-Buchung, die das System nicht kennt.** Folge: keine Reinigung,
keine Wäsche, kein Gästekontakt — und der Zeitraum könnte direkt noch einmal
vergeben werden.

Hinzu kommt: Der Fix vom 18.07.2026 (Rückspiegelungs-Erkennung in `ical-sync`)
setzt `collision_booking_id` bei deckungsgleichen Blocks bewusst auf `null`.
Dadurch sind „Block gehört zu Buchung X" und „Block gehört zu gar nichts" im
Feld nicht mehr unterscheidbar. Der Abgleich braucht deshalb eine **eigene
Auswertung**, er kann nicht auf `collision_booking_id` aufbauen.

### 8.2 Prüfrichtung: tagesweise, nicht blockweise

Ein blockweiser 1:1-Vergleich scheitert an zwei realen Mustern:

- **Zusammengefasste Blocks.** Booking.com meldete 25.12.2026–05.01.2027 als
  einen Block. Dahinter stehen zwei Buchungen (Tobias Kerscher 25.–29.12.,
  Denise Fischer 29.12.–05.01.). Ein 1:1-Vergleich schlägt Fehlalarm.
- **Wechseltage.** Abreise 10:00, Anreise 15:00 am selben Kalendertag ist
  Normalbetrieb. Der Vergleich muss tagesgenau sein (`date`, nicht `timestamptz`
  — siehe `ARBEITSWEISE-CLAUDE-LESSONS.md` 6.2).

**Die richtige Frage lautet daher:** *Ist jeder Tag, den ein Portal als belegt
meldet, im System durch irgendeine Buchung gedeckt — und umgekehrt?*

Die Meldung wird dadurch konkret und handlungsfähig:
„06.02.–13.02.2027 ist bei Booking.com belegt, im System aber frei."

### 8.3 Die vier Prüfungen

| # | Prüfung | Befund | Bedeutung |
|---|---|---|---|
| 1 | Portal belegt, System frei | `fehlende_buchung` | Buchung nicht nachgetragen — **der wichtigste Fall** |
| 2 | System belegt, Portal frei | `portal_frei` | Storno nicht durchgereicht, falsche Daten, oder Export läuft nicht |
| 3 | Feed schweigt | `feed_stumm` | `last_status = ok`, aber keine künftigen Blocks, während andere Feeds liefern |
| 4 | Feed-Fehler | `feed_fehler` | `last_status` beginnt mit `error:` |
| 5 | Langsperre | `langsperre` | Block > 30 Nächte — Kalenderhorizont **oder** vergessene Sperre (§8.4) |

### 8.4 Abgrenzung Sperrzeit vs. Buchung (der kritische Punkt)

Nicht jeder Block ohne Buchung ist eine fehlende Buchung. Die Portale sperren
auch von sich aus:

- **Mindestaufenthalt.** Liegen zwischen zwei Buchungen weniger freie Nächte als
  das Minimum, sperren die Portale diese Tage automatisch — sie sind
  unverkäuflich.
- **Kalenderhorizont.** Was über den gepflegten Kalender hinausgeht, melden
  manche Portale als „geschlossen". Beobachtet am 18.07.2026: Booking.com
  meldete 19.07.2027–18.01.2028 (183 Nächte) als `CLOSED`.
- **Manuelle Sperren** durch Uli im Portal.

**Abgrenzung über Ulis eigene Regeln** (Stand 18.07.2026: min 4 Nächte,
max 30 Nächte):

| Nächte | Bewertung | Meldung |
|---|---|---|
| < 4 | Sperrzeit — kann keine Buchung sein (unter dem Minimum) | nein |
| 4–30 | Buchungsverdacht, wenn keine Buchung existiert | **ja** |
| > 30 | **Langsperre** — kann keine Buchung sein, aber prüfenswert | **ja, einmalig** |

Gegenprobe an den 17 echten Blocks vom 18.07.2026: 5 Sperrtage (je 1 Nacht),
1 Langsperre (183 Nächte), 11 im Buchungsbereich — davon nach dem Nachtragen
von Cathrin Clausnitzer alle gedeckt. **Kein Rauschen.**

#### Warum lange Blocks NICHT stillschweigend gefiltert werden dürfen

Ein erster Entwurf dieses Konzepts hat Blocks über 30 Nächte als „Kalenderhorizont,
harmlos" eingestuft und wegfiltern wollen. **Das war falsch.**

Der Block `booking.com 19.07.2027 – 18.01.2028` (183 Nächte) war keine technische
Randerscheinung, sondern eine **vergessene Sperre**: Booking.com hielt ein halbes
Jahr Verfügbarkeit blockiert, ohne dass Uli davon wusste. Nach dem Fund am
18.07.2026 wurde der Zeitraum sofort freigegeben.

In den Daten sind beide Fälle **nicht unterscheidbar**:

- Kalenderhorizont des Portals (normal, kein Handlungsbedarf)
- Vergessene oder versehentliche Sperre (**entgangener Umsatz**)

Die Entscheidung kann nur Uli treffen. Deshalb: **einmalig melden, dann ruhen** —
solange sich Start- und Enddatum nicht ändern, keine Wiederholung. Ändert sich der
Zeitraum, gilt er als neu und wird erneut gemeldet.

Formulierung der Meldung bewusst als Frage, nicht als Fehler:
„Booking.com sperrt 19.07.2027–18.01.2028 (183 Nächte) im Venediger Chalet.
Ist das gewollt?"

**Die Grenzen gehören nicht in den Code**, sondern nach `system_settings`
(Muster wie `max_control_settings`), da Uli saisonal auch 3 Nächte zulassen kann.

### 8.5 Was NICHT geprüft wird (und warum)

**Portale untereinander vergleichen.** Ursprünglich angedacht, nach Prüfung am
18.07.2026 wieder verworfen: Ein Portal-Feed enthält **nur dessen eigene**
Buchungen, nicht die importierten Fremd-Blocks — dieselbe Regel, die auch
`ical-export` befolgt (§3, Endlosschleifen-Schutz).

Beispiel: VRBO meldete nur 1 Block (Juni 2026), obwohl im VRBO-Kalender die
Airbnb- und Booking.com-Belegungen sichtbar eingetragen waren. Das ist
**korrektes Verhalten**, kein Fehler. Ein Abgleich „kennen alle Portale
denselben Zeitraum?" würde daher systematisch Fehlalarm schlagen.

**Konsequenz:** Dass ein Portal einen Zeitraum nicht kennt, ist über iCal nicht
feststellbar. Die Blockierung dort passiert über den Import auf Portal-Seite und
ist von außen nicht prüfbar.

### 8.6 Bekannte Grenzen

- **Belvilla liefert keinen nutzbaren Feed** (Stand 18.07.2026 — trotz
  gegenteiliger Angabe des Anbieters). Wald Chalet wird ausschließlich über
  Belvilla vermietet und ist damit **vom Abgleich ausgeschlossen**. Für dieses
  Haus gibt es keinen Doppelbuchungs-Schutz über iCal.
- **Zeitverzug.** Portale synchronisieren im 30-Minuten- bis Stunden-Takt. In
  diesem Fenster ist eine echte Doppelbuchung technisch möglich und durch kein
  iCal-Verfahren verhinderbar. Der Abgleich ist ein Sicherheitsnetz.
- **Häuser ohne Feed** werden übersprungen, nicht als Fehler gemeldet.

### 8.6a Meldewege (Stand 19.07.2026)

| Weg | Was | Wann |
|---|---|---|
| Morgen-Übersicht | **alle** offenen Befunde | täglich, solange offen |
| Chat | auf Nachfrage (`check_kalender_abgleich`) | jederzeit |
| E-Mail | **nur neue** Befunde | einmalig je Befund |

**Warum die E-Mail nur einmal kommt:** Eine fehlende Buchung bleibt bestehen, bis
Uli sie nachträgt — das kann Tage dauern. Ohne Merk-Logik käme jeden Morgen
dieselbe Mail; nach der dritten würde sie ignoriert, und genau dann geht die
nächste, wirklich neue unter. Dasselbe Muster wie bei den Dauerkollisionen (§4).

**Umsetzung:** Tabelle `kalender_abgleich_meldungen` (SQL `35_...`). Schlüssel ist
der Befund selbst: Haus + Art + Plattform + Zeitraum. Verschiebt sich der
Zeitraum, gilt er als neuer Befund und wird erneut gemeldet — richtig so, denn
dahinter steckt dann eine andere Belegung. Einträge, die 7 Tage nicht mehr
auftauchen, werden gelöscht; das Problem gilt als behoben.

Gemerkt wird **erst nach erfolgreichem Versand**. Schlägt die Mail fehl, wird
beim nächsten Lauf erneut versucht — besser eine Mail zu viel als eine fehlende
Buchung, von der niemand erfährt.

**Schnittstelle `send-guest-email`** (wichtig, weil hier ein Fehler steckte):
Erwartet `recipients: [{ email }]`, `subjectTemplate`, `bodyTemplate` — NICHT
`to`/`subject`/`body`. Bei falschen Namen: HTTP 400, die Mail geht nie raus.
Der bestehende Kollisions-Mail-Weg in `ical-sync` hatte genau diesen Fehler;
**es ist nie eine Kollisions-Mail angekommen**, obwohl der Toast das meldete.
Korrigiert am 19.07.2026.

Empfänger und Schalter: `system_settings` → `kalender_abgleich_settings`
(`mail_to`, `mail_enabled`).

---

### 8.7 Einbindung als Max-Ablauf

Der Abgleich folgt dem bestehenden Wächter-Muster (`check_upcoming_bookings` /
`runUpcomingBookingsControl`) — kein neues Konzept, dieselbe Struktur:

- **Tool:** `check_kalender_abgleich` — Max kann auf Anfrage prüfen
- **Automatik:** täglicher Lauf nach `ical-sync`, vor `morning-summary`
- **Meldung:** Abschnitt in der Morgen-Übersicht; bei `fehlende_buchung`
  zusätzlich proaktiv im Chat (Mechanismus wie bei überfälligen Vorgängen)
- **`max_ablaeufe`:** neue Aktion, Variante `automatik`, Akteur `max`,
  Ergebnisstatus `wartet_uli` bei Befund

**Bewusst KEINE automatische Buchungsanlage** (§5 bleibt gültig): iCal liefert
keine Gastdaten. Max meldet nur — Uli trägt nach.

### 8.8 Direktbuchungen — Sonderfall Booking.com (entschieden 18.07.2026)

Direktbuchungen (`platform = 'direct'` oder leer) sind nur Uli bekannt. Die
Portale erfahren sie über `ical-export` — aber **unterschiedlich zuverlässig**:

| Portal | Weg | Verzug | Prüfung 2 (`portal_frei`) |
|---|---|---|---|
| Airbnb | Import unserer Export-URL | Abrufintervall (Stunden) | mit **Karenzzeit** melden |
| VRBO | Import unserer Export-URL | ~30 Min (laut VRBO-Oberfläche) | mit **Karenzzeit** melden |
| **Booking.com** | **kein Weg** | — | **dauerhaft melden** |

**Booking.com akzeptiert seit 03/2025 keine Feeds von privaten Seiten** (§3).
Direktbuchungen kommen dort also nie automatisch an — Uli muss den Zeitraum im
Extranet **manuell sperren**. Bis das geschehen ist, kann derselbe Zeitraum bei
Booking.com doppelt gebucht werden.

Das ist eine **dauerhafte strukturelle Lücke**, kein Zeitverzug. Die Prüfung
meldet daher jede Direktbuchung, deren Zeitraum bei Booking.com nicht als belegt
erscheint — ohne Karenzzeit, bis Uli sie dort eingetragen hat.

Karenzzeit für Airbnb/VRBO: **48 Stunden** ab Anlage der Buchung. Danach ist ein
fehlender Block ein echter Befund (Export läuft nicht, Token falsch, Portal hat
die URL nicht eingetragen).

---

### 8.9 Offene Punkte vor der Umsetzung
1. Wie weit voraus wird geprüft? `check_upcoming_bookings` nutzt 7 Tage; für den
   Kalenderabgleich ist ein deutlich größeres Fenster nötig (Buchungen liegen
   bis 2028 vor). Vorschlag: alles ab heute, ohne obere Grenze.
2. Soll eine erkannte Sperrzeit in der Belegungsliste (`CalendarSyncCard.tsx`,
   Phase 3) als „Sperrzeit" statt „Belegung" gekennzeichnet werden? Reine
   Anzeigefrage, kein Muss — aber die Liste zeigt derzeit Langsperren und
   Ein-Tages-Sperren wie echte Belegungen.
