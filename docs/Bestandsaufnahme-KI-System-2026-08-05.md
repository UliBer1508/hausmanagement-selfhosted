# Bestandsaufnahme KI-System (Max) — Stand 05.08.2026

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

### B1 — `ueberfaellig` hat keinen zeitlichen Ausgang · **A**

Der Ablauf `provider_keine_antwort` endet in Schritt 3 auf `wartet_uli`.
Schritt 4 ist ein menschlicher Schritt ohne Frist. Für das Schweigen eines
*Dienstleisters* existiert ein Wächter (`overdue-watch`); für das Schweigen
*Ulis* existiert keiner.

**Beleg:** Vorgang `f2e3ad0f…` (`linen_termin_check`, Hubert Middelbos), fällig
21.07.2026, erschien bis 05.08.2026 in jeder Morgen-Übersicht — 15 Mal. Genau
das beschreibt Lessons 7.4 („eine Warnung, die immer feuert, ist schlechter als
keine"); die dort entwickelte Merk-Logik wurde nur für den Kalender-Abgleich
umgesetzt (`kalender_abgleich_meldungen`), nicht für `max_actions`.

**Am 05.08. gemildert, nicht behoben:** Die Meldung sagt jetzt, wie man sie
beendet. Die Entscheidung, ob nach n Tagen automatisch geschlossen oder
eskaliert wird, steht aus.

### B2 — Falsches Bezugsfeld in der SOLL-Definition · **B**

`create_linen_for_booking` Schritt 6 und `update_linen_for_booking` Schritt 4
schrieben beide „Tool send_provider_message (an Teuni, mit `related_task_id`)".
Für eine Wäschebestellung ist `related_linen_order_id` richtig.

**Wirkung:** Der Trigger prüft `related_task_id` zuerst. Eine Wäsche-Antwort mit
Reinigungs-Bezug landet im falschen Vorgang oder in keinem.

**Behoben am 05.08.2026** durch `supabase/SQL/37_max_ablaeufe_waesche_bezug_korrektur.sql`.

### B3 — Tool-Beschreibung und Prompt kannten nur die Reinigung · **B**

`read_provider_replies` beschrieb sich gegenüber Gemini als „verknüpft jede mit
der Reinigung … über `related_task_id`". Der Code kann seit dem 15.07. beides
(`executeReadProviderReplies` hat einen vollständigen Wäsche-Zweig mit
`typ=waesche`). Ebenso die Prompt-Regel: „gib wenn möglich `related_task_id` mit".

Dasselbe Muster wie Lessons 9.5 — der Code war neutral, nur die Beschreibung nicht.

**Behoben am 05.08.2026** in `chat-assistant/index.ts` (2 Stellen).

### B4 — Wäsche-Terminfragen aus dem Chat erzeugen keinen verfolgbaren Vorgang · **A**

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

### B5 — Kollisionsrisiko: zwei Vorgänge teilen sich eine `related_task_id` · **A**

**Neu gefunden am 05.08.2026, noch nicht behoben.**

`max-cleaning-reminders` schreibt `action_type='cleaning_termin_check'` mit
`related_task_id = task.id`. `max-linen-reminders` schreibt
`action_type='linen_termin_check'` mit **derselben** `related_task_id` — die
Wäsche-Erinnerung hängt an der Reinigung, vor der geliefert werden soll.

Der Trigger `max_actions_on_provider_reply` sucht den passenden Vorgang mit
`ORDER BY created_at DESC LIMIT 1` und filtert **nicht nach `provider_id`**.
Antwortet einer der beiden, wird der jeweils *neuere* Vorgang als „beantwortet"
markiert — unabhängig davon, wer geantwortet hat. Der andere bleibt stehen und
wird überfällig.

Das ist der plausibelste Entstehungsweg des Falls Middelbos.

### B6 — Der Spam-Schutz der Reinigungs-Erinnerung filtert nicht nach Anbieter · **A**

**Neu gefunden am 05.08.2026, noch nicht behoben.**

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

| Datei | Änderung | Befund |
|---|---|---|
| `supabase/functions/morning-summary/index.ts` | Hinweis in der Überfällig-Meldung, wie man sie beendet | B1 (gemildert) |
| `supabase/SQL/37_max_ablaeufe_waesche_bezug_korrektur.sql` | 2 Zeilen: `related_task_id` → `related_linen_order_id` | B2 |
| `supabase/functions/chat-assistant/index.ts` | `read_provider_replies`-Beschreibung + Prompt-Regel um Wäsche-Bezug ergänzt | B3 |

Beide TypeScript-Dateien mit `esbuild` geprüft — **Syntax, nicht Spaltenexistenz**.
Verifikation im Betrieb steht aus.

---

## 7. Offene Entscheidungen

1. **B1:** Soll ein überfälliger Vorgang nach n Tagen automatisch geschlossen
   werden, oder eskalieren (zweite Frist, anderer Anbieter, Chat-Nachfrage)?
2. **B4/B5/B6:** Diese drei greifen ineinander und sollten gemeinsam angegangen
   werden. B6 ist der schwerwiegendste — er kann dazu führen, dass der
   Reinigungsdienstleister stillschweigend nie gefragt wird.
3. **B10:** Braucht `save_knowledge` Grenzen? Vorschlag zur Diskussion: Max darf
   Begriffe (`category='dienstleister'`, `'begriff'`) selbst speichern,
   Verhaltensregeln (`category='regel'`) nur mit ausdrücklicher Bestätigung und
   mit `created_by='uli'`.
4. **B7/B8/B9:** Pflegeaufwand, aber Voraussetzung dafür, dass die Selbstprüfung
   künftig mehr aussagt als „die Bausteine existieren".
5. **Grundsätzlich:** Amela- und Teuni-Automatik sind derzeit abgeschaltet. Ist
   das ein Dauerzustand oder ein Provisorium? Davon hängt ab, ob die Ketten
   repariert oder umgebaut werden.

---

*Erstellt am 05.08.2026 als Grundlage für die geplanten KI-Erweiterungen.*
