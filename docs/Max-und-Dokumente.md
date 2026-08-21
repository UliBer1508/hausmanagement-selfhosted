# Max und die Dokumentenverwaltung

> **Stand:** 21.08.2026 · Repo `hausmanagement-selfhosted`
> **Status:** Stufe 1 und 2 im Betrieb. Stufe 3 (Inhalt lesen) ist geplant,
> aber nicht gebaut.
>
> Ergänzt `docs/Dokumentenverwaltung-OneDrive.md` (die Ablage selbst) um die
> Frage, wie Max daran kommt.

---

## 1. Kurzfassung

- **Max liest nur die Datenbank, nie OneDrive.** `documents` trägt Name, Typ,
  Bezug, Pfad und `onedrive_web_url` — für Suchen und Verweisen reicht das.
- **Zwei Wege:** ein eigenes Suchwerkzeug, und Dokumente als Beiwerk in den
  drei bestehenden Suchen.
- **Max kennt den INHALT nicht.** Das steht ausdrücklich in der
  Werkzeugbeschreibung, damit er keine Rechnungssumme erfindet.

---

## 2. Stufe 1 — `search_documents`

Ein Werkzeug, rein lesend, im Muster von `search_cleaning_tasks`.

```
search_documents({
  objekt?:    "Boris" | "Venediger" | "Gemeinde Neukirchen",
  typ?:       "Rechnung",
  von?:       "2026-08-01",
  bis?:       "2026-08-31",
  dateiname?: "RG-0001",
  limit?:     20
})
```

### Namensauflösung

`objekt` ist ein **Name, keine Kennung**. Das Werkzeug sucht denselben Namen
gleichzeitig in `service_providers`, `houses` und `document_vendors` und
filtert danach die passende Spalte in `documents` — `provider_id`,
`house_id` oder `vendor_id`.

Die drei Abfragen laufen in einem `Promise.all`, nicht nacheinander.

**Bei mehreren Treffern wird nicht geraten.** Das Werkzeug liefert
`mehrdeutig: true` samt Trefferliste, und Max legt sie zur Auswahl vor. Das
ist die Regel aus `max_ablaeufe` („bei Mehrdeutigkeit IMMER nachfragen"),
dieselbe wie bei mehrdeutigen Gastnamen.

### Rückgabe je Treffer

`id`, `dateiname`, `typ`, `gehoert_zu`, `ordner`, `web_url`, `abgelegt_am`.

`gehoert_zu` fällt in dieser Reihenfolge zurück: Dienstleister, Vendor, Haus.
Ein Dokument trägt höchstens einen Bezug, die Reihenfolge ist also nur
Absicherung.

### Ein Detail beim Datum

`bis` ist ein Tag, `created_at` ein Zeitstempel. Deshalb hängt das Werkzeug
`T23:59:59` an — ohne das fiele der letzte Tag des Zeitraums heraus.

---

## 3. Stufe 2 — Dokumente als Beiwerk

Die drei bestehenden Suchwerkzeuge liefern jetzt mit, welche Dokumente an
einem Treffer hängen:

```
dokumente: [{ id, name, typ }],     // höchstens drei
dokumente_gesamt: 7
```

Betroffen: `search_bookings` (über `booking_id`), `search_cleaning_tasks`
(`service_task_id`), `search_linen_orders` (`linen_order_id`).

> ⚠️ **Doppelgänger.** Drei Werkzeuge mit demselben Muster — genau die Lage,
> in der hier schon einmal eines vergessen wurde. Die Anreicherung steht
> deshalb **einmal** in `dokumenteAnhaengen()` und wird dreimal aufgerufen.
> Wer ein viertes Suchwerkzeug ergänzt, ruft dieselbe Funktion auf.

### Drei Entscheidungen in `dokumenteAnhaengen()`

**Eine Abfrage für alle Treffer.** Die Kennungen werden gesammelt und über
`.in(spalte, ids)` in einem Zug geholt — nicht je Treffer eine Abfrage.

**Knapp halten.** Nur `id`, Name und Typ. Pfad und URL würden Max' Kontext
füllen, ohne der Antwort zu helfen. Wer mehr will, fragt nach — dann greift
`search_documents`.

**Fehler sind nicht tödlich.** Schlägt die Dokumentenabfrage fehl, wird der
Fehler protokolliert und die Suche liefert trotzdem ihr eigentliches
Ergebnis. Eine Buchungssuche darf nicht daran scheitern, dass die Beiwerk-
Abfrage klemmt.

---

## 4. Der Knopf im Chat

`buildEntityLinks` erzeugt für `search_documents` bis zu fünf Links vom Typ
`document`. Anders als die übrigen Typen ist das **kein Tabwechsel**, sondern
ein externer Verweis — die Datei liegt nicht in der App. Der Link trägt
deshalb ein zusätzliches Feld `url`.

In `ChatMessage.tsx` wurde der Typ ergänzt:

```ts
type: 'booking' | 'cleaning_task' | 'laundry_order' | 'email_draft' | 'document';
url?: string;   // nur bei 'document'
```

und im Klick-Verteiler:

```ts
case 'document':
  if (link.url) window.open(link.url, '_blank', 'noopener,noreferrer');
  break;
```

`noopener,noreferrer`, weil das Ziel eine fremde Seite ist.

---

## 5. Was Max ausdrücklich NICHT kann

In der Werkzeugbeschreibung steht wörtlich:

> Den INHALT eines Dokuments kannst du nicht lesen; wenn Uli danach fragt,
> sage das ehrlich und biete den Knopf zum Öffnen an.

Ohne diesen Satz besteht die Gefahr, dass Max aus Dateiname und Typ eine
Rechnungssumme herleitet. Bei einer Datei namens `Boris_Rechnung_August.pdf`
liegt das nahe genug, dass man es nicht dem Zufall überlassen sollte.

Fällt Stufe 3 später weg oder kommt sie hinzu, muss dieser Satz mitgeändert
werden.

---

## 6. Verhältnis zu `max_ablaeufe`

`max_ablaeufe` enthält eine Selbstprüfung (`systempruefung`, Edge Function
`max-ablaeufe-pruefen`): Sie verlangt für jedes **schreibende** Werkzeug
einen definierten Ablauf. Lesewerkzeuge sind ausdrücklich als unkritisch
geführt und namentlich aufgezählt.

`search_documents` ist rein lesend und braucht deshalb **keinen Eintrag** in
`max_ablaeufe`. Beim nächsten Lauf der Prüfung erscheint es in der Liste der
unkritischen Lesewerkzeuge — dann sind es dreizehn statt zwölf.

Stufe 3 wäre ebenfalls lesend (die Datei wird geöffnet, nicht geändert) und
bräuchte auch keinen Ablauf.

---

## 7. Was beim Bauen geprüft wurde

- Alle verwendeten Spalten sind in `51_dokumentenverwaltung.sql` bzw.
  `52_dokumente_ablageorte.sql` belegt.
- Werkzeugdefinition, Verteiler-Fall, Executor und Link-Zweig kommen je
  genau einmal vor.
- `dokumenteAnhaengen()` einmal definiert, dreimal aufgerufen.
- esbuild-Syntaxprüfung beider Dateien (deckt **nur** Syntax ab, nicht die
  Existenz von Spalten oder das Laufzeitverhalten).

**Die deterministischen Regex-Pfade existieren seit 17.07.2026 nicht mehr** —
alles läuft über Gemini mit `mode AUTO`. Eine Dokumentenfrage kann also nicht
von einem Regex abgefangen werden. Das war beim Entwurf die Sorge und ist
gegenstandslos.

> Randnotiz: `docs/chat-assistant-aenderungen.md` beschreibt in Teil A2
> Änderungen an den Pfaden A und B, die es nicht mehr gibt. Teil A1
> (`reschedule_cleaning` in `buildEntityLinks`) ist umgesetzt.

---

## 8. Stufe 3 — geplant, nicht gebaut

Max soll den Inhalt lesen und verstehen können, **ohne Zerlegung**: keine
Positionen, keine Beträge in Spalten, keine Datensätze. Die Antwort ist Text.

Vollständiger Entwurf: `docs/Vorschlag-Max-Dokumente.md`, Abschnitt „Stufe 3".

Zwei Befunde daraus, die vor dem Bauen gelten:

**`_shared/gemini.ts` kann heute keine Datei schicken.** `GeminiPart` kennt
nur `text`, `functionCall` und `functionResponse`. Es fehlt `inlineData`.
Die Ergänzung ist additiv, betrifft aber einen gemeinsamen Helfer — danach
sind **alle** Gemini-nutzenden Functions neu zu deployen.

**Word und Excel gehen nicht.** Gemini liest PDF, JPEG, PNG und Text inline.
Bei anderen Formaten muss das Werkzeug das klar sagen.

Offene Entscheidung: ob eine gelesene Zusammenfassung in
`documents.ai_summary` abgelegt wird. Spart Zeit und Kosten, ist aber
gespeicherter Inhalt — keine Zerlegung, aber mehr als Metadaten.

---

## 9. Prüfabfragen und Testfragen

Nach dem Deploy im Chat:

| Frage | Erwartung |
|---|---|
| „Hast du die Rechnung von Teuni?" | findet die abgelegte Datei, zeigt Knopf |
| „Welche Dokumente gibt es zu Boris?" | keine, solange dort nichts abgelegt ist |
| „Was steht auf der Teuni-Rechnung?" | ehrliche Absage plus Knopf |
| „Zeig mir die Buchung von …" | Buchung samt anhängender Dokumente |

In der Datenbank:

```sql
-- Was hängt woran?
select d.file_name, t.name as typ,
       coalesce(sp.name, v.name, h.name) as gehoert_zu,
       d.booking_id, d.service_task_id, d.linen_order_id
from documents d
left join document_types    t  on t.id  = d.document_type_id
left join service_providers sp on sp.id = d.provider_id
left join document_vendors  v  on v.id  = d.vendor_id
left join houses            h  on h.id  = d.house_id
order by d.created_at desc;
```
