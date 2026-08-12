# Konzept: Doppelte Gastdatenhaltung beseitigen

> **Ziel:** `guests` wird die einzige Quelle für Gastdaten. `bookings` speichert
> nur noch die `guest_id`. Die elf `guest_*`-Kopiespalten in `bookings`
> verschwinden.
>
> **Status:** Analyse abgeschlossen und gegen die laufende Datenbank verifiziert.
> Etappe 2 und 3 sind gebaut, aber noch nicht ausgerollt.
> Stand: 12.08.2026 · Repo-Stand geprüft gegen `main`

**Gelieferte Dateien zu diesem Konzept**

| Etappe | Datei | Zielpfad |
|---|---|---|
| 2 | `CreateBookingForm.tsx` | `src/components/Bookings/CreateBookingForm.tsx` |
| 3 | `40_gastdaten_entdopplung_etappe3.sql` | `supabase/SQL/` (im SQL-Editor ausführen) |
| 3b | `GuestEditDialog.tsx` | `src/components/Guests/GuestEditDialog.tsx` |

---

## 0. Vorgeschichte: der Plan von 2024 und warum er liegen blieb

Diese Umstellung ist **nicht neu**. Sie ist vollständig ausgearbeitet in
`Guest-Booking-Separation-Plan.md` (im Archiv
`docs/alle doc zu hausverwaltung bis einschlieslich 8.7.26.zip`), inklusive
DB-Migration, Typen, Hooks, Komponentenliste und Cleanup-SQL.

Das Dokument dokumentiert seinen eigenen Stillstand:

| Phase | Inhalt | Status laut Plan |
|---|---|---|
| 1 | `guests`-Tabelle, Daten migrieren, `guest_id` + Index | ✅ erledigt |
| 2 | TypeScript-Typen | ✅ erledigt |
| 3 | Hooks (`useGuests` …) + **Fallback-Logik** | ✅ erledigt |
| 4.1–4.3 | UI-Komponenten und Edge Functions umstellen | 🔄 begonnen |
| 5 | Alte Spalten löschen, `NOT NULL` | ⏳ nie erreicht |

**Warum es liegen blieb:** Die Phasen 1–3 sind die billigen. Phase 4 ist die
teure — rund 450 Lesestellen. Und genau an dieser Schwelle wirkte die
Sicherheitsmaßnahme aus Phase 3.3 gegen den Abschluss: Der Fallback
`booking.guests?.name || booking.guest_name` sorgte dafür, dass **alles
funktionierte**, auch ohne Phase 4. Damit gab es keinen Druck mehr,
weiterzumachen — bis der Stammgast-Bug am 11.08.2026 zeigte, dass „funktioniert"
und „ist richtig" nicht dasselbe sind.

Das ist das eigentliche Muster: **Eine gute Übergangslösung nimmt den Anlass
weg, die Übergangsphase zu beenden.** Der Plan hatte das sogar geahnt und
Phase 5 auf „erst nach 2–4 Wochen stabiler Nutzung" terminiert — eine Frist ohne
Termin und ohne Verantwortlichen.

**Warum es beim Weiterbauen nicht berücksichtigt wurde:** Der Plan liegt in
einem ZIP-Archiv und ist in keinem der Pflichtdokumente verlinkt.
`CODE-INDEX.md` nennt zwar `Database-Relational-Assessment.md` als „Tiefen-Doku",
aber weder Index noch `AGENTS.md` noch das MASTER-Dokument erwähnen, dass eine
Migration **unabgeschlossen** ist. Ein Agent, der die Pflichtlektüre vollständig
liest, erfährt davon nichts.

Konkret hat das am 11.08.2026 Schaden angerichtet: Beim Beheben des
Stammgast-Bugs wurde `src/lib/guestKeyHelpers.ts` angelegt — eine Schlüssel-
kaskade `guest_id → guest_email → guest_name`. Das ist **exakt dieselbe
Fallback-Logik wie Phase 3.3**, nur an einer weiteren Stelle. Statt die
Übergangsphase zu beenden, wurde sie zementiert und um einen Baustein erweitert.

**Konsequenz für dieses Konzept:** Es wird in `AGENTS.md` und `CODE-INDEX.md`
verlinkt, mit dem ausdrücklichen Hinweis, dass die Migration läuft und welche
Regel dabei gilt. Sonst wiederholt sich derselbe Vorgang.

---

## 1. Ausgangslage — was tatsächlich im System steht

### 1.1 Das Datenmodell ist doppelt

`bookings` trägt neben dem Fremdschlüssel `guest_id` zehn Spalten, die denselben
Sachverhalt beschreiben wie `guests`:

`guest_name`, `guest_email`, `guest_phone`, `nationality`, `guest_street`,
`guest_city`, `guest_postal_code`, `guest_birth_date`, `guest_travel_document`,
`guest_notes`

**`guest_contact_status` gehört NICHT dazu.** Sie hält fest, ob der Gast wegen
**dieser** Buchung kontaktiert wurde — eine buchungsbezogene Eigenschaft, keine
Gasteigenschaft. Der Plan von 2024 nimmt sie ausdrücklich von der Löschung aus,
und `trg_close_max_action_on_guest_contacted` hängt daran. Sie bleibt.

**`guest_notes`** steht nicht auf der Löschliste des ursprünglichen Plans —
vermutlich ein Versehen, da `guestHelpers.getGuestNotes()` sie als Kopie
behandelt (`guests.notes || booking.guest_notes`). Vor Etappe 6 zu entscheiden.

Die Fremdschlüsselbeziehung `bookings_guest_id_fkey → guests(id)` existiert und
ist korrekt. Das Problem ist nicht die Relation, sondern die Kopie daneben.

### 1.2 Datenlage (Messung 12.08.2026)

| Kennzahl | Wert |
|---|---|
| Buchungen gesamt | 123 |
| davon ohne `guest_id` | **0** |
| verschiedene Gäste | 116 |
| Buchungen ohne `guest_email` | 80 (65 %) |
| Abweichungen Kopie ↔ `guests` | 3 |

**Wichtigste Erkenntnis:** Die Relation ist datenseitig zu 100 % intakt. Der
Fallback in `src/lib/guestHelpers.ts` („Abwärtskompatibilität während der
Migration") hat keinen einzigen realen Anwendungsfall mehr.

Die 65 % ohne `guest_email` sind **kein Datenmangel** — Portalbuchungen liefern
Wegwerfadressen oder gar keine, und die echte Adresse kommt oft erst kurz vor
Check-in. Genau deshalb ist die E-Mail als Identitätsmerkmal ungeeignet und
`guest_id` das einzig taugliche Kriterium.

### 1.3 Der entscheidende Fund: Die Kopiespalten sind der Eingangskanal

Es existiert eine Trigger-Funktion **`sync_guest_from_booking()`**, angehängt als
`BEFORE INSERT OR UPDATE ON public.bookings`. Sie:

- steigt aus, wenn `NEW.guest_name` leer ist,
- sucht bei INSERT über eine fünfstufige Kaskade einen passenden Gast
  (Name+E-Mail → Name+Telefon → Name+Nationalität+Stadt → Name+Geburtsdatum →
  Name+seltene Nationalität),
- setzt `NEW.guest_id` auf den Treffer oder **legt einen neuen Gast an**,
- schreibt die Buchungs-Kopiespalten per `COALESCE` in `guests` (füllt nur
  Lücken, überschreibt nichts).

Bei UPDATE mit bereits gesetzter `guest_id` wird **nicht neu gematcht**, sondern
nur `guests` aktualisiert — dort allerdings `name` bedingungslos.

**Konsequenz für den Umbau:** Die Kopiespalten sind heute nicht nur Redundanz,
sie sind der Weg, auf dem Gäste überhaupt entstehen. Wer das Befüllen einstellt,
ohne den Trigger vorher zu ersetzen, legt die Gast-Erzeugung still. Die
naheliegende Reihenfolge „Schreibpfade umstellen → Spalten löschen" ist deshalb
**falsch**.

### 1.4 Trigger-Bestand — verifiziert am 12.08.2026

Im Repo standen **zwei** `CREATE TRIGGER`-Anweisungen für dieselbe Funktion. Die
Abfrage gegen `pg_trigger` zeigt: **nur einer existiert tatsächlich.**

| Trigger auf `bookings` | Funktion | feuert bei |
|---|---|---|
| `sync_booking_guest_trigger` | `sync_guest_from_booking` | BEFORE INSERT OR UPDATE |
| `trg_close_max_action_on_guest_contacted` | | AFTER UPDATE (nur `guest_contact_status`) |
| `trg_notify_booking_guest_count_change` | | AFTER UPDATE OF `number_of_guests` |
| `trg_reset_portale_geprueft` | | BEFORE UPDATE (nur Status/Check-in/Check-out) |
| `update_bookings_updated_at` | | BEFORE UPDATE |

`sync_guest_on_booking_change` aus Migration `20251217145322` wurde **nie
angelegt** — es läuft nichts doppelt. Die ursprünglich geplante Etappe 1
entfällt ersatzlos.

**Wichtig für Etappe 3:** Keiner der übrigen vier Trigger reagiert auf die
Gastfelder. Ein Schreiben in die Kopiespalten löst also keine Nebenwirkungen
aus — insbesondere setzt `trg_reset_portale_geprueft` die Portal-Quittung nicht
zurück, weil er nur auf Status und Zeitraum schaut.

### 1.5 `guests.email` ist auf DB-Ebene eindeutig — mit Folgen

Migration `20251217143027` legt an:

```sql
CREATE UNIQUE INDEX guests_email_unique
  ON public.guests(email) WHERE email IS NOT NULL AND email != '';
```

Das ist eine **latente Fehlerquelle im bestehenden Trigger**: Kommt eine Buchung
mit bekannter E-Mail, aber abweichender Namensschreibweise („C. Mueller" statt
„Christian Mueller"), scheitert Priorität 1 (Name **und** E-Mail), die übrigen
Stufen greifen nicht, und der `INSERT` verletzt den Index — **die gesamte
Buchung schlägt fehl**, nicht nur die Verknüpfung.

Bisher nicht aufgetreten, weil die Portale die Schreibweise konstant halten. Die
neue Trigger-Funktion in Etappe 3 fängt es mit einer sechsten Stufe ab
(E-Mail allein). Da der Index E-Mail ohnehin als eindeutig erzwingt, ist
Verknüpfen die einzig konsistente Reaktion.

### 1.6 Kein Datenverlustrisiko beim späteren Löschen

Prüfabfrage B, ausgeführt am 12.08.2026:

| Feld nur in der Buchung, fehlt in `guests` | Anzahl |
|---|---|
| Straße, Ort, PLZ, Geburtsdatum, Ausweis, E-Mail, Telefon | **je 0** |

Es existiert **kein einziger Wert**, der nur in einer Kopiespalte steht. Der
befürchtete Verlust der über `import-guest-list` eingelesenen
Meldeschein-Adressen tritt nicht ein — der bestehende Trigger hat sie über die
Zeit alle nach `guests` durchgereicht. Damit entfällt die aufwendigste
Vorbedingung von Etappe 6.

Weitere Nebenbefunde: **3 Gäste ohne jede Buchung** (harmlose Verwaisung),
**keine Namensdubletten** in `guests`. Die Matching-Kaskade hat sauber
gearbeitet.

---

## 2. Umfang — wie groß der Eingriff wirklich ist

### 2.1 Schreibpfade (4)

| Pfad | Datei | setzt `guest_id`? |
|---|---|---|
| Buchungsformular (Anlegen + Bearbeiten) | `src/components/Bookings/CreateBookingForm.tsx` | ja, eigene Kaskade |
| Buchungsanfrage annehmen (Frontend) | `src/hooks/useBookingInquiries.ts` | ja |
| Gästeliste importieren | `supabase/functions/import-guest-list/index.ts` | **nein** |
| Anfrage annehmen (Max) | `supabase/functions/chat-assistant/index.ts` | **nein** |

Die beiden Pfade ohne `guest_id` funktionieren heute nur, weil der DB-Trigger es
nachholt.

**Zusätzliches Risiko im Buchungsformular:** Es führt seine eigene
Matching-Kaskade bei **jedem** Speichern aus, auch im Bearbeiten-Modus. Trägt man
bei einer bestehenden Buchung eine E-Mail nach, die einem anderen Gast gehört,
wird `guest_id` stillschweigend umgehängt. Der DB-Trigger tut das bewusst nicht
(er matcht bei gesetzter `guest_id` nicht neu) — die Anwendung umgeht diesen
Schutz.

### 2.2 Rückschreibpfad Gast → Buchung (1)

`src/components/Guests/GuestEditDialog.tsx` schreibt nach jeder Gast-Bearbeitung
zehn Felder in **alle** Buchungen dieses Gastes zurück, ohne Statusfilter und
ohne `.select()`-Prüfung (verstößt gegen Lesson 9.2).

### 2.3 Lesepfade

| Ort | Fundstellen | Dateien |
|---|---|---|
| Frontend `.guest_name` | 161 | 51 |
| Frontend `.guest_email` | 94 | — |
| Edge Functions | ~190 | 17 |

Größte Einzelposten: `chat-assistant` (126), `morning-summary` (13),
`generate-guest-profile` (7).

**Gesamtfläche: rund 450 Codestellen.** Eine Umstellung in einem Schritt ist
nicht verantwortbar.

### 2.4 Was NICHT angefasst wird

- **`max_actions.guest_name`** ist eine eigene Spalte der Protokolltabelle, kein
  Bezug auf `bookings`. Ein Protokolleintrag soll festhalten, wie der Gast zum
  Zeitpunkt des Vorgangs hieß. Bleibt unverändert.
- **`booking_inquiries.guest_*`** — eine Anfrage hat noch keinen Gast. Bleibt.
- **`src/integrations/supabase/types.ts`** — generiert, wird nie von Hand
  geändert.

---

## 3. Zielbild

```
guests                          bookings
------                          --------
id            ◄──────────────── guest_id   (NOT NULL)
name                            house_id
email                           check_in / check_out
phone                           number_of_guests / adults / children
street, city, postal_code       booking_amount, currency, payment_status
birth_date                      platform, external_booking_id
travel_document                 status, notes
nationality
notes
```

Regel, die künftig gilt und dokumentiert wird:

> **Gastdaten stehen ausschließlich in `guests`.** Eine Buchung verweist über
> `guest_id`. Kein Code liest Gastdaten aus `bookings`.

---

## 4. Etappenplan

Die Reihenfolge ist umgedreht gegenüber dem ersten Entwurf: **erst die Wahrheit
umdrehen, dann die Leser umziehen, zuletzt die Spalten entfernen.** So ist das
System nach jeder einzelnen Etappe lauffähig, und jede Etappe ist für sich
zurückrollbar.

### Etappe 0 — Verifikation (kein Eingriff)

Die Abfragen aus Abschnitt 5 ausführen. Ohne diese Antworten darf keine Etappe
starten. Insbesondere: Wie viele Trigger hängen tatsächlich auf `bookings`?

### Etappe 1 — ENTFÄLLT

Der doppelte Trigger existiert nicht (Abschnitt 1.4). Nichts zu tun.

### Etappe 2 — Umhängen der `guest_id` beim Bearbeiten verhindern

`CreateBookingForm.tsx`: Hat die Buchung im Bearbeiten-Modus bereits eine
`guest_id`, wird die Matching-Kaskade übersprungen und die bestehende Zuordnung
beibehalten. Gastdaten werden weiterhin nach `guests` geschrieben.

Das ist der einzige Punkt, der **still Daten verfälschen kann**, und deshalb
zuerst dran — unabhängig vom Rest des Umbaus.

### Etappe 3 — Richtung umdrehen: `guests` wird die Quelle

Der bisherige Trigger schreibt Buchung → Gast. Er wird ersetzt durch zwei klar
getrennte Funktionen:

1. **`link_guest_on_booking_insert`** (BEFORE INSERT): findet oder erzeugt den
   Gast und setzt `guest_id`. Läuft **nur bei INSERT und nur wenn `guest_id`
   leer ist**. Damit bleibt der Eingangskanal für die vier Schreibpfade intakt.
2. **`sync_guest_copies_to_bookings`** (AFTER UPDATE auf `guests`): hält die
   Kopiespalten in `bookings` aktuell — **solange sie noch existieren**.

Ab hier ist `guests` die Quelle und die Kopien sind reine Ableitung. Der
Rückschreibblock in `GuestEditDialog.tsx` wird überflüssig und entfällt.

**Wichtig:** Nach dieser Etappe ist das eigentliche Ziel fachlich erreicht — es
gibt nur noch eine Wahrheit. Die Kopien sind dann eine reine
Kompatibilitätsschicht, die man in Ruhe abbauen kann.

### Etappe 4 — Leser umziehen (schrittweise, ohne Zeitdruck)

Alle lesenden Stellen wechseln auf die Relation. Im Frontend existieren die
Helfer bereits (`getGuestName`, `getGuestEmail` …); es ist überwiegend
Ersetzungsarbeit. Reihenfolge nach Risiko:

1. Stellen, die **Logik** an den Kopien festmachen (echte Bugs) — z. B.
   `GuestContactAlertBanner.tsx` Z. 68, das den E-Mail-Knopf sperrt, obwohl in
   `guests.email` eine Adresse steht.
2. Edge Functions, beginnend mit `morning-summary` und `generate-guest-profile`.
3. `chat-assistant` (126 Stellen) als eigener, sorgfältiger Schritt.
4. Reine Anzeigestellen — nach der Repo-Regel „beim nächsten Anfassen
   mitkorrigieren".

Jede Query, die künftig einen Gastwert braucht, lädt `guests(...)` mit.

### Etappe 5 — Schreibpfade autark machen, dann `guest_id` auf `NOT NULL`

**Muss vor Etappe 6 stehen.** Der Link-Trigger bezieht seine Eingabe aus den
Kopiespalten; sobald diese fallen, muss die `guest_id` von den Schreibpfaden
selbst kommen. Zwei von vier tun das heute nicht:

- `supabase/functions/import-guest-list/index.ts`
- `supabase/functions/chat-assistant/index.ts` (`executeAcceptBookingInquiry`)

Beide legen künftig zuerst den Gast an bzw. suchen ihn und schreiben dann die
Buchung mit `guest_id`. Danach `alter column guest_id set not null`.

### Etappe 6 — Kopiespalten entfernen

Vorbedingungen:

- Etappe 4 vollständig abgeschlossen (keine Lesestelle mehr).
- ~~Datenübernahme aus den Kopiespalten~~ — **entfällt.** Prüfabfrage B hat
  gezeigt, dass kein Wert nur in einer Kopiespalte steht (Abschnitt 1.5).
- `guest_name` ist `NOT NULL` und muss vorher auf `nullable` gesetzt werden.
- Der Trigger `trg_sync_guest_to_bookings` wird im selben Schritt entfernt — er
  hätte dann keine Zielspalten mehr.

Reihenfolge beim Löschen: erst die selten genutzten Adressfelder, zuletzt
`guest_name`.

---

## 5. Prüfabfragen für Etappe 0

**A) Welche Trigger hängen wirklich auf `bookings`?**

```sql
select t.tgname, p.proname, t.tgenabled,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'bookings' and not t.tgisinternal
order by t.tgname;
```

**B) Steht in den Kopiespalten etwas, das in `guests` fehlt?**
(entscheidet, ob vor Etappe 6 eine Datenübernahme nötig ist)

```sql
select count(*) filter (where b.guest_street  is not null and g.street      is null) as street_nur_in_buchung,
       count(*) filter (where b.guest_city    is not null and g.city        is null) as city_nur_in_buchung,
       count(*) filter (where b.guest_postal_code is not null and g.postal_code is null) as plz_nur_in_buchung,
       count(*) filter (where b.guest_birth_date  is not null and g.birth_date  is null) as gebdat_nur_in_buchung,
       count(*) filter (where b.guest_travel_document is not null and g.travel_document is null) as ausweis_nur_in_buchung,
       count(*) filter (where b.guest_email   is not null and g.email       is null) as email_nur_in_buchung,
       count(*) filter (where b.guest_phone   is not null and g.phone       is null) as tel_nur_in_buchung
from bookings b join guests g on g.id = b.guest_id;
```

**C) Gibt es Gäste ohne jede Buchung?** (Nebenbefund aus früheren
Trigger-Läufen, die Dubletten erzeugt haben könnten)

```sql
select count(*) from guests g
where not exists (select 1 from bookings b where b.guest_id = g.id);
```

**D) Gibt es Namensdubletten in `guests`?**

```sql
select lower(trim(name)) as name, count(*) as anzahl,
       array_agg(id) as ids
from guests group by 1 having count(*) > 1 order by 2 desc;
```

---

## 5b. Wirkungsprüfung der gelieferten Änderungen

Jede Änderung wurde gegen den echten Code und die verifizierte DB-Struktur
geprüft. Was hier steht, ist belegt, nicht angenommen.

### Etappe 2 — `CreateBookingForm.tsx`

**Änderung:** Im Bearbeiten-Modus mit vorhandener `guest_id` wird die
Matching-Kaskade übersprungen.

| Prüfpunkt | Befund |
|---|---|
| Ändert sich das Anlegen einer Buchung? | Nein. `mode === 'edit'` ist beim Anlegen falsch, die Kaskade läuft unverändert. |
| Kann `guestId` leer bleiben? | Nein. Bei `edit` ohne `guest_id` (existiert real nicht, 0 von 123) fällt der Code in die unveränderte Kaskade. |
| Bricht die Gast-Aktualisierung? | Nein. Der Block „Aktualisiere gefundenen Gast" (Z. ~545) läuft unverändert mit der übernommenen `guestId`. |
| Kollision mit dem DB-Trigger? | Nein. Der neue Link-Trigger feuert nur bei `INSERT` und nur bei leerer `guest_id`. |
| Kann eine Zuordnung noch bewusst geändert werden? | Über den Gäste-Tab (`GuestMergeDialog`). Im Buchungsformular bewusst nicht mehr. |

**Nebeneffekt, gewollt:** Ändert man im Bearbeiten-Modus den Gastnamen, wird
kein neuer Gast mehr angelegt — der bestehende wird umbenannt. Das ist die
Korrektur eines Fehlers, nicht ein neuer.

### Etappe 3 — SQL

| Prüfpunkt | Befund |
|---|---|
| Bleiben die vier Schreibpfade funktionsfähig? | Ja. `import-guest-list` und `chat-assistant` setzen keine `guest_id` — der Link-Trigger holt es nach, wie bisher. |
| Nebenwirkungen anderer Trigger auf `bookings`? | Nein. Alle vier prüfen andere Spalten (Status, Zeitraum, `number_of_guests`, `guest_contact_status`). Einzeln verifiziert. |
| Endlosschleife guests → bookings → guests? | Nein. Der Link-Trigger feuert nur bei `INSERT`, der Sync-Trigger nur bei `UPDATE` auf `guests`. Kein Zyklus. |
| Feuert der Sync bei jeder Kleinigkeit? | Nein. Die `WHEN`-Klausel prüft alle zehn Felder auf `is distinct from`. Ein `is_flagged`-Klick löst nichts aus. |
| `UNIQUE`-Verletzung möglich? | Durch Stufe 6 abgefangen (Abschnitt 1.5). Der alte Trigger konnte hier eine ganze Buchung scheitern lassen. |
| `updated_at` auf allen Buchungen? | Ja, wie bisher beim Rückschreibblock. Keine Verhaltensänderung, sichtbar nur in „Geändert von". |
| Rückrollbar? | Ja. `sync_guest_from_booking()` bleibt in der DB; Rückbau-SQL steht in Abschnitt 6 des Skripts. |

### Etappe 3b — `GuestEditDialog.tsx`

| Prüfpunkt | Befund |
|---|---|
| Lücke zwischen Handler-Entfernung und Trigger? | Nur bei falscher Reihenfolge. **SQL zuerst, dann die Komponente.** |
| Der `else`-Zweig (kein `guest.id`)? | Bleibt unverändert. Er greift nie (0 von 123 ohne `guest_id`), wird aber nicht im selben Schritt entfernt. |
| Werden die Buchungs-Queries noch aktualisiert? | Ja, `invalidateQueries(['bookings'])` bleibt. Der Trigger schreibt vor der Antwort. |
| Fehlender `.select()`-Check | Ergänzt (Lesson 9.2). Vorher meldete die Stelle Erfolg auch bei null Zeilen. |

### Was nach Etappe 3 noch NICHT stimmt

Ehrlich benannt: Nach Etappe 3 ist die **Datenhoheit** korrekt, die
**Doppelhaltung** aber noch da. Rund 450 Stellen lesen weiter aus den Kopien.
Sie sind dann korrekt gefüllt — aber jede neue Auswertung, die dort liest,
verlängert die Übergangsphase. Deshalb gehört Etappe 4 terminiert und nicht
„irgendwann".

---

## 5c. Voraussetzungen für das Löschen der Kopiespalten (Etappe 6)

Damit die Frage „können wir löschen?" beantwortbar wird, hier die vollständige,
abhakbare Liste. **Erst wenn jeder Punkt belegt ist, wird gelöscht.**

| # | Bedingung | Stand 12.08.2026 |
|---|---|---|
| 1 | Kein Wert existiert nur in einer Kopiespalte | ✅ belegt (Prüfabfrage B, alle 7 Zähler = 0) |
| 2 | Alle Buchungen haben `guest_id` | ✅ belegt (0 von 123 ohne) |
| 3 | Keine Namensdubletten in `guests` | ✅ belegt (Prüfabfrage D leer) |
| 4 | `guests` ist die Quelle, Kopien sind Ableitung | ⬜ nach Etappe 3 |
| 5 | Keine Lesestelle im Frontend mehr (161 + 94) | ⬜ Etappe 4 |
| 6 | Keine Lesestelle in Edge Functions mehr (~190) | ⬜ Etappe 4 |
| 7 | `guest_name` auf `nullable` gesetzt | ⬜ Etappe 6 |
| 8 | `trg_sync_guest_to_bookings` entfernt | ⬜ Etappe 6, gleicher Schritt |
| 9 | Entscheidung zu `guest_notes` getroffen | ⬜ offen |
| 10 | `guest_contact_status` bleibt erhalten | ✅ festgelegt |
| 11 | DB-Backup vor dem Löschen | ⬜ Etappe 6 |

**Die Antwort auf „können wir löschen?" ist damit: ja, aber noch nicht jetzt.**
Es fehlt kein Datenbestand und keine Struktur — es fehlt ausschließlich
Etappe 4, das Umziehen der Leser. Die Punkte 1 bis 3, die den Plan von 2024
blockiert hätten, sind heute nachweislich erfüllt.

### Das Lösch-SQL (erst nach Punkt 1–11)

```sql
-- Vorbedingung 8: Sync-Trigger entfernen, er hätte keine Zielspalten mehr
drop trigger if exists trg_sync_guest_to_bookings on public.guests;

-- Vorbedingung 7
alter table public.bookings alter column guest_name drop not null;

alter table public.bookings
  drop column if exists guest_name,
  drop column if exists guest_email,
  drop column if exists guest_phone,
  drop column if exists nationality,
  drop column if exists guest_street,
  drop column if exists guest_city,
  drop column if exists guest_postal_code,
  drop column if exists guest_birth_date,
  drop column if exists guest_travel_document;
  -- guest_notes: siehe Punkt 9
  -- guest_contact_status: BLEIBT (buchungsbezogen)

-- Der Link-Trigger liest die Kopiespalten beim INSERT. Nach dem Löschen muss
-- die Verknüpfung von den Schreibpfaden kommen -> Etappe 5 (guest_id NOT NULL)
-- MUSS vorher stehen, sonst entstehen Buchungen ohne Gastbezug.
drop trigger if exists trg_link_guest_on_booking_insert on public.bookings;
alter table public.bookings alter column guest_id set not null;
```

> **Wichtig:** Der Link-Trigger bezieht seine Eingabe aus den Kopiespalten. Mit
> ihrem Löschen verliert er seine Grundlage. Deshalb muss **Etappe 5 vor
> Etappe 6** stehen und alle vier Schreibpfade müssen `guest_id` selbst setzen.
> Aktuell tun das nur zwei von vier — `import-guest-list` und `chat-assistant`
> sind vor Etappe 6 nachzuziehen.

---

## 6. Risiken und wie sie abgefangen werden

| Risiko | Etappe | Abfangen |
|---|---|---|
| Gast-Erzeugung fällt aus, weil Kopiespalten nicht mehr befüllt werden | 3 | Link-Trigger übernimmt den Eingangskanal, bevor Schreibpfade sich ändern |
| Meldeschein-Adressen aus `import-guest-list` gehen verloren | 6 | Abfrage B, ggf. einmalige Übernahme vor dem Löschen |
| Buchung landet beim falschen Gast | 2 | Kaskade im Bearbeiten-Modus abschalten |
| Doppelte Trigger-Ausführung | 1 | Abfrage A, überzähligen Trigger löschen |
| Lesestelle übersehen → leere Anzeige | 4 | Spalten bleiben bis Etappe 6 als Sicherheitsnetz gefüllt |
| Big-Bang-Regression über 450 Stellen | alle | Etappen sind einzeln lauffähig und rückrollbar |

---

## 7. Was dieses Konzept bewusst nicht vorschlägt

- **Kein Sync-Ausbau in der Anwendung.** Zwei Handler in zwei Komponenten, die
  man beide vergessen kann, sind die Ursache und nicht die Lösung.
- **Keine Momentaufnahme-Felder für den Meldeschein.** Der Meldeschein entsteht
  außerhalb des Systems; Daten kommen nur optional herein. Es gibt damit keinen
  Grund, in `bookings` etwas historisch einzufrieren.
- **Kein gleichzeitiger Umbau von `CreateBookingForm.tsx`.** Die Datei hat 1.957
  Zeilen und 21 `useState` (CODE-INDEX 14b, Befund 3). Etappe 2 ändert dort
  gezielt eine Bedingung — Struktur und Verhalten werden nicht im selben Schritt
  angefasst.
