# Max und die Dokumentenverwaltung — Umsetzungsvorschlag

> Stand 21.08.2026. Ausgangslage: `documents`, `document_types`,
> `document_vendors` und `document_locations` sind im Betrieb.
> In `chat-assistant/index.ts` (4.099 Zeilen, rund zwanzig Werkzeuge) kommt
> `documents` **null Mal** vor — Max kennt die Ablage bisher gar nicht.
>
> Drei Stufen, aufeinander aufbauend, jede für sich nutzbar.

---

## Vorbemerkung: was Max wofür braucht

| Stufe | Braucht OneDrive? | Braucht Gemini? | Aufwand |
|---|---|---|---|
| 1 · Suchen und verweisen | nein | nein | klein |
| 2 · Von sich aus erwähnen | nein | nein | klein, aber an vielen Stellen |
| 3 · Inhalt lesen und verstehen | ja | ja | mittel, mit einer Vorarbeit |

Stufe 1 und 2 sind reine Datenbankabfragen. Erst Stufe 3 lädt eine Datei.

---

## Stufe 1 — Suchen und verweisen

### Werkzeug `search_documents`

Nach dem Muster von `search_cleaning_tasks`: Uli nennt Namen, Max beschafft
sich die Kennungen selbst.

```
search_documents({
  objekt?:    "Boris" | "Venediger" | "Gemeinde Neukirchen",
  typ?:       "Rechnung",
  von?:       "2026-08-01",
  bis?:       "2026-08-31",
  dateiname?: "RG-0001",
  limit?:     10
})
```

**Auflösung von `objekt`:** ein Name, drei mögliche Tabellen. Max soll nicht
fragen müssen, ob „Boris" ein Dienstleister oder ein Vendor ist. Das Werkzeug
sucht in `service_providers`, `houses` und `document_vendors` und filtert
`documents` über die passende Spalte. Bei mehreren Treffern legt es sie zur
Auswahl vor — dasselbe Verhalten wie bei mehrdeutigen Gastnamen.

**Rückgabe je Treffer:** `id`, `file_name`, `typ`, `objekt` (Name und Art),
`onedrive_path`, `onedrive_web_url`, `created_at`.

### Verlinkung

`buildEntityLinks` (Zeile 3020) baut die Knöpfe unter Max' Antwort. Dort
kommt ein neuer Typ dazu:

```
{ id, type: 'document', label: 'RG-0001 in OneDrive öffnen', url: onedrive_web_url }
```

Der `email_draft`-Zweig zeigt bereits, dass Links Zusatzfelder tragen dürfen —
`url` fügt sich ein. Im Frontend muss `ChatMessage.tsx` den neuen Typ als
externen Link behandeln statt als internen Tabwechsel.

### Was Max damit kann

„Hast du die Boris-Rechnung von August?" → Datei, Ablageort, Knopf zum Öffnen.
„Welche Dokumente gibt es zum Venediger Chalet?" → Liste nach Typ.
„Gibt es schon eine Kurtaxenrechnung für 2026?" → ja oder nein, mit Beleg.

**Betroffene Dateien:** `chat-assistant/index.ts` (Werkzeug, Ausführung,
`buildEntityLinks`), `src/components/Chat/ChatMessage.tsx` (Linktyp).

---

## Stufe 2 — Von sich aus erwähnen

Wenn Max ohnehin über eine Buchung, Reinigung oder Wäschelieferung spricht,
soll er wissen, welche Dokumente daran hängen.

### Umsetzung

Die bestehenden Suchwerkzeuge liefern je Treffer eine kurze Liste mit:

```
dokumente: [{ id, name, typ }]   // höchstens drei, sonst nur die Anzahl
```

Betroffen sind `search_bookings`, `search_cleaning_tasks` und
`search_linen_orders`.

> ⚠️ **Doppelgänger.** Drei Werkzeuge mit demselben Muster — genau die Lage,
> in der bisher eines vergessen wurde. Die Anreicherung gehört in **eine**
> Hilfsfunktion, die alle drei aufrufen, nicht dreimal kopiert.

### Zwei Punkte, die dabei zu beachten sind

**Länge der Antwort.** Jeder Treffer wird größer, und Max' Kontext ist
begrenzt. Deshalb höchstens drei Dokumente je Objekt, nur Name und Typ, kein
Pfad und keine URL. Wer mehr will, fragt nach — dann greift Stufe 1.

**Eine Abfrage mehr.** Die Dokumente werden in einem Zug für alle Treffer
geholt (`in`-Abfrage über die Kennungen), nicht je Treffer einzeln.

---

## Stufe 3 — Inhalt lesen und verstehen

Max lädt die Datei, gibt sie Gemini und beantwortet damit eine Frage.
**Ohne Zerlegung:** es entstehen keine Positionen, keine Beträge in Spalten,
keine Datensätze. Die Antwort ist Text, wie ein Mensch ihn beim Lesen gäbe.

### Vorarbeit: `_shared/gemini.ts` erweitern

Heute kennt `GeminiPart` nur:

```ts
export interface GeminiPart {
  text?: string;
  functionCall?: { … };
  functionResponse?: { … };
}
```

Es fehlt `inlineData` — der Helfer kann derzeit **keine Datei** an Gemini
schicken. Nötig ist:

```ts
inlineData?: { mimeType: string; data: string };   // data = base64
```

Das ist eine additive Änderung; bestehende Aufrufe sind nicht betroffen.
`_shared/gemini.ts` wird aber von mehreren Functions genutzt — nach der
Änderung sind alle betroffenen neu zu deployen.

### Werkzeug `read_document`

```
read_document({
  document_id: "…",
  frage?: "Wie hoch ist der Gesamtbetrag?"
})
```

Ablauf in der Function:

```
1. documents lesen  -> onedrive_item_id, mime_type, size_bytes, file_name
2. Größe prüfen     -> über der Grenze: Abbruch mit Klartext
3. getAccessToken() -> aus _shared/onedrive.ts
4. graph GET /me/drive/items/{id}/content -> Bytes -> base64
5. callGemini mit inlineData + Frage
6. Antworttext zurückgeben
```

`chat-assistant` importiert `_shared/onedrive.ts` direkt. Der Umweg über
`onedrive-api` wäre ein zusätzlicher Netzaufruf ohne Gewinn — beide laufen
unter `service_role`.

### Grenzen, die im Werkzeug stehen müssen

**Dateigröße.** Gemini nimmt Dateien inline bis rund 20 MB Anfragegröße;
base64 vergrößert um ein Drittel. Vorschlag: **Grenze bei 12 MB**, darüber
eine verständliche Absage statt eines Fehlers aus der Tiefe.

**Dateiformate.** PDF, JPEG, PNG und einfacher Text funktionieren inline.
**Word und Excel nicht.** Bei solchen Dateien muss das Werkzeug klar sagen:
„Diese Datei kann ich nicht lesen" — und nicht schweigend etwas anderes tun.

**Kosten und Dauer.** Jeder Aufruf schickt die ganze Datei. Eine
zweiseitige PDF ist unkritisch, ein zwanzigseitiger Scan spürbar. Max sollte
das Werkzeug nur auf ausdrückliche Frage nutzen, nicht vorsorglich — das
gehört in die Werkzeugbeschreibung.

### Offene Entscheidung: merken oder jedes Mal neu lesen?

Wird dieselbe Rechnung dreimal gefragt, wird sie dreimal geladen und dreimal
gelesen. Vermeidbar mit einem Feld `documents.ai_summary` plus
`ai_summary_at`: beim ersten Lesen wird eine kurze Zusammenfassung abgelegt
und danach wiederverwendet.

**Dafür:** schneller, billiger, und Max kann in Stufe 2 auch ohne Ladevorgang
sagen, worum es in einem Dokument geht.

**Dagegen:** eine Zusammenfassung ist gespeicherter Inhalt. Das ist keine
Zerlegung in Positionen — der Grundsatz bleibt gewahrt —, aber es ist mehr
als reine Metadaten. Und eine veraltete Zusammenfassung wäre schlimmer als
keine, falls eine Datei in OneDrive ersetzt wird.

**Ich brauche dazu Ihre Entscheidung.**

---

## Reihenfolge und Umfang

| Schritt | Inhalt | Berührt |
|---|---|---|
| 1 | `search_documents` + Linktyp | `chat-assistant`, `ChatMessage.tsx` |
| 2 | Dokumente in den drei Suchwerkzeugen | `chat-assistant` |
| 3a | `inlineData` in `_shared/gemini.ts` | `_shared`, alle Gemini-Functions neu deployen |
| 3b | `read_document` | `chat-assistant` |
| 3c | *optional* `ai_summary` | SQL, `chat-assistant` |

Nach jedem Schritt ist der Stand für sich benutzbar. Ich würde einzeln
liefern und dazwischen prüfen — Stufe 1 verändert nichts Bestehendes, Stufe 2
fasst drei vorhandene Werkzeuge an, Stufe 3 berührt einen gemeinsamen Helfer.

---

## Was ich vor dem Bauen brauche

**Zwischenspeicher ja oder nein?** Siehe oben — die einzige Entscheidung mit
Langzeitfolgen.

**Darf Max jedes Dokument lesen?** Oder soll es Typen geben, die er nicht
öffnet? Mir fällt kein Beispiel ein, aber Sie kennen die Inhalte.

**Pflichtlektüre vor der Umsetzung.** Nach Ihren Projektregeln gehört vor
jede Änderung am `chat-assistant` die Abfrage von `max_ablaeufe` und
`assistant_knowledge` sowie `docs/chat-assistant-aenderungen.md` und
`docs/Prozess-Reinigung-Terminaenderung.md`. Die deterministischen Pfade dort
umgehen Gemini vollständig; ich muss wissen, ob eine Dokumentenfrage in einen
davon geraten kann, bevor ich ein Werkzeug hinzufüge.
