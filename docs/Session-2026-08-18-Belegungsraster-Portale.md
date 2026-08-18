# Session 2026-08-18 — Belegungsraster in die Dienstleister-Portale

> Zweck: Nachvollziehbarkeit für künftige Sitzungen (Mensch oder KI).
> Ergänzt `docs/CODE-INDEX.md` Abschnitt **13c** (Modul „Kalender", heute
> nachgetragen) und korrigiert `docs/Session-2026-07-27-Kalender-Neubau.md`,
> Abschnitt E.

---

## 1. Ausgangslage

Der Kalender der Hausverwaltung (`HouseStackedCalendar.tsx`) zeigt Belegung und
Auftrag im selben Bild: Zeile = Haus, Spalte = Tag, diagonal geteiltes Feld =
An-/Abreise. Die drei Dienstleister-Portale zeigten stattdessen eine reine
**Terminliste** — „am 16.08. Wald Chalet, 11:00".

Der Unterschied ist nicht kosmetisch. Die Liste beantwortet, **wann** gearbeitet
wird, aber nicht, **warum** und ob der Termin Spielraum hat:

- Wechseltag (abreisen und anreisen am selben Tag) → nicht verschiebbar
- Abreise ohne sofortige Anreise → verschiebbar
- Wäsche noch nicht geliefert → kann gar nicht gereinigt werden

Auftrag von Uli: Raster zuerst im **Boris-Portal**, nach erfolgreichem Test
Amela und Teuni.

---

## 2. Was in den Portalen gefunden wurde (Boris)

| Befund | Beleg | Folge |
|---|---|---|
| Kalender ohne `provider_id`-Filter | `src/pages/Calendar.tsx` importiert `PROVIDER_ID` nicht; im ganzen Repo tun das nur `usePortalMessages.ts`, `useBookings.ts`, `CleaningPortal.tsx` | Die dokumentierte Trennung Amela/Boris war im Kalender nicht umgesetzt |
| Reinigungen ohne Buchung fehlten | Termine wurden nur aus `booking.service_tasks` gebaut; `standaloneCleanings` (`booking_id is null`) blieb ungenutzt | Fensterreinigung — einer der zwei Gründe für Boris' Portal — war im Kalender unsichtbar |
| `useAllBookings` ohne `rental_type`-Filter | `useHouses.ts:25` filtert auf `tourist`, die Buchungsabfrage nicht | Für die Terminliste egal, im Raster kämen Dauermietobjekte als Zeilen mit |
| `linen_orders` nicht geladen | nur `useBookings` lud sie | Der Kalender kannte den Wäschestatus nicht |
| Eigene Hausfarben-Tabelle | Wald grün `#22c55e`, Venediger violett `#a855f7` — gegen cyan/amber in Hausverwaltung und Website; Teuni vergibt Farben per Hash aus der `house_id` | Dasselbe Haus hatte in vier Systemen drei bis vier Farben |

### Wichtiger Prozessfehler in dieser Sitzung

Der erste Befund wurde zunächst als „Boris sieht Amelas Reinigungen"
**behauptet**. Belegt war nur „im Frontend-Code des Kalenders steht kein
Filter". Ob das durchschlägt, entscheidet die RLS-Policy auf `service_tasks`,
die im Repo nicht einsehbar ist. Uli hat den Fehler sofort bemerkt.

Das ist exakt `ARBEITSWEISE-CLAUDE-LESSONS.md`, Abschnitt **10.1 — Abwesenheit
ist niemals ein Beleg**, angewendet auf Code statt auf Cron-Einträge. Die Regel
stand da, sie wurde vorher gelesen, und sie wurde trotzdem nicht angewendet.
Richtig wäre gewesen: „im Kalenderpfad fehlt der Filter; ob fremde Termine
erscheinen, hängt an der RLS und ist im Repo nicht entscheidbar."

---

## 3. Umgesetzt (Boris-Portal)

Vier Dateien, davon zwei neu:

| Datei | |
|---|---|
| `src/lib/belegung.ts` | **neu** — `getDayInfo`, `getCellStyle`, `getHouseColors`, `parseLocalDate`, `toDateKey` |
| `src/components/Belegungsraster.tsx` | **neu** — Darstellung, portalneutral |
| `src/hooks/useAllBookings.ts` | `rental_type`-Filter, `linen_orders`, Realtime-Kanal |
| `src/pages/Calendar.tsx` | Wochenansicht → Raster, Provider-Filter, Standalone-Reinigungen, Farben aus `belegung.ts` |

**Aufteilung eigene / fremde Aufgabe.** Die eigene Aufgabe bekommt ein Symbol in
der Zelle, die des anderen nur einen 4-px-Streifen am unteren Rand. Grund: auf
dem Handy sind sieben Spalten rund 48 px breit, zwei gleich große Symbole passen
nicht nebeneinander. Fachlich passt es ohnehin — der Dienstleister hat eine
Frage („muss ich hin?"), die zweite ist Kontext („kann ich überhaupt?").

**Paarung Reinigung ↔ Wäsche über `booking_id`, nicht über das Datum.** Die
Wäsche kommt typischerweise am Vortag; ein Datumsvergleich wäre eine Annahme
über die Vorlaufzeit. Der relationale Bezug ist derselbe Gedanke wie bei
`related_task_id` in Max' Kommunikationskette.

**Neu gegenüber der Hausverwaltung:**
- Roter Rahmen, wenn die Reinigung ansteht und die zugehörige Wäsche nicht
  geliefert ist — dieselbe Bedingung, die `max-linen-reminders` auswertet.
- Amberfarbener Kollisionspunkt, wenn beide Häuser am selben Tag eine Reinigung
  haben. Das steht seit dem 27.07.2026 als offener Punkt in
  `Session-2026-07-27-Kalender-Neubau.md`, Abschnitt 7, und ist in der
  Hausverwaltung weiterhin nicht gebaut. Von dort übernehmbar.

---

## 4. Korrektur an der Doku vom 27.07.2026

`Session-2026-07-27-Kalender-Neubau.md`, Abschnitt E, beschreibt mit Merksatz,
dass die Icons auf dem **echten Termin** (`scheduled_date` / `delivery_date`)
sitzen. Der Code macht seit demselben Tag das Gegenteil — Icons im ersten
Kästchen der Buchung, mit dem Kommentar „ZUORDNUNG UEBER DIE BUCHUNG
(27.07.2026, Vorgabe Uli)".

Die Doku beschreibt also den verworfenen Zwischenstand. Ein Korrekturhinweis
steht jetzt in Abschnitt E; der geltende Stand steht in `CODE-INDEX.md`,
Abschnitt 13c.

**Der Merksatz selbst bleibt richtig** und wurde hier erneut gebraucht: eine
Reinigung ohne Buchung (Fensterreinigung) hat keinen Anreisetag und kann nur auf
ihrem `scheduled_date` sitzen. Dieselbe fachliche Aufgabe, je nach Kontext eine
andere technische Anknüpfung.

---

## 5. Ablage-Befunde (nicht Kalender, aber beim Nachziehen aufgefallen)

### Hausverwaltung

| Datei | Befund |
|---|---|
| `docs/AGENTS.md` | Zweitfassung der Root-`AGENTS.md`, **veralteter Stand** („33 von 45 Abfragen", 13.08.). `PROJEKT-REGELN.md` sagt: AGENTS.md bleibt im Root. Löschen. |
| `docs/SQL-README.md` vs. `supabase/SQL/README.md` | Zwei Fassungen desselben Dokuments. Die in `docs/` ist die **neuere** (Lücke bei `reschedule_cleaning` als behoben vermerkt), die in `supabase/SQL/` die **ältere** (Lücke als offen). Pflichtlektüre laut `AGENTS.md` ist die ältere — wer der Regel folgt, hält einen behobenen Fehler für offen. Neuere Fassung nach `supabase/SQL/README.md` übernehmen, Kopie in `docs/` löschen. |
| `docs/ARBEITSWEISE-Abschnitt-10-EINFUEGEN.md` | Bereits in `ARBEITSWEISE-CLAUDE-LESSONS.md` eingearbeitet (Abschnitt 10 steht dort). Rest löschen. |
| `docs/alle doc zu hausverwaltung bis einschlieslich 8.7.26.zip` | 394 KB Archiv im Repo. Gehört nicht in die Versionsverwaltung. |
| `docs/index morning summary.txt` (25 KB), `docs/mailpreviewprovider.txt` (9 KB), `docs/deploy chat assistant.txt` | Quellcode und Kommandos als `.txt` in `docs/`. Gegen `CODING-GUIDE` B7. Der echte Code liegt in `supabase/functions/`; diese Kopien können auseinanderlaufen. |
| `docs/Supabase Snippet Untitled query.csv` | Abfrageergebnis ohne Bezug oder Datum. |
| `docs/portal-endpoints/` | Enthält `migration_partner_api_keys.sql`. Migrationen gehören nach `supabase/SQL/` bzw. `supabase/migrations/`, nicht nach `docs/`. |

### Boris-Portal

Siehe `doc/Boris Zweck Ablauf und Zusammenspiel_2.txt`, Abschnitt 8. Kurzfassung:
zwei Changelogs (Root-Fassung ist die alte Amela-Version), `README.md` heißt noch
„Amela Cleaning Portal" und verweist auf Lovable, eine leere Doku-Datei unter
`src/hooks/docs/`, und `src/components/PortalChat.tsx.txt` — eine vom Original
abweichende Textkopie einer Komponente direkt neben dem Original.

---

## 6. Offen

1. **Test im laufenden Boris-Portal.** Startseite muss unverändert sein, im
   Raster dürfen nur Boris' Termine stehen. „Deployt" ist nicht „geprüft".
2. **Übertragung nach Amela** (`Calendar.tsx` dort ist bis auf zwei Zeilen
   identisch), danach **Teuni** (dort ist die eigene Aufgabe die Wäsche, die
   Reinigung wird zur Information — dieselbe Komponente, getauschte Parameter).
3. **Hausverwaltung nachziehen:** `HouseStackedCalendar.tsx` bezieht die Logik
   weiterhin nicht aus `belegung.ts`. Solange das so bleibt, existiert
   „Wechseltag" zweimal. Reihenfolge bewusst so gewählt: erst im Portal
   beweisen, dann in der Hausverwaltung austauschen.
4. **Entscheidung offen:** ob Boris die Reinigungen der jeweils anderen Kraft als
   grauen Hinweis sehen soll. Aktuell: gar nicht, entsprechend der Portal-Doku.
5. **Kollisions-Markierung in der Hausverwaltung** — im Portal gebaut, hier seit
   27.07.2026 offen.
