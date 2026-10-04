# Bestandsaufnahme KI-System (Max) — Stand 04.10.2026

> **Fortschreibung** von `docs/Bestandsaufnahme-KI-System-2026-08-05.md`. Die
> Augustfassung bleibt als Herleitung stehen; maßgeblich ist ab jetzt diese Datei.
>
> **Zweck:** Vor den geplanten KI-Erweiterungen festhalten, was Max heute ist,
> was davon trägt und was vorher repariert oder entschieden werden muss.
>
> **Belegbasis:** `main` nach Commit `9cdffaa` (04.10.2026). Zeilenangaben
> beziehen sich auf `supabase/functions/chat-assistant/index.ts` in diesem
> Stand (4.508 Zeilen), sofern nicht anders genannt.

---

## 1. Methode

Gelesen am 04.10.2026:

| Quelle | Umfang |
|---|---|
| `chat-assistant/index.ts` | vollständig, Zeile 1–4508 |
| `_shared/gemini.ts`, `_shared/auth.ts` | vollständig |
| `max-cleaning-reminders`, `overdue-watch`, `max-ablaeufe-pruefen` | gezielt (Stellen der Augustbefunde) |
| `src/hooks/useChat.ts` | vollständig |
| Doku | `AGENTS.md`, Lessons, Prompt-Architektur, Augustbestandsaufnahme |

**Nicht geprüft** und deshalb hier nicht behauptet: Inhalte der Tabellen
`max_ablaeufe`, `assistant_knowledge`, `max_actions` (Befunde B7–B9, B11 hängen
an diesen Daten), Cron-Läufe, Edge-Function-Logs, das Verhalten von Gemini im
Alltag.

---

## 2. Was Max heute ist

### 2.1 Aufbau einer Anfrage

```
Frontend (useChat.ts) ── ganze Chat-Historie ──▶ chat-assistant
   1. requireAdmin: nur angemeldeter Admin (Uli)
   2. Kontext laden: houses, service_providers, assistant_knowledge, max_ablaeufe
   3. System-Prompt bauen (~240 Zeilen fester Text + die vier Blöcke)
   4. Schleife, höchstens 5 Runden:
        Gemini (über _shared/gemini.ts) ──▶ Werkzeugaufruf? ──▶ executeTool ──▶ zurück an Gemini
   5. Antwort + Sprung-Buttons (___ENTITIES___) an das Frontend
```

Seit 04.10.2026 läuft jeder Gemini-Aufruf über `generateContent` in
`_shared/gemini.ts` (Fehlereinordnung, Zeitlimit, Wiederholung, Modell per
Secret `GEMINI_MODEL`). Details: `docs/Gemini-Anbindung.md`.

### 2.2 Werkzeuge: 31 (August: 30)

Neu seit August: `search_documents` (lesend, 21.08.2026).

**Schreibend (11):** `accept_booking_inquiry`, `reject_booking_inquiry`,
`create_cleaning_for_booking`, `create_linen_for_booking`,
`update_linen_for_booking`, `reschedule_cleaning`, `reschedule_linen_delivery`,
`reject_reschedule`, `send_provider_message`, `update_provider_action`,
`save_knowledge`

**Lesend (20):** `search_bookings`, `search_cleaning_tasks`,
`search_linen_orders`, `search_documents`, `search_houses`, `search_guests`,
`search_booking_inquiries`, `get_booking_full_context`, `get_daily_overview`,
`get_calendar_events`, `get_dashboard_stats`, `get_revenue_stats`,
`get_linen_overview`, `get_guest_contact_reminders`, `get_rating_reminders`,
`get_morning_summary`, `check_upcoming_bookings`, `check_kalender_abgleich`,
`read_provider_replies`, `draft_guest_welcome_email`

`SCHREIBENDE_TOOLS` in `max-ablaeufe-pruefen` (Zeile 350–362) stimmt mit dieser
Liste überein.

### 2.3 Was gut trägt

- **Eine Wahrheit für Abläufe:** `max_ablaeufe` wird bei jeder Anfrage gelesen
  und in den Prompt gesetzt (Z. 4009–4048). Nicht umgesetzte Schritte werden
  Max ausdrücklich als „noch nicht gebaut" gemeldet.
- **Geschlossene Kommunikationskette:** Fragen an Dienstleister tragen einen
  Bezug (`related_task_id` / `related_linen_order_id`); Terminfragen ohne Bezug
  werden abgewiesen (Z. 2523).
- **Freigabe-Prinzip:** Max legt Reinigungen als Entwurf und Wäsche als „offen"
  an; Uli gibt in der Karte frei, DB-Trigger schließen den Vorgang.
- **Belegungsprüfung** vor dem Annehmen einer Anfrage (seit 22.09.2026, Z. 99–156).
- **Gastdaten** werden durchgehend über `guests` gelesen (Etappe 4).

---

## 3. Stand der Augustbefunde

| | Befund (Kurz) | 05.08. | 04.10. — Beleg |
|---|---|---|---|
| B1 | `ueberfaellig` ohne zeitlichen Ausgang | gemildert | **unverändert**, Entscheidung offen |
| B2 | falsches Bezugsfeld in `max_ablaeufe` | behoben | behoben |
| B3 | Beschreibungen nur mit Reinigungsbezug | behoben | behoben (Z. 2258, 4212) |
| B4 | Wäsche-Terminfrage aus dem Chat ohne Nachverfolgung | offen | **offen** — Z. 2559: nur `related_task_id` eröffnet einen Vorgang; der Zweig „UNERREICHBAR" (Z. 2583) ist für Wäsche erreichbar |
| B5 | geteilter Schlüssel, unbegrenzter UPDATE | behoben | behoben (Z. 3763–3820) |
| B6 | Spam-Prüfung ohne Anbieter-Filter | entschärft | **Härtung offen** — `max-cleaning-reminders` Z. 132–136 ohne `.eq('provider_id', …)` |
| B7 | Laufzeitzustände in `max_ablaeufe` | offen | nicht geprüft (Tabelleninhalt) |
| B8 | kein Zustand „gebaut, aber inaktiv" | offen | nicht geprüft (Tabelleninhalt) |
| B9 | `umsetzung='pruefen'` ohne Signal | offen | Code unverändert: Z. 4020–4021 werten nur `umgesetzt`/`fehlt` aus, `pruefen` fällt still heraus |
| B10 | Selbstmodifikation ohne Regelwerk | Entscheidung offen | **offen** — `executeSaveKnowledge` (Z. 1351) nimmt jede Kategorie, auch `regel` |
| B11 | Dubletten im gelernten Wissen | offen | nicht geprüft (Tabelleninhalt) |
| B12 | Selbstprüfung misst Existenz, nicht Wirkung | bauartbedingt | unverändert |

**Am 04.10.2026 zusätzlich behoben:** Gemini-Fehler 402 wurde nicht erkannt;
`chat-assistant` hatte einen eigenen Gemini-Aufruf an `_shared/gemini.ts`
vorbei, der zudem jedes Rate-Limit als „Guthaben leer" meldete.

---

## 4. Neue Befunde

Schweregrad wie im August: **A** = wirkt im Betrieb · **B** = wirkt, sobald eine
bestimmte Konstellation eintritt · **C** = Pflege/Klarheit.

| | Befund | Schwere |
|---|---|---|
| N1 | Ablehnen einer Anfrage überschreibt die Nachricht des Gastes | **A** |
| N2 | `create_linen_for_booking`: Beschreibung und Schema passen nicht zum Code | **B** |
| N3 | `search_bookings` ohne Datum liefert die 20 ÄLTESTEN Buchungen | **B** |
| N4 | Anfrage annehmen legt die Reinigung am Freigabe-Ablauf vorbei an | **B** |
| N5 | Schreibschutz besteht nur aus Prompt-Text | **B** (Architektur) |
| N6 | `update_linen_for_booking` widerspricht der Rollenabgrenzung vom 11.09. | Entscheidung |
| N7 | „Heute" wird in UTC berechnet | C |
| N8 | `get_linen_overview` meldet immer Status „ok" | C |
| N9 | Herkunft einer Verschiebung (`quelle`) ist immer „uli" | C |
| N10 | toter Code und Beschreibungsdrift | C |
| N11 | Grenze vor Filter auch bei `get_rating_reminders` | C |

### N1 — Ablehnen überschreibt die Nachricht des Gastes · **A**

`executeRejectBookingInquiry`, Z. 264–269:

```javascript
message: reason ? `[Abgelehnt: ${reason}] ${params.original_message || ''}` : undefined
```

`original_message` ist im Werkzeug-Schema (Z. 1897–1904) **nicht definiert**;
Gemini kann ihn nicht liefern. Bei jeder Ablehnung mit Grund wird die
ursprüngliche Nachricht des Gastes durch `[Abgelehnt: …] ` ersetzt. Datenverlust,
nicht rückgängig zu machen.
**Behebung:** vorhandene Nachricht lesen und den Vermerk voranstellen.

### N2 — `create_linen_for_booking`: Beschreibung und Code gehen auseinander · **B**

Der Code ruft seit 11.07.2026 gezielt `create-linen-order-for-booking` für **eine**
Buchung auf und verlangt `booking_id` (Z. 2862). Die Beschreibung an Gemini
(Z. 2169) beschreibt dagegen noch die Batch-Automatik („pro Haus über die
nächsten Buchungen, nicht gezielt für eine einzelne", „Duplikat-Schutz"), und
das Schema nennt `booking_id` „Optional" ohne `required` (Z. 2173).
**Wirkung:** Max kann ohne ID aufrufen (Fehler) und erklärt Uli ein Verhalten,
das es nicht mehr gibt. Dasselbe Muster wie B3 und Lessons 9.5.

### N3 — `search_bookings` ohne Datumsfilter liefert die ältesten Buchungen · **B**

Z. 329: `.order('check_in', { ascending: true })`, Z. 398–399: `limit(20)`.
Gibt Gemini kein Datum mit, kommen die 20 **ältesten** Buchungen zurück.
Zusätzlich wird erst **nach** dem Limit auf Ferienhäuser gefiltert (Z. 407),
weil der Filter `houses.rental_type` ohne `!inner` nur die Relation leert, nicht
die Zeile entfernt.
Dieselbe Fehlerklasse wie der Luca-Fall vom 14.07.2026 (alles ab Position 21
unsichtbar). Heute fiel es nicht auf, weil Gemini bei „wer ist im Haus" ein
Datum setzt — darauf ist kein Verlass.
**Behebung:** `houses!inner(...)`; ohne Datumsangabe absteigend sortieren.

### N4 — Anfrage annehmen legt die Reinigung am Freigabe-Ablauf vorbei an · **B**

`executeAcceptBookingInquiry`, Z. 215–225: Die Reinigung wird direkt in
`service_tasks` mit `status: 'scheduled'` eingefügt — ohne `provider_id`,
ohne Entwurfsstufe. Der reguläre Weg `create-cleaning-task-for-booking` setzt
dagegen den Standard-Dienstleister aus den Einstellungen und den Status
`draft` (dort Z. 173–174); Uli prüft und gibt frei.
**Wirkung:** Die Reinigung hängt an keinem Dienstleister. Im Repo ist kein
Trigger abgelegt, der beim Einfügen einen setzt — laut `supabase/SQL/README.md`
liegen aber nicht alle Trigger im Repo, deshalb vor der Behebung in der
Datenbank prüfen (Abfrage in Abschnitt 6). Ob der Fall im Betrieb vorkam, zeigt
ebenfalls die Abfrage dort.
**Behebung:** denselben Weg wie `create_cleaning_for_booking` nutzen.

### N5 — Der Schreibschutz besteht nur aus Prompt-Text · **B, Architektur**

„Erst nach klarem ja" steht in Tool-Beschreibungen und Prompt. Im Code gibt es
keine Sperre: Ruft Gemini `accept_booking_inquiry` oder `reschedule_cleaning`
ohne vorherige Zustimmung auf, wird ausgeführt. Einzige Ausnahme:
`send_provider_message` sendet Nicht-Terminfragen nur mit `freigegeben=true`
(Z. 2497) — aber auch diesen Wert setzt das Modell selbst.

Das wiegt schwerer, weil fremder Text ins Modell gelangt: Antworten von Amela
und Teuni (`read_provider_replies`), Anfragetexte von Gästen
(`search_booking_inquiries`) und gelerntes Wissen (`assistant_knowledge`).
Ein Satz darin, der wie eine Anweisung klingt, landet ungeprüft im Kontext.

**Vorschlag für die Erweiterungen:** schreibende Werkzeuge zweistufig — der
erste Aufruf liefert nur einen Vorschlag mit Kennung, ausgeführt wird erst mit
einer Kennung, die der Server nach einer Zustimmung **in Ulis eigener
Nachricht** freigibt. Damit hängt die Sicherheit nicht mehr am Modell.

### N6 — `update_linen_for_booking` widerspricht der Rollenabgrenzung · Entscheidung

Festgelegt am 11.09.2026: Alle Änderungen und Berechnungen zur Gästezahl
passieren in der Hausverwaltung; Max bekommt das fertige Ergebnis und
informiert Teuni. Vorgeschrieben ist außerdem die Reihenfolge Gästezahl →
Zuschläge → Wäsche (`docs/Prozess-Gaestezahl-Aenderung.md`).

`update_linen_for_booking` (Z. 2918) berechnet die Wäsche selbst neu und ersetzt
die Bestellung — unabhängig vom Zuschlagsschritt. Der Prompt (Z. 4254–4258)
lädt Max ausdrücklich dazu ein.
**Zu entscheiden:** Werkzeug entfernen, oder auf „prüfen und an die Wäschekarte
verweisen" reduzieren.

### N7 — „Heute" wird in UTC berechnet · C

Datumsblock im Prompt (Z. 3858–3922), `get_daily_overview` (Z. 1254),
`get_calendar_events` (Z. 1432) und `check_upcoming_bookings` (Z. 2668–2673)
rechnen mit `toISOString()` (UTC). Zwischen 00:00 und 02:00 (Sommerzeit) bzw.
01:00 (Winterzeit) ist für Max noch gestern; „diese Woche" kippt am
Sonntag/Montag entsprechend. Die Klartext-Uhrzeit im Prompt stimmt (Berlin),
das ISO-Datum daneben nicht — zwei widersprüchliche Angaben.

### N8 — `get_linen_overview` meldet immer „ok" · C

Z. 974–978: `status: 'ok'` ist fest eingetragen („Could be enhanced …"). Max
kann daraus einen Bestandsstatus ableiten, der nicht berechnet wurde. Zudem ist
fraglich, ob `houses.linen_stock` nach der Umstellung auf `laundry_articles`
(05.09.2026) noch gepflegt wird.

### N9 — `quelle` einer Verschiebung ist immer „uli" · C

`reschedule_cleaning` (Z. 3208) und `reschedule_linen_delivery` (Z. 3325) lesen
`params.quelle`. Der Parameter steht in keinem Schema; die Pfade, die ihn
setzten, wurden am 17.07.2026 entfernt. Jede Verschiebung wird als Ulis Wunsch
protokolliert, auch wenn Amela oder Teuni sie wollten.

### N10 — Toter Code und Beschreibungsdrift · C

- `appendWorkflowStep` (Z. 3692) wird nirgends aufgerufen. Laut
  `supabase/SQL/README.md` sollte der Trigger `trg_notify_amela_on_cleaning_release`
  die Vorgangskette damit fortschreiben — als „offen" vermerkt, nie verdrahtet.
- `context` (aktueller Tab) wird vom Frontend gesendet, aber nur geloggt (Z. 3831/3855).
- Kommentar „UNERREICHBAR" (Z. 2584) ist falsch, siehe B4.
- Prompt (Z. 4265) sagt für Verschiebungen „nutze search_bookings", die
  Werkzeugbeschreibung „search_cleaning_tasks".
- `search_documents` fehlt in der Werkzeugübersicht des Prompts (Z. 4146–4161).
- `docs/Max-Prompt-Architektur.md` nennt 27 Werkzeuge und Zeilen vom Juli.

### N11 — Grenze vor Filter in `get_rating_reminders` · C

Z. 1584 filtert `houses.rental_type` ohne `!inner`, Z. 1592 begrenzt auf 20,
Z. 1599 sortiert danach aus. Bei vielen Dauermiet-Buchungen im Zeitfenster
fallen Ferienhaus-Treffer weg.

---

## 5. Was vor den Erweiterungen zu tun ist

**Stufe 1 — Fehler beheben (klein, sofort):**
N1 (Datenverlust), N2, N3, B4, B6-Härtung, N9. Alles in `chat-assistant` und
`max-cleaning-reminders`, keine Schemaänderung.

**Stufe 2 — Entscheidungen von Uli:**

1. **B1** — überfällige Vorgänge nach n Tagen automatisch schließen oder eskalieren?
2. **B10** — darf Max Verhaltensregeln (`category='regel'`) selbst speichern,
   oder nur Begriffe?
3. **N6** — `update_linen_for_booking` behalten, einschränken oder entfernen?
4. **N4** — soll das Annehmen einer Anfrage die Reinigung als Entwurf anlegen
   (wie alle anderen Wege)?
5. **N5** — zweistufige Freigabe für schreibende Werkzeuge als Grundlage der
   Erweiterungen?

**Stufe 3 — Umbau für Erweiterbarkeit:**

`chat-assistant/index.ts` ist mit 4.508 Zeilen in einer Datei die größte
Hürde: Werkzeugdefinition (Z. 1856–2326) und Ausführung (Z. 44–1766,
2347–3439) liegen 500 bis 2.000 Zeilen auseinander. Genau daraus entstehen
Beschreibungsdrifts wie B3 und N2. Vorschlag:

```
chat-assistant/
  index.ts            Anfrage, Auth, Schleife (≈ 250 Z.)
  prompt.ts           Kontext laden + System-Prompt
  tools/
    registry.ts       Liste aller Werkzeuge, je Werkzeug Definition + Ausführung zusammen
    bookings.ts       search_bookings, get_booking_full_context, Anfragen …
    cleaning.ts       Reinigung anlegen/verschieben/absagen
    linen.ts          Wäsche
    providers.ts      Nachrichten, Antworten, Vorgänge
    documents.ts, knowledge.ts, overview.ts
  workflow.ts         logMaxAction, updateMaxAction
  entities.ts         Sprung-Buttons
```

Dazu Verhaltenstests je Werkzeug nach dem Muster der Gemini-Tests vom
04.10.2026 (simulierte Datenbank statt simuliertem Google). Erst dann
Erweiterungen — jedes neue Werkzeug wird eine Datei mit Definition, Ausführung
und Test.

---

## 6. Abfragen für die nicht geprüften Befunde

```sql
-- B7/B8: Laufzeitangaben und Uhrzeiten im Feld funktion
select aktion, schritt_nr, funktion from max_ablaeufe
where funktion ilike '%STAND:%' or funktion ~ '\d{2}:\d{2}';

-- B9: Schritte, die seit Wochen auf 'pruefen' stehen
select aktion, schritt_nr, schritt, umsetzung from max_ablaeufe where umsetzung = 'pruefen';

-- B10/B11: gelerntes Wissen, nach Herkunft und Kategorie
select term, category, created_by, left(meaning, 80) from assistant_knowledge
where is_active order by category, term;

-- N4 (a): alle Trigger auf service_tasks — setzt einer beim INSERT einen Dienstleister?
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.service_tasks'::regclass and not tgisinternal;

-- N4 (b): angenommene Anfragen, deren Reinigung ohne Dienstleister ist
select st.id, st.scheduled_date, st.status from service_tasks st
join bookings b on b.id = st.booking_id
where b.source = 'inquiry' and st.provider_id is null;

-- N1: bereits überschriebene Anfragetexte
select id, guest_name, message from booking_inquiries where message like '[Abgelehnt:%';
```

---

*Erstellt am 04.10.2026. Grundlage für die KI-Erweiterungen; ersetzt als
Arbeitsstand die Fassung vom 05.08.2026.*
