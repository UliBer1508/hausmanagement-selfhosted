# Arbeitsweise für Claude — verbindliche Lessons Learned

> **Zweck:** Diese Datei existiert, weil eine Arbeitssitzung schlecht lief
> (15.06.2026). Sie hält fest, **was schiefging** und **welche Schritte
> verbindlich** sind, damit es sich nicht wiederholt. Sie ergänzt `AGENTS.md`,
> `CODE-INDEX.md` und `CODING-GUIDE.md` — ersetzt sie nicht.
>
> **Claude liest diese Datei zuerst, zusammen mit `AGENTS.md` und
> `docs/CODE-INDEX.md`, BEVOR es irgendeine Aussage über den Code trifft.**
>
> **Und `supabase/SQL/README.md`** — dort steht die Logik, die in DB-Triggern lebt
> und im TypeScript-Code NICHT sichtbar ist.

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

### Nachtrag 16.06.2026 — drei Fehler aus der Kosten-/Auswertungs-Session

1. **Feld behauptet, ohne Schema zu prüfen.** Beim Thema „Wäschekosten speichern"
   wurde angenommen, die Spalte `total_cost` existiere in `linen_orders`, weil die
   Karte `order.total_cost` liest. Daraufhin wurden ein Auto-Fix und ein Backfill
   gebaut, die in dieses Feld schreiben — die Spalte existierte aber NICHT. Beide
   liefen ins Leere und kosteten Credits. Erst eine SQL-Abfrage
   (`column does not exist`) deckte es auf. **Lektion:** Dass Code ein Feld liest,
   beweist NICHT, dass die Spalte existiert. Vor jeder Änderung, die auf ein
   DB-Feld schreibt, die Spaltenexistenz im Schema belegen.

2. **„Erledigt" geglaubt statt verifiziert — und Commit-Verzögerung.** Eine
   Lovable-Rückmeldung „erledigt" stimmte nicht mit dem Code überein; umgekehrt
   war eine andere Änderung doch umgesetzt, der Commit aber erst verzögert auf
   `main` sichtbar. **Lektion:** Nach jedem Lovable-Lauf den Ist-Stand frisch lesen
   und verifizieren. Bei „nicht gefunden" einmal kurz warten / erneut abrufen
   (Cache/Commit-Verzögerung), bevor man auf „nicht umgesetzt" schließt.

3. **Vereinbartes Mockup eigenmächtig anders gebaut.** Im Mockup waren sichtbare
   Umschalt-Buttons oben vereinbart und vom Nutzer genehmigt; im Prompt wurde
   stattdessen ein vorhandenes Dropdown wiederverwendet („spart Credits"). Das wich
   vom Genehmigten ab. **Lektion:** Ein genehmigtes Mockup ist die Abmachung. Nicht
   eigenmächtig davon abweichen — wenn eine günstigere Variante sinnvoll scheint,
   vorher fragen, nicht einfach anders bauen.

Gemeinsamer Nenner: **Reden vor Lesen.** Jeder einzelne Fehler wäre durch
„zuerst die richtige Datei im Ist-Zustand lesen" vermieden worden.

### Nachtrag 13.07.2026 — der Fehler wiederholte sich, obwohl die Regel hier stand

Claude bekam gemeldet: „Reinigungskarte zeigt falsches Änderungsdatum." Es änderte
**sofort die Query** — richtig geraten, aber **ohne AGENTS.md, CODE-INDEX.md oder
diese Datei gelesen zu haben.** Erst auf Ulis Nachdruck („du liest die Doku nicht")
wurden alle Dokumente gelesen. Darin stand die Regel wörtlich:

> AGENTS.md: *„Fehlt ein Feld in der UI: zuerst die Supabase-Query bzw. die Props
> prüfen. Ein fehlendes Feld ist meist ein Query-Problem."*
> CODE-INDEX.md, Abschnitt 0.5 und „Technische Fallen": dasselbe, zweimal.
> Diese Datei, Punkt 4 vom 15.06.: dasselbe.

**Das Ergebnis war zufällig richtig — der Weg war falsch.** Und ein zufällig
richtiges Ergebnis ist kein Beleg für eine funktionierende Arbeitsweise.

Die anschließende systematische Prüfung (nach vollständiger Lektüre) fand **vier
weitere Fehler**, die eine reine Symptom-Behebung nie zutage gefördert hätte —
darunter einen, bei dem Max **Erfolg meldete, obwohl womöglich nichts passiert war**
(`update_linen_for_booking` rief die Batch-Automatik statt der gezielten Function).

**Das Muster hinter allen vier:** Ein Fix wurde an einer Stelle gemacht und als
erledigt dokumentiert — die **Zwillingsstelle** blieb unberührt. Reinigungskarte
gefixt, Wäschekarte nicht. `create_linen` gefixt, `update_linen` nicht.

**Neue Regel daraus:**
> Die Doppelgänger-Warnung im CODE-INDEX gilt nicht nur für **Komponenten**,
> sondern auch für **Funktionen mit gleichem Muster**. Wer eine Stelle repariert,
> muss aktiv nach der Zwillingsstelle suchen (`grep` nach demselben Aufruf, derselben
> Bedingung) — und im Changelog benennen, ob es eine gibt und ob sie mitgezogen wurde.

**Zweite Regel — „deployt" ist nicht „geprüft":**
> Die Session-Doku vom 11.07. meldete die Reinigungskarte als „live geprüft ✅",
> obwohl sie nie funktionierte. Ein Häkchen darf erst gesetzt werden, wenn das
> **Verhalten in der laufenden App** gesehen wurde — nicht, wenn der Build durchlief.

---

### Nachtrag 2 vom 13.07.2026 — der schwerere Fehler: an der SOLL-DEFINITION vorbeigebaut

Am selben Tag, nach der Prüfsitzung, passierte es ein zweites Mal — und diesmal
gravierender.

Claude untersuchte den Reschedule-Ablauf, fand, dass er „sofort ausführt, ohne zu
fragen", hielt das für einen Verstoß gegen das Modell-A-Prinzip und **begann, eine
Bestätigungs-Rückfrage einzubauen**.

Uli hielt an: *„Wir haben die Tabelle `max_ablaeufe`, in der alle Prozessabläufe
von Max definiert sind. Hast du diese gelesen? Ich glaube, wir ändern den Code
ständig hin und her und beachten die klaren Definitionen nicht."*

**Er hatte recht. Claude hatte sie nie gelesen.**

Die Tabelle steht **nicht im Repo** — sie liegt in der Datenbank. Claude hatte
sogar die SQL-Datei geschrieben, die sie als „Soll-Vorgabe, Checkliste"
dokumentiert — und trotzdem nie hineingesehen.

**Was die Definition sagt** (`reschedule_cleaning`, standard):

| # | Akteur | Schritt |
|---|---|---|
| 1 | uli | Änderungswunsch (Uli direkt **oder Amela** via Portal) |
| 2 | max | Ordnet die Reinigung über `related_task_id` zu |
| 3 | max | **Ändert auf neues Datum, Status `draft`** |
| 4 | max | Zeigt Button „Reinigung öffnen" |
| 5 | uli | Prüft in der Karte, setzt „Geplant" |
| 6 | system | DB-Trigger informiert Amela → abgeschlossen |

**Es gibt keinen Bestätigungs-Schritt zwischen 1 und 3 — und das ist kein Verstoß
gegen Modell A, sondern dessen Umsetzung: `draft` IST die Freigabestufe.** Die
Änderung ist reversibel und folgenlos, bis Uli auf „Geplant" setzt.

Bei `accept_booking_inquiry` steht sehr wohl eine Chat-Bestätigung in der
Definition — weil eine Buchung anzulegen **nicht** reversibel ist. Der Unterschied
ist bewusst gesetzt; Claude hätte ihn eingeebnet.

**Der Umbau wurde verworfen.**

---

**Und ein Folgefehler, den Claude selbst verursachte:**

Der Fix „`reschedule_cleaning` schreibt kein Protokoll" war richtig — die Tabelle
sagte es selbst (Schritt 6, Notiz: *„Kette per appendWorkflowStep fortschreiben"*).
Aber Claude ergänzte `logMaxAction` **in der Funktion**, ohne zu prüfen, **wer sie
aufruft**. Die beiden deterministischen Pfade loggten bereits selbst.

Folge: **zwei `max_actions`-Einträge pro Verschiebung**, der Vorgang erschien im
Max-Aktionen-Fenster doppelt. Ein neuer Bug, erzeugt beim Beheben eines alten.

---

**Drei Regeln daraus:**

> **1. `max_ablaeufe` ist die verbindliche Soll-Definition — und sie steht in der
> DATENBANK, nicht im Repo.** Vor jeder Arbeit an Max abfragen:
> `select * from max_ablaeufe order by aktion, variante, schritt_nr;`
> Wer sie nicht liest, baut an der Definition vorbei. Der Code sagt, was IST —
> die Tabelle sagt, was SEIN SOLL. Bei Widerspruch gewinnt die Tabelle (oder man
> ändert sie bewusst, nach Rücksprache).

> **2. Doppelgänger gibt es auch auf der AUFRUFER-Ebene.** Vor dem Ändern einer
> Funktion prüfen: Wer ruft sie auf, und was tut der schon? Eine Funktion um
> Logging zu ergänzen, obwohl die Aufrufer bereits loggen, erzeugt Doppel-Einträge.

> **3. Nicht alles läuft über Gemini.** `serve()` hat deterministische Pfade
> (Regex-Erkennung), die Gemini komplett umgehen — für Reschedule und
> Begrüßungs-E-Mail. Tool-Definitionen zu ändern wirkt dort **überhaupt nicht**.
> Wer nur die Tool-Liste liest, versteht den halben Assistenten.

---

### Nachtrag 15.07.2026 — stornierte Zeilen gehören nie in eine Anzeige

**Fall:** In den Portal-Kalendern (Amela/Teuni) erschienen Wäschelieferungen
doppelt. Vermutung im Raum: Doppelgänger in der Erzeugung
(`create_linen`/`update_linen`). **Falsch.** An der Quelle geprüft (DB-Abfrage
auf `linen_orders` für den betroffenen Tag): zwei Zeilen, eine `cancelled`, eine
`ausstehend`. Es gab real **eine** gültige Lieferung.

**Ursache:** Der Anzeige-Code filterte `cancelled` bei `linen_orders` und
`service_tasks` **nicht** — bei `bookings` schon (`status==='cancelled'` bzw.
`.neq('status', BOOKING_STATUS.CANCELLED)`). Ein Badge pro Zeile = zwei Badges.

**Lesson (verbindlich):**
- Jede Query, die `linen_orders` oder `service_tasks` in eine **Anzeige** bringt,
  muss stornierte Zeilen ausschließen. Status-Werte deutsch **und** englisch:
  `cancelled`, `storniert`, `abgebrochen` — case-insensitive.
- Gehört zur bestehenden Regel „Query-Feldlisten sind fragil": ein fehlender
  Filter erzeugt **stille** Falschanzeigen, keine Fehlermeldung.
- Bevor „Doppelgänger in der Erzeugung" vermutet wird: **erst an der DB-Quelle
  zählen**, was real existiert. Die Doppelung war ein Anzeige-, kein Datenfehler.

**Zweite Lesson (Verknüpfung nicht immer vorhanden):** `linen_orders.booking_id`
ist **nicht immer gesetzt** (siehe `useDeliveryReminders`, das Zeilen ohne
`o.bookings` verwirft). Wer die Buchung mitlädt (z. B. für Gastname/Gästezahl im
Teuni-Detail), muss defensiv sein: fehlt die Buchung → „—" anzeigen, die
Lieferung aber **sichtbar lassen**. Im Kalender wird nicht rausgefiltert.

## 2. Pflicht-Reihenfolge VOR jeder Aussage/Änderung

Diese Schritte sind **nicht optional** und werden **in dieser Reihenfolge**
ausgeführt:

0. **Bei ALLEM, was Max betrifft: `max_ablaeufe` ABFRAGEN.** Die verbindliche
   Soll-Definition liegt in der **Datenbank**, nicht im Repo:
   `select * from max_ablaeufe order by aktion, variante, schritt_nr;`
   Ebenso `assistant_knowledge` (Max' gelerntes Wissen). Ohne diese Tabelle baut
   man an der Definition vorbei.
1. **Regeln laden.** `AGENTS.md` + `CODE-INDEX.md` + diese Datei lesen. Bei
   Max-Themen zusätzlich `docs/chat-assistant-aenderungen.md` (deterministische
   Pfade!) und `supabase/SQL/README.md` (DB-Trigger).
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

- **Mobile-Ansicht ist Pflicht in JEDEM UI-Prompt.** Laut CODING-GUIDE (B4) gilt
  responsives Verhalten wie im Bestand (`grid-cols-… sm:… lg:…`). Jeder Prompt, der
  UI verändert, MUSS explizit fordern: saubere Darstellung auf schmalen Bildschirmen
  (Umbruch via `flex-wrap`, `w-full sm:w-auto` für Button-Gruppen), Touch-freundliche
  Größen, KEIN horizontales Scrollen, nichts abgeschnitten auf ~360px Breite. Nicht
  darauf warten, dass der Nutzer es anmahnt — von vornherein reinschreiben.

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
- [ ] Bei DB-Feldern: Habe ich die **Spaltenexistenz im Schema** belegt, bevor ich
      Code baue, der darauf schreibt?
- [ ] Bei UI-Änderungen: Enthält mein Prompt **explizite Mobile-Vorgaben**?
- [ ] Habe ich nach dem letzten Lauf den **Ist-Stand verifiziert** (statt
      „erledigt" zu glauben)?
- [ ] Bei Max-Themen: Habe ich **`max_ablaeufe` abgefragt** und meine Änderung
      gegen die Soll-Definition abgeglichen?
- [ ] Bei Max-Themen: Weiß ich, ob der Befehl über **Gemini** oder über einen
      **deterministischen Pfad** läuft? (Reschedule und Begrüßungs-E-Mail umgehen
      Gemini komplett.)
- [ ] Bevor ich eine Funktion ändere: Habe ich geprüft, **wer sie aufruft** und was
      der Aufrufer schon tut?

---

## 5. Tonregeln

- Unsicherheit offen benennen statt überzeugt zu raten („ich muss erst prüfen“).
- Keine voreiligen „fertig/funktioniert“-Aussagen ohne Beleg.
- Wenn ein früherer Schritt falsch war: benennen, korrigieren, weiter — ohne
  Beschönigung.

---

*Erstellt am 15.06.2026 nach einer fehlerhaften Sitzung zur Vereinheitlichung
der Übersichtskarten (Buchung/Reinigung/Wäsche). Ergänzt 16.06., 13.07. und 15.07.2026.*
*Ablage seit 13.07.2026: `docs/` (zusammen mit allen anderen Dokumenten).
`AGENTS.md` im Repo-Root verweist hierher.*
