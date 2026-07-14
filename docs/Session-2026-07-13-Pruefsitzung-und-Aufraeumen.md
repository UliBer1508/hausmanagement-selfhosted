# Session 13.07.2026 — Prüfsitzung, Aufräumen, Befunde

> **Anlass:** Uli meldete ein falsches Änderungsdatum auf der Reinigungskarte.
> Claude fixte es sofort — **ohne vorher die Dokumentation zu lesen**. Uli hielt
> das an („du liest die Doku nicht"). Erst danach folgte eine systematische
> Prüfung, die **fünf weitere Fehler** zutage förderte, die eine reine
> Symptom-Behebung nie gefunden hätte.
>
> Später in derselben Sitzung wiederholte sich der Fehler: Claude baute am
> Reschedule-Ablauf herum, ohne die **Tabelle `max_ablaeufe`** gelesen zu haben —
> die verbindliche Soll-Definition. Uli hielt erneut an. Der geplante Umbau wurde
> daraufhin **verworfen**, weil er der Definition widersprach.
>
> **Beide Male war der Auslöser derselbe: reden vor lesen.**

---

## TEIL 1 — Behobene Fehler

### 1.1 Reinigungskarte zeigte falsches Änderungsdatum

**Symptom:** „Geändert von: Admin · 01.01.26", obwohl nichts geändert wurde.

**Ursache:** `src/pages/OriginalDashboard.tsx`, `service_tasks`-Query — feste
Feldliste **ohne `updated_at`**. Damit war `task.updated_at` immer `undefined`,
der Fallback griff und zeigte das alte `status_changed_at`.

**Vorgeschichte:** Am 11.07. wurde genau dieser Bug „behoben" — aber nur in der
**`bookings`**-Query. Die `service_tasks`-Query blieb unangetastet, und die
Session-Doku meldete trotzdem **„live geprüft ✅"**.

`ConnectedBookingView.tsx` war nie betroffen (nutzt `select('*')`).

**Lehre:** *Fehlt ein Feld in der UI → zuerst die Query prüfen, dann die Anzeige.*
Diese Regel stand wörtlich in `AGENTS.md`, im `CODE-INDEX` (zweimal) und in den
Lessons. Claude hatte keine davon gelesen.

---

### 1.2 `update_linen_for_booking` meldete Erfolg, ohne etwas zu tun

**Ursache:** Existierte keine Wäschebestellung, rief die Funktion
`auto-create-linen-orders` mit **leerem Body** auf. Das ist die
**Batch-Automatik über alle Häuser** — sie nimmt **keine `booking_id`** entgegen
und ist durch `lookahead_bookings` begrenzt (max. 3 offene pro Haus).

Für die konkrete Buchung wurde also **womöglich gar nichts angelegt**, während
Max meldete: *„Wäsche neu angelegt (X Teile)."* Eine Falschmeldung.

**Zwillingsstelle:** Genau derselbe Fehler war am 11.07. in
`create_linen_for_booking` behoben worden. Die gebaute Funktion
`create-linen-order-for-booking` existierte — `update_linen_for_booking` nutzte
sie nur nicht. Ein Fix an einer von zwei Stellen.

**Behoben:** Ruft jetzt `create-linen-order-for-booking` und prüft `success`
**im Body** (nicht nur den Transportfehler). Außerdem `waiting_for` von
`'teuni'` auf `'uli'` korrigiert — die Bestellung steht auf `offen` und wartet
auf Ulis Freigabe, nicht auf Teuni.

---

### 1.3 `reschedule_cleaning` schrieb kein Protokoll

**Ursache:** Kein `logMaxAction` in der Funktion. Der DB-Trigger
`trg_close_max_action_on_cleaning_scheduled` sucht bei `draft → scheduled` einen
offenen Vorgang vom Typ `reschedule_cleaning` — **den es nie gab**. Die
Workflow-Kette brach bei **jeder** Terminverschiebung ab.

Die Tabelle `max_ablaeufe` (Schritt 6, Notiz) sagte das sogar selbst:
*„Kette per appendWorkflowStep fortschreiben (offen)."*

**Behoben:** `logMaxAction` mit **beiden** IDs — `booking_id` (für den
Abschluss-Trigger) und `related_task_id` (für den Provider-Antwort-Trigger).

---

### 1.4 ⚠️ Folgefehler: Doppel-Log (von Claude selbst verursacht)

Der Fix aus 1.3 erzeugte einen **neuen** Fehler: Die beiden deterministischen
Pfade (A und B in `serve()`) **loggten bereits selbst**. Nachdem
`executeRescheduleCleaning` ebenfalls loggte, entstanden **zwei
`max_actions`-Einträge pro Verschiebung** — der Vorgang erschien im
Max-Aktionen-Fenster doppelt.

**Ursache des Fehlers:** Claude änderte die Funktion, ohne zu prüfen, **wer sie
aufruft**. Genau das Doppelgänger-Muster — nur auf der Aufrufer-Ebene.

**Behoben:** Nur noch **ein** Log, in `executeRescheduleCleaning`. Die Herkunft
(Uli direkt vs. Amelas Portal-Wunsch) reichen die Pfade über `params.quelle`
durch — `max_ablaeufe` Schritt 1 unterscheidet beide Fälle ausdrücklich.

---

### 1.5 Wäschekarte zeigte keine „Geändert von"-Zeile

**Ursache:** `LaundryOrderCard.tsx` renderte `ChangedByLine` nur
`{order.status_changed_by && …}`. Dieses Feld ist bei **automatisch angelegten**
Bestellungen leer — die Zeile fehlte dort komplett, obwohl `updated_at` gesetzt war.

Exakt die Bedingung, die bei der Reinigungskarte längst entfernt worden war.

**Vor dem Fix geprüft** (die Lehre aus 1.1): Alle vier Aufrufer
(`LinenOrdersList`, `ConnectedBookingView`, `OriginalDashboard` ×2) nutzen
`select('*')` — `updated_at` ist überall vorhanden. Die Query war **nicht** das
Problem, die Anzeige konnte gefahrlos gefixt werden.

---

### 1.6 Max fand den Gast „Luca" nicht

**Symptom:** Auf *„verschiebe die Reinigung von Luca"* antwortete Max, er brauche
eine Buchungs- oder Reinigungs-ID.

**Ursache — und sie lag woanders als zunächst vermutet:** Der Befehl trifft gar
nicht das Gemini-Tool, sondern den **deterministischen Pfad A**. Dort holte
`extractGuestNameFromCommand()` den Namen — und diese Funktion sucht nur nach
**„an" / „für"**:

```js
/\b(?:an|für|fuer)\s+([A-Za-zÄÖÜäöüß.\-]+...)/
```

Bei *„…Reinigung **von** Luca"* greift sie nicht → `guestName = null` → Rückfrage.

Die Soll-Definition nennt den Auslöser wörtlich:
**„ändere Reinigung VON \<Gast\> auf \<Datum\>"** — das Wort „von" fehlte im Muster.

**Behoben:** Eigene Funktion `extractGuestNameFromReschedule()`. Kennt
von/an/für, den Genitiv („verschiebe **Lucas** Reinigung") und den Fall ohne
Präposition. Stoppwörter verhindern, dass Verben als Name durchgehen
(*„Reinigungstermin verschieben"* lieferte sonst einen Gast namens „verschieben").
Füllwörter werden nur **am Rand** geschnitten, nie mittendrin — sonst würde aus
„Christiaan Van **Der** Horst" ein „Christiaan Van Horst".

**7/7 Testfälle bestanden.**

---

### 1.7 Mehrere Reinigungen → Max riet

Pfad A nahm bei mehreren Treffern stillschweigend die nächstliegende —
möglicherweise die falsche. Jetzt werden sie **zur Auswahl vorgelegt**, analog zur
Definition (`create_cleaning_for_booking`, Schritt 3: *„Mehrere Treffer: zeigt
zur Auswahl", wartet_uli*).

Nebenbei: Die Query lud **alle** Reinigungen (auch vergangene und stornierte) und
filterte erst in JavaScript. Jetzt filtert die DB.

---

### 1.8 Tools fragten nach UUIDs, statt zu suchen

Vier Tool-Beschreibungen boten Gemini einen bequemen Ausweg
(*„frage nach **oder** nutze search…"*) — und ein Sprachmodell nimmt bei zwei
erlaubten Wegen den mit weniger Arbeit.

Die Definition sagt dagegen (Schritt 2): *„Sucht Buchung(en) zum Gast."*
**Max soll suchen.**

**Behoben** in `reschedule_cleaning`, `create_cleaning_for_booking`,
`create_linen_for_booking`, `update_linen_for_booking`: Suche ist jetzt **Pflicht**,
Nachfragen die Ausnahme. Zusätzlich hatte `search_cleaning_tasks` nur die
Beschreibung *„Sucht Reinigungsaufträge"* — damit erkannte Gemini gar nicht, dass
sich das Tool zum Auflösen eines Gastnamens eignet.

---

### 1.9 Doppelter DB-Trigger auf `bookings`

`sync_booking_guest_trigger` **und** `sync_guest_on_booking_change` riefen
**beide** `sync_guest_from_booking()` auf, beide `BEFORE INSERT OR UPDATE`. Die
Funktion lief seit dem **17.12.2025** bei jeder Buchung **doppelt**.

**Ursache:** Die Funktion wurde binnen 16 Minuten zweimal überarbeitet; beim
zweiten Mal entstand ein zweiter Trigger unter neuem Namen statt einer
Wiederverwendung. (Migrationen `20251217143734_…` und `20251217145322_…`.)

**Geprüft, bevor gehandelt wurde:** Der Doppellauf *kann* eine Gäste-Dublette
erzeugen — aber nur, wenn eine Buchung weder E-Mail noch Telefon noch Stadt noch
Geburtsdatum hat. An den echten Daten: **3 verwaiste Gäste, aber kein einziger mit
einem Namensvetter im Millisekunden-Abstand.** Es sind Altlasten aus gelöschten
Buchungen, keine Trigger-Dubletten. **Der Fehler ist nie eingetreten.**

**Behoben:** `supabase/SQL/02_fix_doppelter_gast_trigger.sql` — der jüngere
Trigger entfernt, die Funktion unangetastet. **In der DB verifiziert:** genau ein
Trigger übrig.

---

## TEIL 2 — DB-Logik erstmals im Repo

Die **Kernlogik von Max lebt in DB-Triggern**, nicht im Anwendungscode. Diese
Trigger wurden bisher nur per SQL-Editor ausgeführt und existierten in **keiner
Repo-Datei**. Damit war die wichtigste Logik des Systems nirgends nachlesbar,
nicht versionierbar und im Ernstfall nicht wiederherstellbar.

Neu: **`supabase/SQL/`** (mit README und Ablauf-Diagramm)

| Datei | Inhalt |
|---|---|
| `01_max_tables.sql` | `max_actions`, `max_ablaeufe`, `assistant_knowledge` |
| `02_fix_doppelter_gast_trigger.sql` | entfernt den doppelten Trigger (1.9) |
| `10_max_notify_amela_on_cleaning_release.sql` | Freigabe → Amela benachrichtigen |
| `11_max_close_actions.sql` | **drei** Trigger, die Max-Vorgänge abschließen |
| `12_max_provider_reply.sql` | Provider-Antwort → Kette fortschreiben |

**Beim Ziehen aufgefallen:** Es gibt **drei** Abschluss-Trigger, nicht einen. Die
Doku kannte nur `close_max_action_on_cleaning_scheduled`. Ebenfalls vorhanden,
aber in **keinem Dokument** erwähnt:

- `close_max_action_on_linen_confirmed` (auf `linen_orders`, `offen → ausstehend`)
- `close_max_action_on_guest_contacted` (auf `bookings`, `guest_contact_status`)

Beide sauber gebaut — und still.

---

## TEIL 3 — Doku aufgeräumt

**Der wichtigste Fund:** `AGENTS.md` verwies auf **drei Dateien, die es nicht
gibt** — `docs/CODING-GUIDE.md`, `docs/System-Knowledge.md`,
`docs/PROJEKT-REGELN.md`. Wer den Regeln folgte, lief ins Leere. Das ist
vermutlich ein Grund, warum die Regeln nie richtig gegriffen haben.

**Zwei `CODE-INDEX.md`:** Die Root-Version (15 KB) kannte **Max überhaupt nicht**
(0 Treffer für `max_actions`, `chat-assistant`) — sie stammte aus der Zeit vor dem
KI-Ausbau. Die docs-Version (25 KB) ist die aktuelle. Gefährlich, weil
`CODING-GUIDE.md` nur „CODE-INDEX.md" sagte.

**`README.md`** war noch die englische **Lovable-Standardvorlage**
(*„Welcome to your Lovable project"*).

**Neue Ordnung:**
```
Root:   AGENTS.md · README.md   (+ Code, Configs)
docs/:  alle Dokumentation
supabase/SQL/:  die DB-Trigger
```
Lovable-Altlasten gelöscht. Alle Verweise geprüft — **kein toter Link mehr**.

**Korrigiert:** „28 Tools" → **26** (die Bulk-Tools sind seit 12.07. bewusst
stillgelegt, weil nicht benötigt).

---

## TEIL 4 — Verworfen: die überflüssige Rückfrage

Claude wollte in Pfad A eine Bestätigungs-Rückfrage einbauen (*„Soll ich
verschieben? ja/nein"*), weil der Pfad sofort ausführte und das ein Verstoß gegen
das Modell-A-Prinzip zu sein schien.

**Falsch.** Die Tabelle `max_ablaeufe` sieht **keine** Rückfrage vor:

| # | Akteur | Schritt |
|---|---|---|
| 1 | uli | Änderungswunsch (Uli direkt **oder Amela** via Portal) |
| 2 | max | Ordnet die Reinigung über `related_task_id` zu |
| 3 | max | **Ändert auf neues Datum, Status `draft`** |
| 4 | max | Zeigt Button „Reinigung öffnen" |
| 5 | uli | Prüft in der Karte, setzt „Geplant" |
| 6 | system | DB-Trigger informiert Amela → **abgeschlossen** |

**`draft` IST die Freigabestufe.** Die Änderung ist reversibel und folgenlos, bis
Uli in der Karte auf „Geplant" setzt. Erst dann geht etwas an Amela.

Bei `accept_booking_inquiry` steht sehr wohl eine Chat-Bestätigung in der
Definition — weil eine Buchung anzulegen **nicht** reversibel ist. Der
Unterschied ist bewusst gesetzt; Claude hätte ihn eingeebnet.

**Der Umbau wurde verworfen.** Nur die durch die Definition gedeckten Fixes
(1.4, 1.6, 1.7, 1.8) blieben.

---

## TEIL 5 — Der Ablauf, wie er wirklich ist (bestätigt)

Uli formulierte ihn selbst, und der Code stimmt damit überein:

> *„Eine Änderung des Reinigungstermins kann von Amela oder von mir kommen. Max
> setzt sie um und gibt sie mir zur Prüfung. Genehmige ich, bekommt entweder Amela
> oder ich eine Bestätigung — je nachdem, wer die Anfrage gestellt hat."*

| | **Amela wünscht** | **Uli wünscht** |
|---|---|---|
| Max ändert | auf `draft` | auf `draft` |
| Uli prüft & gibt frei | ✅ | ✅ |
| **Amela bekommt Nachricht** | ✅ ja | ❌ nein (richtig — sie hat nicht gefragt) |
| **Uli sieht Abschluss** | ✅ Aktionen-Fenster | ✅ Aktionen-Fenster |

Der Trigger `notify_amela_on_cleaning_release` prüft, ob Amela zu **dieser**
Reinigung einen „Neuer Termin"-Wunsch gestellt hat. Nur dann schreibt er ihr.
`close_max_action_on_cleaning_scheduled` schließt in **beiden** Fällen den Vorgang.

**Erledigt und funktionsfähig.**

---

## TEIL 6 — Architektur-Erkenntnis: die deterministischen Pfade

**Dies stand in keiner Übersicht** und wurde erst durch die Prüfung sichtbar:

`serve()` hat **zwei Wege**:

1. **Deterministische Pfade** — Regex-Erkennung im Nutzertext, führen **direkt
   aus**. Gemini wird **nie gefragt**. Für: Begrüßungs-E-Mail und Reschedule
   (Pfade A/B/C).
2. **Gemini-Pfad** — alles andere, mit den 26 Tools.

Das ist bewusst so gebaut („zuverlässig statt Zufall", siehe
`docs/chat-assistant-aenderungen.md`). **Folge für jede künftige Arbeit:** Wer nur
die Tool-Definitionen liest, glaubt, Reschedule liefe über das Tool. Tut es nicht.
Prompt-Änderungen an `reschedule_cleaning` wirken auf
*„verschiebe die Reinigung von Luca"* **überhaupt nicht**.

---

## TEIL 7 — Offene Punkte

### 7.1 ⭐ AUFGABE FÜR MORGEN: Liefertermin-Änderung (Teuni)

Uli: *„Wenn der Liefertermin geändert werden soll, gilt die gleiche Logik wie bei
der Reinigungstermin-Änderung."*

**Diese Logik existiert für Wäsche nicht.** Vier Bausteine fehlen:

| Baustein | Reinigung (Amela) | Wäsche (Teuni) |
|---|---|---|
| Provider kann Termin vorschlagen | ✅ Button „Neuer Termin" | ❌ **fehlt** (nur Freitext) |
| Max erkennt den Vorschlag | ✅ `findAmelaRescheduleProposals` | ❌ sucht nur `related_task_id` |
| Tool zum Ändern | ✅ `reschedule_cleaning` | ❌ **kein `reschedule_linen_delivery`** |
| Trigger benachrichtigt zurück | ✅ `notify_amela_on_cleaning_release` | ❌ **kein Gegenstück** |

**Zusätzlich:** Teunis Portal (`fresh-spin-portal-selfhosted`,
`usePortalMessages.ts`) hängt an Antworten **nur `related_task_id`** an — eine
*Reinigungs*-ID. `related_linen_order_id` ist deklariert, wird aber **nie gesetzt**.
Ohne diesen Bezug kann kein Trigger die Antwort einer Bestellung zuordnen.

**Entscheidungen (von Uli am 13.07. getroffen):**
- Geänderter Liefertermin → Status zurück auf **`offen`** (wie neu angelegt)
- Teuni **soll** im Portal einen Liefertermin vorschlagen können (Button wie Amela)

**Zu beachten:** `offen` wird damit doppelt belegt („neu angelegt" **und**
„Termin geändert, bitte prüfen"). Der bestehende Trigger
`close_max_action_on_linen_confirmed` sucht Vorgänge vom Typ
`create_linen_for_booking` und `update_linen_for_booking` — ein neuer Typ
`reschedule_linen_delivery` **muss dort ergänzt werden**, sonst bleibt der Vorgang
ewig offen.

**Reihenfolge (wichtig — nicht wieder an der Definition vorbeibauen):**
1. **Zuerst `max_ablaeufe` ergänzen** — den Soll-Ablauf `reschedule_linen_delivery`
   definieren und von Uli prüfen lassen, **bevor** Code entsteht.
2. Dann Backend: Tool + zwei Trigger.
3. Dann Teunis Portal (anderes Repo).

---

### 7.2 Klargestellt: Gästezahl ≠ Liefertermin

Zwei **verschiedene** Abläufe, die nicht verwechselt werden dürfen:

**a) Gästezahl ändern** → Menge ändert sich → **Teuni wird informiert**.
Der Wunsch kommt immer von Uli; Teuni erfährt nur davon. Max legt einen
**Entwurf** der Nachricht vor (Freigabe-Regel: nur Terminfragen gehen direkt raus).
→ **Funktioniert bereits.**

**b) Liefertermin ändern** → **gleiche Logik wie Reinigungstermin**.
Der Wunsch kann von **Teuni** kommen. → **Existiert nicht** (siehe 7.1).

---

### 7.3 Kleinere Befunde (nicht angefasst)

- **anon-key im Klartext** in `trigger_translate_new_activity()`. Öffentlich, also
  kein echtes Geheimnis — aber unsauber. Diese Funktion wurde deshalb bewusst
  **nicht** in `supabase/SQL/` abgelegt.
- **`console.log('✅ [DEBUG] …')`** in `ConnectedBookingView.tsx` — verstößt gegen
  `AGENTS.md` („kein `console.log`").
- **Widersprüche in `max_ablaeufe`:** „Reinigung erstellen" Schritt 5 steht auf
  `umgesetzt`, die Notiz sagt aber *„Button fehlt in buildEntityLinks"*. Zwei
  Schritte stehen auf `pruefen` (Wäsche-Karten-Button). Sollte bereinigt werden.
- **`Prozess-Reinigung-Terminaenderung.md`** sagt: *„`max_actions` wird nirgends
  ausgewertet"* — seit dem 10.07. falsch.

---

## TEIL 8 — Die Lehren

**Alle Fehler dieser Sitzung hatten dieselbe Wurzel: reden vor lesen.**

1. **`max_ablaeufe` ist die verbindliche Soll-Definition** — und sie steht **nicht
   im Repo**, sondern in der Datenbank. Wer sie nicht abfragt, baut an der
   Definition vorbei. **Sie muss vor jeder Arbeit an Max gelesen werden.**

2. **Doppelgänger gibt es auf drei Ebenen:**
   - Komponenten (Reinigungskarte 3×, Wäschekarte 4 Aufrufer)
   - Funktionen mit gleichem Muster (`create_linen` / `update_linen`)
   - **Aufrufer** — eine Funktion um `logMaxAction` ergänzen, obwohl die Aufrufer
     schon loggen (→ Doppel-Einträge, 1.4)

3. **„deployt" ist nicht „geprüft".** Die Session-Doku vom 11.07. meldete die
   Reinigungskarte als „live geprüft ✅", obwohl sie nie funktionierte.

4. **Ein Teil der Geschäftslogik liegt in DB-Triggern.** Wer nur den TypeScript-Code
   liest, sieht die halbe Wirkung.

5. **Deterministische Pfade umgehen Gemini.** Tool-Definitionen zu lesen genügt nicht.

6. **Nicht aus Screenshots schließen.** `raw.githubusercontent.com` liefert
   veraltete Cache-Stände; die GitHub-API ist verlässlich.

---

## Geänderte Dateien

**Code**
- `supabase/functions/chat-assistant/index.ts` (1.2, 1.3, 1.4, 1.6, 1.7, 1.8)
- `src/pages/OriginalDashboard.tsx` (1.1)
- `src/components/Bookings/LaundryOrderCard.tsx` (1.5)

**SQL (neu)**
- `supabase/SQL/` — 5 Dateien + README

**Doku**
- `AGENTS.md`, `README.md` (Root) — Verweise repariert, Lovable-Vorlage ersetzt
- `docs/` — CODING-GUIDE, PROJEKT-REGELN, ARBEITSWEISE-LESSONS umgezogen
- `docs/CODE-INDEX.md`, `docs/…MASTER.md`, `docs/Max-Prompt-Architektur.md`,
  `docs/Session-2026-07-11-…md` — korrigiert

**Deploy:** `supabase functions deploy chat-assistant --project-ref usblrulkcgucxtkhugck`
