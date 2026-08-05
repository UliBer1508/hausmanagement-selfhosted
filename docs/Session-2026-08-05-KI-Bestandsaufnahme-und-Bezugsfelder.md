# Session 05.08.2026 — KI-Bestandsaufnahme und die Bezugsfelder-Kette

**Repo:** `hausmanagement-selfhosted`
**Anlass:** Vor dem geplanten Ausbau des KI-Systems sollte der Ist-Zustand
vollständig gelesen, verstanden und dokumentiert werden.
**Ergebnis:** 12 Befunde erhoben, 4 behoben, 1 entschärft. Eine gemeinsame
Wurzel gefunden, die zwei davon erklärte.

---

## Der Einstieg: eine Meldung, die 15 Tage lang wiederkam

Die Morgen-Übersicht meldete seit dem 21.07. jeden Tag „Teuni hat nicht
geantwortet – Hubert Middelbos". Die Frage war, warum das nicht aufhört.

**Antwort:** Weil es nicht aufhören kann. Ein `max_actions`-Vorgang mit
`status='ueberfaellig'` verlässt diesen Zustand nur auf zwei Wegen — durch eine
Provider-Antwort (Trigger) oder durch eine ausdrückliche Anweisung von Uli
(`update_provider_action`). Es gibt keinen zeitbasierten Automatismus.
`morning-summary` liest bei jedem Lauf **alle** überfälligen Zeilen, ohne
Merk-Logik und ohne Verfallsdatum.

Der Vorgang wurde im Chat geschlossen („Schließ den Vorgang für Hubert
Middelbos") und der Erfolg **in der Datenbank belegt**, nicht an Max' Antwort
geglaubt: `status='abgeschlossen'`, `last_step` = „Von Uli geschlossen (keine
Antwort, 'lass es')" — wortwörtlich der String aus `executeUpdateProviderAction`,
also nur durch einen echten Tool-Aufruf erklärbar.

**Lehre:** Ein Zustand ohne Zeitgrenze ist keine Warnung, sondern eine Ablage.
Und Max' Erfolgsmeldung nannte weder Vorgangsart noch Datum noch Haus — bei
mehreren gleichnamigen Vorgängen wäre ein Fehlgriff unbemerkt geblieben.

---

## Die gemeinsame Wurzel: `related_task_id` vs. `related_linen_order_id`

Drei zunächst unabhängig wirkende Befunde hatten dieselbe Ursache. Die
geschlossene Kommunikationskette kennt zwei Bezugsfelder:

| Gegenstand | Feld | zeigt auf |
|---|---|---|
| Reinigung | `related_task_id` | `service_tasks` |
| Wäschebestellung | `related_linen_order_id` | `linen_orders` |

Am 16.07.2026 wurde die Wäschekette aus der Reinigungskette **gespiegelt**.
Angepasst wurden damals: das Teuni-Portal, die Migration, der Reply-Trigger, der
Handler und ein neuer Prompt-Block. Nicht angepasst wurden drei Stellen, die
seither auf die falsche Spalte zeigten:

1. **`max_ablaeufe`** — `create_linen_for_booking` Schritt 6 und
   `update_linen_for_booking` Schritt 4 schrieben „send_provider_message (an
   Teuni, mit `related_task_id`)".
2. **Die Tool-Beschreibung von `read_provider_replies`** — sie beschrieb sich
   gegenüber Gemini als „verknüpft jede mit der Reinigung über
   `related_task_id`", obwohl die Funktion seit dem 16.07. beide Typen liefert
   (`typ=reinigung` / `typ=waesche`). Erweitert worden waren damals nur die
   Funktion und der Rückgabe-Hinweis, nicht die Beschreibung.
3. **`max-linen-reminders`** — hängte Nachricht *und* `max_actions`-Vorgang an
   `related_task_id`, also an die Reinigung.

Punkt 3 war der folgenschwerste, weil daraus zwei weitere Fehler folgten.

**Der Beleg für die richtige Absicht steht im Portal-Repo**
(`fresh-spin-portal-selfhosted/src/hooks/usePortalMessages.ts`):

> „Teuni ist die WÄSCHE-Seite, daher trägt Max' Nachricht ihren Bezug in der
> Regel in `related_linen_order_id` — nicht in `related_task_id` (das ist die
> Reinigungs-Spalte)."

Das Portal hielt sich daran, der Cron-Job nicht.

---

## Was aus dem falschen Schlüssel folgte

### Kollision zweier Vorgänge (B5)

`max-cleaning-reminders` und `max-linen-reminders` gehen **dieselbe** Menge
durch (`service_tasks`, `status='scheduled'`) und legten beide einen
`max_actions`-Vorgang mit **derselben** `related_task_id` an —
`cleaning_termin_check` und `linen_termin_check`.

Der Reply-Trigger `max_actions_on_provider_reply` sucht mit
`ORDER BY created_at DESC LIMIT 1` und **ohne Filter auf `provider_id`**.
Antwortet einer der beiden Dienstleister, wird der jeweils neuere Vorgang als
„beantwortet" markiert — unabhängig davon, wer geantwortet hat. Der andere
bleibt stehen und wird überfällig.

### Der stille Sprung über den Reinigungsdienstleister (B6)

| | Vorlauf | Fenster | Spam-Prüfung |
|---|---|---|---|
| Teuni (Wäsche) | 5 Tage | heute…+5 | `related_task_id` **+ `provider_id`** |
| Amela (Reinigung) | 3 Tage | heute…+3 | `related_task_id`, **ohne** `provider_id` |

Teunis Fenster enthält Amelas vollständig und öffnet zwei Tage früher. Wenn
Amelas Fenster aufging, fand ihre Prüfung Teunis Nachricht auf derselben
`related_task_id`, wertete sie als „schon gefragt" und übersprang — **der
Reinigungsdienstleister wäre nie gefragt worden.** Ohne Fehlermeldung; der Cron
meldete Erfolg und zählte den Fall unter `uebersprungen_schon_erinnert`.

Der Fehler war stumm, weil beide Automatiken abgeschaltet sind (Amela und Teuni
werden von Uli erst noch eingearbeitet). Er hätte in dem Moment zu wirken
begonnen, in dem beide wieder eingeschaltet werden.

### Reihenfolge-Falle

**B6 verdeckte B5.** Weil Amelas Vorgang gar nicht erst entstand, gab es auch
keine Kollision. Hätte man nur B6 repariert, wären ab sofort zwei Vorgänge mit
derselben ID entstanden — und B5 wäre sofort aktiv geworden. Deshalb wurde an
der Wurzel angesetzt statt an den beiden Symptomen.

---

## Was gebaut wurde

### 1. Hinweis in der Überfällig-Meldung (`morning-summary/index.ts`)

Die Meldung sagt jetzt, wie man sie beendet — mit genau den drei
Formulierungen, die den drei Zweigen der Prompt-Regel entsprechen:
„nochmal nachfragen", „noch warten", „schließ den Vorgang für <Gast>".

Der Zustand selbst bleibt unverändert; das ist bewusst eine Milderung, keine
Lösung. Die Entscheidung über eine automatische Eskalation steht aus.

### 2. Bezugsfeld in der SOLL-Definition (`37_max_ablaeufe_waesche_bezug_korrektur.sql`)

Beide Zeilen nennen jetzt `related_linen_order_id` mit ausdrücklichem
Warnhinweis. Der Baustein „Tool send_provider_message" blieb am Textanfang
stehen, damit die Regex der Kontrollfunktion ihn weiter findet — nach dem
Einspielen bestätigt: 37 Schritte geprüft, keine Abweichung.

### 3. Tool-Beschreibung und Prompt (`chat-assistant/index.ts`)

`read_provider_replies` beschreibt jetzt beide Bezugsarten und nennt für Wäsche
`reschedule_linen_delivery`. Die Prompt-Regel zu `send_provider_message` sagt
ausdrücklich, dass die Felder nicht austauschbar sind.

Jede Behauptung der neuen Beschreibung wurde vorher gegen den Code belegt:
Rückgabefeld `bezug` (Z. 2611), `typ`-Werte (Z. 2578/2597), `null`-Fall
(Z. 2568), Existenz von `reschedule_linen_delivery` (Z. 1710/1354).

### 4. Bezug auf die Wäschebestellung (`max-linen-reminders/index.ts`)

- `linen_orders`-Abfrage lädt zusätzlich `id` (neu gebrauchtes Feld muss neu
  angefordert werden — Lessons 8.3) und schließt `cancelled` aus
- Reihenfolge getauscht: Bestellung ermitteln **vor** dem Spam-Schutz, weil sie
  jetzt dessen Schlüssel ist
- Spam-Schutz, Nachricht und `max_actions`-Vorgang tragen
  `related_linen_order_id`; das Reinigungsdatum steht in `details`
- Der Vorgang bekommt **bewusst nicht zusätzlich** `related_task_id` — sonst
  entstünde die Kollision erneut, weil der Trigger dieses Feld zuerst prüft
- Neuer Fall: keine Wäschebestellung → **nicht senden**, sondern zählen und im
  Ergebnis benennen (`ohne_waeschebestellung`). Ohne Bezug entstünde ein
  Vorgang, den niemand zuordnen oder schließen kann; zuständig für den Fall ist
  ohnehin `check_upcoming_bookings` („keine Wäsche bestellt")

### 5. Fortschreiben genau eines Vorgangs (`chat-assistant/index.ts`)

`updateMaxAction` enthielt ein **UPDATE ohne Begrenzung**:

```javascript
q = q.eq('related_task_id', match.related_task_id as string);
const { error } = await q;      // kein .limit(), kein .select()
```

Der Patch enthält `status`, `waiting_for` und `due_at` — er wurde also unbesehen
auf alle Vorgänge derselben Reinigung geschrieben. Eine Terminfrage an den
Reinigungsdienstleister setzte damit `waiting_for='amela'` auch auf einen
Wäsche-Vorgang, der in Wahrheit auf Teuni wartete.

Jetzt: genau eine Zeile, ausgewählt als neuester **offener** Vorgang
(`wartet_provider` / `ueberfaellig` / `wartet_uli`), hilfsweise der neueste
überhaupt. Mit `.select()` und Prüfung auf null betroffene Zeilen (AGENTS.md).

Der Zwilling `appendWorkflowStep` nahm bisher immer den neuesten — zwei
Funktionen mit derselben Mehrdeutigkeit und unterschiedlichem Verhalten. Beide
haben jetzt dieselbe Auswahlregel (`OFFENE_STATUS`) und dieselbe Prüfung.

---

## Verifikation

| Glied | Beleg |
|---|---|
| Basis war der echte `main`-Stand | Blob-SHAs gegen GitHub-API abgeglichen, vor **und** nach jedem Upload |
| Nur gewollte Änderungen | byte-genauer Diff vor der Auslieferung |
| Syntax | esbuild je Datei (deckt **keine** Spaltenexistenz ab) |
| Deploy erreichte die neuen Fassungen | `Select-String` auf Kennzeichen im lokalen Repo nach `git pull` |
| SOLL-Korrektur wirksam | Kontrollabfrage auf `max_ablaeufe` |
| Selbstprüfung unbeschädigt | „37 Schritte geprüft, keine Abweichung" |
| **Neuer Bezug an echten Daten** | Testlauf `max-linen-reminders` (`dry_run`, nichts gesendet): `related_linen_order_id: 001c1a7b-…`, Lieferdatum 08.08. korrekt aus derselben Bestellung, `ohne_waeschebestellung: 0`, 1 von 2 Reinigungen wegen gelieferter Wäsche übersprungen |

Eine Byte-Differenz beim `chat-assistant` (176.914 lokal vs. 172.967 auf GitHub)
war **kein** Fehler: die Differenz betrug exakt 3.947 = die Zeilenzahl der Datei,
also die CRLF-Umwandlung durch `core.autocrlf`. Trotzdem wurde zusätzlich am
Textinhalt geprüft — Arithmetik ist ein Indiz, kein Beleg.

---

## Nebenbefunde

- **`max_actions` fehlt in `types.ts`.** Die Tabelle wurde per SQL-Editor
  angelegt, die Typen nie neu generiert. Die Regel „nie einen Spaltennamen ohne
  Bestätigung in `types.ts` verwenden" ist für diese Tabelle nicht erfüllbar —
  verbindlich sind hier die SQL-Dateien.
- **`21_…add_related_linen_order_id.sql` fehlt im Repo.** Die Session-Doku vom
  16.07. nennt die Datei, in `supabase/SQL/` klafft zwischen 14 und 22 eine
  Lücke. Die Spalte existiert, ihre Definition ist nirgends nachlesbar.
- **`MaxActionsPanel.tsx` gruppiert nur nach `related_task_id`** (Z. 536),
  obwohl der Kommentar „Reinigung/Wäsche" verspricht. Wäsche-Vorgänge erscheinen
  als unzusammenhängende Einzelkarten. Reine Darstellung.
- **`waiting_for` wird per Namens-Regex gebildet** (`/teuni/i`, `/amela/i`),
  in `chat-assistant` fällt Boris auf `'provider'` zurück. Funktioniert, ist aber
  gegen neue Dienstleister nicht robust.
- **`assistant_knowledge` enthält eine von Max selbst geschriebene Regel**
  („erstelle eine Wäschebestellung" → „immer direkt aufrufen, ohne die Automatik
  zu prüfen", `created_by = max`), die in Spannung zur Prompt-Regel „Frage IMMER
  zuerst" steht.

---

## Offen / für später

1. **B4** — Wäsche-Terminfragen aus dem Chat erzeugen keinen verfolgbaren
   Vorgang. `executeSendProviderMessage` prüft im Workflow-Zweig nur
   `related_task_id`; der als „UNERREICHBAR" kommentierte `else`-Zweig ist über
   den Wäsche-Weg sehr wohl erreichbar.
2. **B6-Härtung** — `.eq('provider_id', provider.id)` in der Spam-Prüfung von
   `max-cleaning-reminders`. Nicht mehr akut, aber Vorsorge.
3. **B1-Entscheidung** — soll ein überfälliger Vorgang nach n Tagen automatisch
   geschlossen werden oder eskalieren?
4. **Trigger-Härtung** — bei mehreren Verschiebungen derselben Reinigung nimmt
   `max_actions_on_provider_reply` weiterhin den neuesten. Vertretbar, aber eine
   Bevorzugung offener Vorgänge wäre robuster.
5. **`save_knowledge`** — Selbstmodifikation ohne Regelwerk (welche
   `category` darf Max selbst schreiben?).

---

## Die Lehre für künftige Spiegelungen

Alle inhaltlichen Befunde dieser Sitzung betrafen die Wäsche-/Teuni-Seite. Die
Reinigungskette war durchgehend sauber. Das ist kein Zufall: Beim Spiegeln einer
Kette bleiben genau die Stellen liegen, an denen sich Original und Kopie
**unterscheiden** — die Tabelle, das Statuswort, das Bezugsfeld.

**Das Doppelgänger-Prinzip aus `AGENTS.md` gilt auch auf Ketten-Ebene:** Wer
eine Kette spiegelt, muss anschließend jeden Unterschiedspunkt einzeln
durchgehen — nicht die Stellen prüfen, an denen beide gleich sind.

Und: **Die tägliche Wahrheitsprüfung meldete an diesem Morgen für alle 66 Zeilen
`ok`, während B1, B4, B5 und B6 gleichzeitig aktiv waren.** Sie prüft, ob die
genannten Bausteine existieren — nicht, ob die Ketten fachlich richtig laufen.
Das ist ihre Bauart, kein Fehler. Sie darf nur nicht mit einer Gesundheitsaussage
verwechselt werden.

---

*Erstellt 05.08.2026. Fortführung der Session-Reihe (10.07., 11.07., 13.07.,
16.07., 27.07.). Vollständige Bestandsaufnahme in
`docs/Bestandsaufnahme-KI-System-2026-08-05.md`.*
