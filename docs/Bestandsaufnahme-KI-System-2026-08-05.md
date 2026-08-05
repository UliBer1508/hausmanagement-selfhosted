# Bestandsaufnahme KI-System (Max) — Stand 05.08.2026 (abends)

> **Fassung 2.** Die erste Fassung entstand am Vormittag nach der Analyse. Am
> Nachmittag wurden B2, B3 und B5 behoben und dabei eine gemeinsame Wurzel
> gefunden, die B5 und B6 zugleich erklärte. Die Befunde sind entsprechend
> aktualisiert; der Ablauf der Sitzung steht in
> `docs/Session-2026-08-05-KI-Bestandsaufnahme-und-Bezugsfelder.md`.

> **Zweck:** Vollständiges Bild von SOLL und IST, bevor die geplanten
> KI-Erweiterungen beginnen. Diese Datei beschreibt **Mechanismen**, keine
> Schalterstellungen (Lessons 10.2) — Laufzeitzustände stehen ausschließlich in
> der Datenbank und sind hier nur als Abfrage vermerkt.
>
> **Ablage:** `docs/Bestandsaufnahme-KI-System-2026-08-05.md`

---

## 1. Methode und Belegtiefe

Gelesen wurde am 05.08.2026:

| Quelle | Umfang | Art des Belegs |
|---|---|---|
| Repo `hausmanagement-selfhosted`, Branch `main` | vollständig (codeload-ZIP) | Primärquelle |
| `docs/` | alle 21 Markdown-Dateien | Primärquelle |
| `supabase/SQL/` | alle 20 Dateien + beide READMEs | Primärquelle |
| Tabelle `max_ablaeufe` | 66 Zeilen / 17 Abläufe | SQL-Export durch Uli |
| Tabelle `assistant_knowledge` | 7 aktive Einträge | SQL-Export durch Uli |
| Karte „Max: Zeiten der Automatik" | 5 Jobs | Screenshots durch Uli |

**Nicht geprüft** (und daher hier nicht behauptet): Laufzeitinhalte weiterer
Tabellen, tatsächliche Cron-Ausführungen, Edge-Function-Logs.

---

## 2. Die drei Schichten des Systems

Max ist kein einzelner Baustein, sondern das Zusammenspiel von drei Schichten,
die getrennt gepflegt werden — und genau an ihren Nahtstellen entstehen die
Fehler.

| Schicht | Ort | Was sie festlegt | Wer sie ändert |
|---|---|---|---|
| **SOLL** | Tabelle `max_ablaeufe` | Welche Schritte ein Ablauf hat, wer handelt, welcher Zustand entsteht | Uli per SQL |
| **IST** | `chat-assistant`, Edge Functions, DB-Trigger | Was tatsächlich passiert | Code-Änderung + Deploy |
| **VERHALTEN** | System-Prompt + Tool-Beschreibungen + `assistant_knowledge` | Wie Gemini die Werkzeuge einsetzt | Prompt-Änderung **oder Max selbst** |

Die dritte Schicht ist die heikelste: Sie ist Text, sie wird bei jedem Aufruf neu
gelesen, und sie ist die einzige, die sich zur Laufzeit selbst verändern kann
(`save_knowledge`).

---

## 3. Inventar

### 3.1 Werkzeuge (30, aus `chat-assistant/index.ts`)

**Schreibend (11)** — jedes braucht laut Selbstprüfung einen Ablauf:
`accept_booking_inquiry`, `create_cleaning_for_booking`, `create_linen_for_booking`,
`reject_booking_inquiry`, `reject_reschedule`, `reschedule_cleaning`,
`reschedule_linen_delivery`, `save_knowledge`, `send_provider_message`,
`update_linen_for_booking`, `update_provider_action`

**Lesend (19)** — bewusst ohne Ablauf, sonst entstünde Dauerfehlalarm (Lessons 9.4):
`check_kalender_abgleich`, `check_upcoming_bookings`, `draft_guest_welcome_email`,
`get_booking_full_context`, `get_calendar_events`, `get_daily_overview`,
`get_dashboard_stats`, `get_guest_contact_reminders`, `get_linen_overview`,
`get_morning_summary`, `get_rating_reminders`, `get_revenue_stats`,
`read_provider_replies`, `search_booking_inquiries`, `search_bookings`,
`search_cleaning_tasks`, `search_guests`, `search_houses`, `search_linen_orders`

Die Liste `SCHREIBENDE_TOOLS` in `max-ablaeufe-pruefen/index.ts` ist **Handarbeit**
und veraltet prinzipiell. Bei jedem neuen Werkzeug dort ergänzen.

### 3.2 Abläufe (17 in `max_ablaeufe`, 66 Schritte)

`accept_booking_inquiry` · `check_upcoming_bookings` · `create_cleaning_for_booking`
(2 Varianten) · `create_linen_for_booking` · `draft_guest_welcome_email` (2 Varianten) ·
`get_morning_summary` · `kalender_abgleich` · `max_cleaning_reminders` (2 Varianten) ·
`max_linen_reminders` · `overdue_watch` · `provider_keine_antwort` ·
`reject_booking_inquiry` · `reject_reschedule` · `reschedule_cleaning` ·
`reschedule_linen_delivery` · `save_knowledge` (2 Varianten) · `systempruefung`

Verteilung nach `weg`: `mensch` (Uli oder Dienstleister), `ki` (Max entscheidet),
`system` (Cron oder DB-Trigger). Diese Spalte macht das Prinzip „immer den
KI-Weg" prüfbar.

### 3.3 Zustandsmodell `max_actions`

Jeder Vorgang durchläuft:

```
        Max fragt (due_at = jetzt + 24 h)
                    ↓
            wartet_provider ──── Provider antwortet ───→ beantwortet
                    ↓ (Frist abgelaufen, overdue-watch)
             ueberfaellig
                    ↓ (NUR durch Ulis Anweisung: update_provider_action)
            abgeschlossen
```

Zusätzlich: `wartet_uli` (Max hat etwas als Entwurf angelegt, Uli muss freigeben)
→ wird von DB-Triggern beim Statuswechsel der Karte geschlossen.

**Wichtig:** `ueberfaellig` hat nur zwei Ausgänge, beide erfordern eine Handlung
von außen. Es gibt keinen zeitbasierten Automatismus. Siehe Befund B1.

### 3.4 Automatik-Jobs

Fünf Jobs, gesteuert über die Karte „Max: Zeiten der Automatik"
(`MaxAutomationScheduleCard.tsx`, Tabelle `max_automation_schedule`).
**Einschalten legt den Cron-Job an, Ausschalten löscht ihn.**

| job_key | Edge Function | Zweck |
|---|---|---|
| `ablaeufe_pruefen` | `max-ablaeufe-pruefen` | gleicht jeden Ablaufschritt gegen den Code ab |
| `overdue_watch` | `overdue-watch` | markiert Vorgänge ohne Antwort |
| `morning_summary` | `morning-summary` | Tagesübersicht per E-Mail |
| `cleaning_reminders` | `max-cleaning-reminders` | Reinigungsdienstleister: „Passt der Termin?" |
| `linen_reminders` | `max-linen-reminders` | Teuni: „Wäsche vor der Reinigung liefern" |

Der Überfällig-Wächter **muss** vor der Morgen-Übersicht laufen; die Karte warnt
bei falscher Reihenfolge und sperrt das Speichern.

**Zweite Schalterebene** (unabhängig davon, in anderen Tabs):
`cleaning_automation_settings.max_reminder_enabled` und
`.max_linen_reminder_enabled`. Beide Ebenen müssen an sein, damit gesendet wird.

Aktueller Stand ist **ausschließlich** so ablesbar:

```sql
select job_key, jobname, local_time, enabled from max_automation_schedule order by sort_order;
select max_reminder_enabled, max_linen_reminder_enabled from cleaning_automation_settings;
select jobname, schedule, active from cron.job;
```

### 3.5 Die geschlossene Kommunikationskette

Der Kern des Systems: Eine Frage an einen Dienstleister trägt eine **ID**, und die
Antwort trägt dieselbe ID zurück. Ohne sie ist nicht zuordenbar, worauf sich
„ja, passt" bezieht.

| Gegenstand | Bezugsfeld | Zeigt auf |
|---|---|---|
| Reinigung | `related_task_id` | `service_tasks` |
| Wäschebestellung | `related_linen_order_id` | `linen_orders` |

Die Portal-Hooks (`usePortalMessages.ts`) hängen den Bezug automatisch an die
Antwort. Der Trigger `max_actions_on_provider_reply` schreibt damit den Vorgang
fort. **Die beiden Felder sind nicht austauschbar** — siehe Befunde B2/B3.

---

## 4. Befunde

Schweregrad: **A** = wirkt sich im Betrieb aus · **B** = wirkt sich aus, sobald
eine bestimmte Konstellation eintritt · **C** = Pflege/Klarheit.

| | Befund | Schwere | Stand 05.08. abends |
|---|---|---|---|
| B1 | `ueberfaellig` ohne zeitlichen Ausgang | A | gemildert (Hinweis in der Meldung) |
| B2 | falsches Bezugsfeld in `max_ablaeufe` | B | **behoben** |
| B3 | Tool-Beschreibung/Prompt ohne Wäsche-Bezug | B | **behoben** |
| B4 | Wäsche-Terminfrage aus dem Chat unverfolgbar | A | offen |
| B5 | geteilter Schlüssel + unbegrenzter UPDATE | A | **behoben (Wurzel)** |
| B6 | Spam-Prüfung ohne Anbieter-Filter | A | entschärft, Härtung offen |
| B7 | Laufzeitzustände in der SOLL-Tabelle | C | offen |
| B8 | kein Zustand „gebaut, aber inaktiv" | C | offen |
| B9 | `umsetzung='pruefen'` ohne Signal | C | offen |
| B10 | Selbstmodifikation ohne Regelwerk | B | Entscheidung offen |
| B11 | Dubletten/doppelte Wahrheit im Wissen | C | offen |
| B12 | Selbstprüfung misst Existenz, nicht Wirksamkeit | B | bauartbedingt |

### B1 — `ueberfaellig` hat keinen zeitlichen Ausgang · **A** · GEMILDERT

Der Ablauf `provider_keine_antwort` endet in Schritt 3 auf `wartet_uli`.
Schritt 4 ist ein menschlicher Schritt ohne Frist. Für das Schweigen eines
*Dienstleisters* existiert ein Wächter (`overdue-watch`); für das Schweigen
*Ulis* existiert keiner.

**Beleg:** Vorgang `f2e3ad0f…` (`linen_termin_check`, Hubert Middelbos), fällig
21.07.2026, erschien bis 05.08.2026 in jeder Morgen-Übersicht — 15 Mal. Genau
das beschreibt Lessons 7.4 („eine Warnung, die immer feuert, ist schlechter als
keine"); die dort entwickelte Merk-Logik wurde nur für den Kalender-Abgleich
umgesetzt (`kalender_abgleich_meldungen`), nicht für `max_actions`.

**Am 05.08. gemildert, nicht behoben (deployt):** Die Meldung sagt jetzt, wie
man sie beendet — mit den drei Formulierungen, die den drei Zweigen der
Prompt-Regel entsprechen. Die Entscheidung, ob nach n Tagen automatisch
geschlossen oder eskaliert wird, steht aus.

### B2 — Falsches Bezugsfeld in der SOLL-Definition · **B** · BEHOBEN

`create_linen_for_booking` Schritt 6 und `update_linen_for_booking` Schritt 4
schrieben beide „Tool send_provider_message (an Teuni, mit `related_task_id`)".
Für eine Wäschebestellung ist `related_linen_order_id` richtig.

**Wirkung:** Der Trigger prüft `related_task_id` zuerst. Eine Wäsche-Antwort mit
Reinigungs-Bezug landet im falschen Vorgang oder in keinem.

**Behoben am 05.08.2026** durch `supabase/SQL/37_max_ablaeufe_waesche_bezug_korrektur.sql`.

### B3 — Tool-Beschreibung und Prompt kannten nur die Reinigung · **B** · BEHOBEN

`read_provider_replies` beschrieb sich gegenüber Gemini als „verknüpft jede mit
der Reinigung … über `related_task_id`". Der Code kann seit dem 15.07. beides
(`executeReadProviderReplies` hat einen vollständigen Wäsche-Zweig mit
`typ=waesche`). Ebenso die Prompt-Regel: „gib wenn möglich `related_task_id` mit".

Dasselbe Muster wie Lessons 9.5 — der Code war neutral, nur die Beschreibung nicht.

**Behoben am 05.08.2026** in `chat-assistant/index.ts` (2 Stellen).

### B4 — Wäsche-Terminfragen aus dem Chat erzeugen keinen verfolgbaren Vorgang · **A** · OFFEN

**Neu gefunden am 05.08.2026, noch nicht behoben.**

In `executeSendProviderMessage` verlangt die Sperre einen Bezug —
`related_task_id` **oder** `related_linen_order_id`. Die anschließende
Workflow-Anlage prüft aber nur:

```javascript
if (params.related_task_id) { /* Vorgang anlegen/fortschreiben */ }
else { /* "UNERREICHBAR" — loggt status='abgeschlossen', ohne due_at */ }
```

Der `else`-Zweig ist als unerreichbar kommentiert. Er ist es nicht: Eine
Terminfrage mit **nur** `related_linen_order_id` — also der fachlich korrekte
Wäsche-Fall — landet dort. Folge:

- der Vorgang wird sofort als `abgeschlossen` protokolliert
- ohne `due_at` → der Überfällig-Wächter kann nie greifen
- ohne `related_linen_order_id` in `max_actions` → Teunis Antwort findet
  über den Trigger keinen Vorgang zum Fortschreiben

Die Nachricht selbst geht korrekt raus (`provider_messages` bekommt beide
Felder). Nur die Nachverfolgung fehlt. Das ist die Voraussetzung dafür, dass B2
überhaupt Wirkung entfalten kann.

### B5 — Kollisionsrisiko: zwei Vorgänge teilten sich eine `related_task_id` · **A** · BEHOBEN

`max-cleaning-reminders` schrieb `cleaning_termin_check` mit
`related_task_id = task.id`. `max-linen-reminders` schrieb `linen_termin_check`
mit **derselben** ID — die Wäsche-Erinnerung hing an der Reinigung, vor der
geliefert werden sollte.

Zwei Ausprägungen:

**(a) Im Trigger** (`23_max_provider_reply_linen.sql`): `ORDER BY created_at DESC
LIMIT 1`, kein Filter auf `provider_id`. Wer auch antwortete — der neuere Vorgang
wurde als „beantwortet" markiert, der andere blieb hängen und wurde überfällig.

**(b) Im Chat-Pfad** — gravierender: `updateMaxAction` führte ein UPDATE **ohne
Begrenzung** aus (`.eq('related_task_id', …)` ohne `.limit()`, ohne `.select()`).
Der Patch enthält `status`, `waiting_for` und `due_at`; eine Terminfrage an den
Reinigungsdienstleister setzte damit `waiting_for='amela'` auch auf einen
Wäsche-Vorgang, der auf Teuni wartete.

**Behoben am 05.08.2026 an der Wurzel** (siehe Kasten unten): getrennte
Schlüssel in `max-linen-reminders` plus Begrenzung auf genau eine Zeile in
`updateMaxAction` und im Zwilling `appendWorkflowStep`.

> **Die gemeinsame Wurzel von B5 und B6**
>
> `max-linen-reminders` hängte Nachricht und Vorgang an `related_task_id` — den
> **Reinigungs**-Schlüssel. Richtig ist `related_linen_order_id`. Das
> Teuni-Portal wurde am 16.07. darauf umgestellt und sagt im Kommentar
> ausdrücklich, dass Teunis Bezug „in der Regel" dieses Feld ist; der Cron-Job
> wurde nicht nachgezogen. Aus dem geteilten Schlüssel folgten B5 **und** B6.
>
> **Reihenfolge-Falle:** B6 verdeckte B5. Weil Amelas Vorgang gar nicht entstand,
> gab es keine Kollision. Eine isolierte Reparatur von B6 hätte B5 sofort
> aktiviert. Deshalb wurde die Wurzel behandelt, nicht die Symptome.

### B6 — Der Spam-Schutz der Reinigungs-Erinnerung filtert nicht nach Anbieter · **A** · ENTSCHÄRFT

**Gefunden am 05.08.2026. Durch den Wurzel-Fix zu B5 entschärft, Härtung offen.**

`max-cleaning-reminders`, Schritt 4:

```javascript
.from('provider_messages').select('id')
.eq('related_task_id', task.id)
.eq('sender_type', 'assistant')      // <- kein .eq('provider_id', …)
```

`max-linen-reminders` filtert an derselben Stelle korrekt auf `TEUNI_PROVIDER_ID`.

**Wirkung mit den Standard-Vorlaufzeiten** (Teuni 5 Tage, Amela 3 Tage): Teunis
Nachricht wird zwei Tage früher geschrieben und trägt dieselbe
`related_task_id`. Wenn Amelas Fenster öffnet, findet ihre Spam-Prüfung diese
Nachricht, wertet sie als „schon gefragt" — und **der Reinigungsdienstleister
wird nie gefragt**. Ohne Fehlermeldung; der Cron meldet Erfolg und zählt den Fall
unter `uebersprungen_schon_erinnert`.

Verwandt mit Lessons 8.1: Der Wächter schweigt genau dort, wo er reden müsste.

**Stand nach dem 05.08.2026:** Teunis Nachricht hängt jetzt an
`related_linen_order_id`; Amelas Prüfung auf `related_task_id` findet sie nicht
mehr. Die Kollision ist damit weg. Die fehlende Zeile
`.eq('provider_id', provider.id)` bleibt als Härtung offen — nicht mehr akut,
aber Vorsorge gegen andere Nachrichten auf derselben Reinigung (z. B. eine
Terminfrage, die Max im Chat gesendet hat).

### B7 — Laufzeitzustände stehen in der SOLL-Tabelle · **C**

`max_linen_reminders` trägt im Feld `funktion`: *„STAND: max_linen_reminder_enabled
= false → läuft leer. Vor Scharfschalten: Teuni persönlich einführen."* Dazu feste
Uhrzeiten (06:15, 06:30, 07:00, 07:30) in fünf Zeilen, obwohl die Zeiten seit
Einführung der Automatik-Karte frei einstellbar sind.

Lessons 10.2 verlangt das Gegenteil. Hier wiegt es schwerer als in einer
Markdown-Datei, weil `max_ablaeufe` die verbindliche Definition ist, gegen die
täglich geprüft wird.

### B8 — Kein Feld unterscheidet „gebaut" von „läuft" · **C**

`max_cleaning_reminders` und `max_linen_reminders` stehen auf
`umsetzung = 'umgesetzt'` und `geprueft_status = 'ok'`, obwohl beide Automatiken
abgeschaltet sein können. Das System meldet Vollständigkeit für möglicherweise
stillstehende Ketten. Ein Zustand „gebaut, aber bewusst inaktiv" fehlt.

### B9 — `umsetzung = 'pruefen'` löst kein Signal aus · **C**

`create_linen_for_booking` Schritt 4 und `update_linen_for_booking` Schritt 2
stehen seit Wochen auf `pruefen`. Die Kontrollfunktion wertet ausschließlich das
Feld `funktion` aus; `umsetzung` fließt in kein Signal ein. Beide melden `ok`.

### B10 — Selbstmodifikation ohne Regelwerk · **B**

`save_knowledge` schreibt in `assistant_knowledge`, und dieser Inhalt wird bei
jedem Aufruf in den System-Prompt geladen. Max verändert damit seine eigene
Arbeitsgrundlage. Der Ablauf `save_knowledge` regelt zwar das Fragen und
Bestätigen — aber nicht, welche Art von Inhalt zulässig ist.

**Konkreter Fall:** Eintrag `9104c10f…`, `created_by = max`:
„erstelle eine Wäschebestellung" → *„immer direkt `create_linen_for_booking`
aufrufen, ohne die Automatik zu prüfen"*. Das steht in Spannung zur Prompt-Regel
„Frage IMMER zuerst … und warte auf ein klares ja". Welche Anweisung gewinnt,
entscheidet Gemini pro Anfrage.

### B11 — Doppelte Wahrheit und Dubletten im gelernten Wissen · **C**

- Die Kinder-/Stoffsteinbock-Regel steht als Freitext in `assistant_knowledge`
  **und** implizit in `marketing_actions.target_criteria.has_children`
  (ausgewertet in `morning-summary`). Ändert sich die Marketing-Aktion, redet Max
  weiter vom Steinbock.
- `Boris` und `Boris Reinigungen` überlappen inhaltlich. Die Dedupe-Logik in
  `save_knowledge` greift per `ilike` nur bei identischem `term` — verschiedene
  Begriffe für dieselbe Sache wachsen ungebremst.
- Lessons 9.6 verlangt, dass Abläufe mit menschlicher Quittung **auch** in
  `assistant_knowledge` stehen. Weder der Kalender-Hinweis
  (`portale_geprueft_am`) noch der Überfällig-Fall sind dort vermerkt.

### B12 — Die Selbstprüfung misst Existenz, nicht Wirksamkeit · **B**

`max-ablaeufe-pruefen` zieht per Regex Bausteinnamen aus dem Feld `funktion` und
prüft, ob Tool/Edge Function/Trigger existieren. Am 05.08.2026 meldeten alle 66
Zeilen `ok` oder `kein_code` — während B1, B4, B5 und B6 gleichzeitig aktiv waren.

Die Prüfung kann nicht sehen, ob eine Kette terminiert, ob ein Schalter an ist,
ob das richtige Bezugsfeld verwendet wird, oder ob zwei Vorgänge kollidieren.
Das ist keine Fehlfunktion, sondern ihre Bauart — sie darf nur nicht mit einer
Gesundheitsaussage verwechselt werden.

---

## 5. Bild der Gesamtlage

Die **Reinigungskette ist durchgehend sauber**. Alle inhaltlichen Befunde
(B2, B4, B5, B6, B7, B9) betreffen die **Wäsche-/Teuni-Seite**. Das ist kein
Zufall: Die Wäschekette wurde am 16.07.2026 aus der Reinigungskette gespiegelt,
und liegengeblieben sind genau die Stellen, an denen sich beide unterscheiden —
die Tabelle (`linen_orders` statt `service_tasks`), das Statuswort (`offen`
statt `draft`) und vor allem das Bezugsfeld.

**Das Doppelgänger-Prinzip aus `AGENTS.md` gilt hier auf Ketten-Ebene:** Wer
eine Kette spiegelt, muss anschließend jeden Punkt prüfen, an dem sich Original
und Kopie unterscheiden — nicht die Stellen, an denen sie gleich sind.

---

## 6. Was am 05.08.2026 geändert wurde

| Datei / Objekt | Änderung | Befund |
|---|---|---|
| `supabase/functions/morning-summary/index.ts` | Hinweis in der Überfällig-Meldung, wie man sie beendet | B1 (gemildert) |
| `supabase/SQL/37_max_ablaeufe_waesche_bezug_korrektur.sql` | 2 Zeilen: `related_task_id` → `related_linen_order_id` | B2 |
| `supabase/functions/chat-assistant/index.ts` | `read_provider_replies`-Beschreibung + Prompt-Regel um Wäsche-Bezug ergänzt | B3 |
| `supabase/functions/max-linen-reminders/index.ts` | Bezug auf die Wäschebestellung umgestellt (Abfrage, Spam-Schutz, Nachricht, Vorgang); neuer Fall „keine Bestellung" | B5 / B6 (Wurzel) |
| `supabase/functions/chat-assistant/index.ts` | `updateMaxAction` auf eine Zeile begrenzt + `.select()`-Prüfung; Zwilling `appendWorkflowStep` angeglichen | B5 |

**Verifikationsstand:**

- Basis vor **und** nach jedem Upload per Blob-SHA gegen die GitHub-API geprüft
- byte-genaue Diffs vor der Auslieferung — ausschließlich gewollte Änderungen
- esbuild je Datei (Syntax; **keine** Aussage über Spaltenexistenz)
- Deploy durch `Select-String` auf Kennzeichen im lokalen Repo belegt
- SOLL-Korrektur durch Kontrollabfrage belegt; Selbstprüfung danach
  „37 Schritte geprüft, keine Abweichung"
- **B5 an echten Daten verifiziert:** Testlauf `max-linen-reminders` im
  `dry_run` (nichts gesendet) liefert `related_linen_order_id: 001c1a7b-…`,
  das Lieferdatum stammt aus derselben Bestellung, `ohne_waeschebestellung: 0`,
  1 von 2 Reinigungen wegen bereits gelieferter Wäsche übersprungen

Nicht verifizierbar und deshalb nicht behauptet: ob Gemini die geänderten
Beschreibungen im Alltag besser befolgt. Das zeigt sich erst im Realbetrieb.

## 7. Offen

**Technisch:**

1. **B4** — Wäsche-Terminfragen aus dem Chat erzeugen keinen verfolgbaren
   Vorgang. Betrifft nur den Chat-Pfad, kollidiert mit nichts.
2. **B6-Härtung** — `.eq('provider_id', provider.id)` in der Spam-Prüfung von
   `max-cleaning-reminders`. Nicht mehr akut.
3. **Trigger-Härtung** — bei mehreren Verschiebungen derselben Reinigung nimmt
   `max_actions_on_provider_reply` weiterhin den neuesten; eine Bevorzugung
   offener Vorgänge wäre robuster.
4. **B7/B8/B9** — Pflege der SOLL-Tabelle: Laufzeitzustände heraus, ein Zustand
   für „gebaut, aber bewusst inaktiv", `umsetzung='pruefen'` sichtbar machen.
5. **B11** — fehlende Einträge in `assistant_knowledge` (Kalender-Quittung,
   Überfällig-Fall), Dubletten zu Boris, doppelte Wahrheit beim Stoff-Steinbock.
6. Nebenbefunde: `max_actions` fehlt in `types.ts`; SQL-Datei 21 fehlt im Repo;
   `MaxActionsPanel` gruppiert Wäsche-Vorgänge nicht; `waiting_for` per
   Namens-Regex.

**Entscheidungen, die Uli treffen muss:**

1. **B1** — soll ein überfälliger Vorgang nach n Tagen automatisch geschlossen
   werden, oder eskalieren?
2. **B10** — braucht `save_knowledge` Grenzen? Vorschlag zur Diskussion: Begriffe
   (`category='dienstleister'`/`'begriff'`) darf Max selbst speichern,
   Verhaltensregeln (`category='regel'`) nur mit ausdrücklicher Bestätigung.

**Betrieblicher Rahmen (geklärt am 05.08.2026):** Die Amela- und
Teuni-Automatiken sind **vorübergehend** abgeschaltet, weil beide Dienstleister
noch eingearbeitet werden. Sie sollen wieder scharf geschaltet werden — deshalb
war B6 vor dem Wiedereinschalten zu lösen und nicht als theoretisch einzustufen.

*Fassung 1 erstellt am 05.08.2026 (vormittags), Fassung 2 am selben Tag abends
nach Behebung von B2, B3 und B5. Grundlage für die geplanten KI-Erweiterungen.*
