# Session 13.08.2026 — Gastdaten-Entdopplung: Etappen 4 und 5

> Was an diesem Tag umgesetzt, belegt und offen geblieben ist.
> Alle Angaben gegen den Repo-Stand `main` geprüft, nicht aus Erinnerung.

---

## ⚠️ ZUERST: Offener Testwert in der Datenbank

Für den Bruchtest wurden die Kopiespalten **einer** Buchung überschrieben.
**Dieser Wert steht noch drin.**

Buchung `b5163887-3342-41bd-8349-d2c89fe34ee5` — Dr. Ayman Alhasan,
Venediger Chalet, Anreise 20.07.2027:

```sql
update bookings b set
  guest_name  = g.name,
  guest_email = g.email,
  guest_phone = g.phone,
  nationality = g.nationality
from guests g
where g.id = b.guest_id and b.id = 'b5163887-3342-41bd-8349-d2c89fe34ee5'
returning b.guest_name;
```

Erwartet: `Dr. Ayman Alhasan`.

`guests` war zu keinem Zeitpunkt betroffen — die Quelle behielt alle Daten.
Hinweis: `guests.email` ist bei diesem Gast `null`; nach dem Zurücksetzen ist
`guest_email` also ebenfalls leer. Das ist korrekt, der Gast hat keine Adresse.

---

## 1. Etappe 5 abgeschlossen — Gastdaten entstehen in `guests`

Das war das eigentliche Ziel. **Alle vier Schreibpfade setzen ihre `guest_id`
jetzt selbst:**

| Schreibpfad | Stand |
|---|---|
| `CreateBookingForm.tsx` | ✅ vorher schon |
| `useBookingInquiries.ts` | ✅ vorher schon |
| `chat-assistant` (`executeAcceptBookingInquiry`) | ✅ 13.08. |
| `import-guest-list` | ✅ 13.08. |

### Die Zuordnungs-Kaskade liegt jetzt an einer Stelle

`supabase/SQL/41_gastdaten_entdopplung_etappe5.sql` löst die sechsstufige
Kaskade aus dem Trigger heraus und macht sie als
`find_or_create_guest(...)` per RPC aufrufbar. Aufrufer: der Trigger selbst
(Altpfade), `chat-assistant`, `import-guest-list`. Später kann auch
`CreateBookingForm` seine eigene Kaskade ablegen.

Die Alternative wäre gewesen, die Logik in jede Funktion zu kopieren — die
vierte Kopie derselben Entscheidung, gegen die Doppelgänger-Regel.

**Warum die Frontend-Vorlage nicht genügt hätte:** `useBookingInquiries`
matcht nur über E-Mail. Meldescheine führen **weder E-Mail noch Telefon**.
Ein E-Mail-Matching hätte bei jedem Import neue Gäste erzeugt — auch für
Stammgäste. Die Kaskade greift dort über Stufe 3 (Name + Nationalität +
Stadt), 4 (Name + Geburtsdatum) und 5 (Name + seltene Nationalität).

**Fehlerfall bewusst weich:** Schlägt der RPC-Aufruf fehl, läuft der Insert
ohne `guest_id` weiter und der Trigger übernimmt wie bisher. Eine Buchung darf
nicht daran scheitern, dass die Zuordnung klemmt.

**Belegt:** `find_or_create_guest('Luca Berresheim', 'luca.berresheim@hotmail.de')`
liefert dieselbe UUID wie der bestehende Datensatz, kein zweiter Gast entsteht.

**Noch nicht beobachtet:** Der RPC-Weg in `chat-assistant` — es gab keine
offene Buchungsanfrage zum Testen. Nachweis kommt bei der nächsten Anfrage:
Log-Eintrag `Gast zugeordnet: <uuid>`. Bei `import-guest-list` zählt ein
Zähler mit: `Gast-Zuordnung: X von Y Buchungen direkt verknüpft`.

---

## 2. Etappe 4 — Leser umgezogen

**43 von 58 Abfragen tragen jetzt den `guests`-Join.**

| Block | Inhalt | Stand |
|---|---|---|
| 1 | Edge Functions ohne `chat-assistant` | ✅ 12.08. |
| 2 | Frontend | ✅ 12.08. (5 Reste) |
| 3 | `chat-assistant`, Feldlisten (10 Abfragen) | ✅ 13.08., getestet |
| 4a | verschachtelte **Filter** (2) | ✅ 13.08., getestet |
| 4b | verschachtelte **Anzeige** (8) | ✅ 13.08., getestet |
| 5.1 | zentrale Hooks | ✅ 13.08., getestet |
| 5.2 | Kategorie B im Frontend | 🔄 begonnen |
| 5.4 | `select('*')` | 🔄 1 von 11 |

### Wichtigster technischer Befund

**PostgREST filtert zuverlässig über zwei Relationsebenen.**
`.ilike('bookings.guests.name', …)` über `service_tasks → bookings → guests`
funktioniert, wenn **beide** Relationen `!inner` tragen. Das war die einzige
echte Unbekannte des Umbaus — verifiziert an `search_cleaning_tasks` und
`search_linen_orders` mit unverändertem Vorher-/Nachher-Ergebnis.

### Der Hebel: zentrale Hooks statt Anzeigezeilen

`guestHelpers.ts` bekam `withGuestData()` und `withGuestDataSingle()`.
Aufgerufen in `useBookings` (4×) und `useDashboardData` (1×). Damit lesen
`HouseStackedCalendar`, `BookingTimeline`, `RealDataDashboard` und
`SmartLinenSettings` Werte aus `guests`, **ohne dass dort eine Zeile geändert
wurde**. Im Bruchtest bestätigt: Der Kalender zeigte den echten Namen, obwohl
in der Kopiespalte der Testwert stand.

`??` statt `||`, damit ein bewusst leeres Feld in `guests` nicht still auf den
Altbestand zurückfällt.

### Weitere Korrekturen

**`BookingOverviewFixed.tsx`** — 7 Stellen auf `getGuestName()` /
`getGuestNationality()`. Darunter die **Sortierung nach Gastname**, die über
die Kopie lief; nach dem Löschen der Spalten wäre die Reihenfolge zufällig
geworden. CRLF-Zeilenenden erhalten (sonst 1.100 statt 17 Diff-Zeilen).

**`get_booking_full_context`** in `chat-assistant` — das zentrale Tool hinter
„Zeig mir alles zu …" filterte über die Kopiespalte. `!inner` nur beim
Namensfilter: bei Suche per `booking_id` würde sonst eine Buchung ohne
`guest_id` still aus dem Ergebnis fallen.

**Nebenbefund mit korrigiert:** `has_email` in den Gästekontakt-Erinnerungen
hing an `booking.guest_email`. Stand die Adresse nur in `guests.email`,
meldete Max fälschlich „keine E-Mail hinterlegt".

---

## 3. Der Bruchtest — Methode, die sich bewährt hat

Statische Analyse konnte nicht zuverlässig bestimmen, welche Stellen nach dem
Löschen brechen: Komponenten bekommen Buchungen als Prop, und per Textsuche
lässt sich nicht ermitteln, ob die aufrufende Stelle gemappte Daten
weiterreicht. Vier Zählungen an einem Tag ergaben vier verschiedene Zahlen.

**Was funktioniert:** Kopiespalten einer Buchung auf einen erkennbaren
Platzhalter setzen und durch die Anwendung klicken. Wo `ZZKOPIE-NAME`
erscheint, liest der Code aus der Kopie. Beobachtet statt geschätzt.

`NULL` geht nicht — `guest_name` hat noch `NOT NULL` (fällt erst in Etappe 6).

### Ergebnisse

| Bereich | Ergebnis |
|---|---|
| Kalender | ✅ echter Name |
| Buchungsübersicht | ❌ `ZZKOPIE-NAME` → behoben |
| Max „Zeig mir alles zu …" | ❌ fand nichts → behoben |
| Gästeverwaltung | ⬜ nicht geprüft |
| Reinigung / Wäsche | ⬜ nicht geprüft |

Nach der Korrektur fand Max die Buchung unter „Ayman", obwohl in der
Kopiespalte der Testwert stand — der Treffer konnte nur aus `guests` stammen.
Stärkster Nachweis des Tages.

---

## 4. Was noch zu tun ist

### Sofort
Testwert zurücksetzen (Befehl ganz oben).

### Bruchtest zu Ende führen
Gästeverwaltung sowie Reinigungs- und Wäschelisten. Bei der Wäsche besonders
hinsehen: `LinenDashboard.tsx` ist im CODE-INDEX namentlich als Beispiel für
unvollständige Feldlisten bei Joins vermerkt und hat noch `select('*')`.

### 10 offene `select('*')`-Abfragen

| Datei | Zeile |
|---|---|
| `GuestAnalytics.tsx` | 620 |
| `GuestManagement.tsx` | 30 |
| `LinenDashboard.tsx` | 119 |
| `LinenOrderAnalytics.tsx` | 84 |
| `OriginalDashboard.tsx` | 343 |
| `analyze-vacancy` | 58 |
| `chat-assistant` | 262, 526 |
| `morning-summary` | 295 |
| `optimize-linen-inventory` | 56 |

Zwei davon (`optimize-linen-inventory`, `analyze-vacancy`) lesen vermutlich
gar keinen Gastnamen — dort genügt der Nachweis.

### 5 offene Feldlisten

| Datei : Zeile | Zu tun |
|---|---|
| `useGuests.ts:23` | `nationality` geladen, Z. 71 liest `guest.nationality` → ersatzlos streichen |
| `useMarketingActions.ts:189, 261` | Z. 166 **filtert** auf `booking.nationality` |
| `useGuestStayCounts.ts:23` | nutzt `getGuestKey` (guest_id zuerst) → funktional korrekt |
| `useRebookingScore.ts:72` | nutzt bereits `guest_id` → nur Feldliste bereinigen |

### Etappe 6 — Kopiespalten löschen

**Vorbedingungen, die noch fehlen:**
- alle Lesestellen umgezogen (Bruchtest ohne Fund)
- `guest_name` von `NOT NULL` befreien
- **beide Trigger abbauen** — `link_guest_on_booking_insert` liest zehn
  Kopiespalten, `sync_guest_to_bookings` schreibt hinein. Ohne Anpassung
  schlägt danach **jeder** Buchungs-Insert und **jede** Gast-Änderung fehl.
  Das gehört in dieselbe Transaktion wie das `drop column`.

**Nicht betroffen:** `max_actions.guest_name` (eigene Protokollspalte),
`booking_inquiries.guest_*` (eine Anfrage hat noch keinen Gast),
`guest_contact_status` (buchungsbezogen).

---

## 5. Fehler dieser Sitzung — damit sie sich nicht wiederholen

**Vier Zahlen an einem Tag, jede mit anderer Einheit.** 317 Anzeigezeilen,
45 Abfragen, 118, dann 112 „Bruchstellen". Keine war falsch gerechnet, aber
der Wechsel der Einheit wurde nie angesagt. Die Aufgabe wirkte mal riesig,
mal klein. → **Einheit ist die Abfrage.** Wer Anzeigezeilen zählt,
überschätzt um Faktor sieben.

**Ein vorhandener Plan wurde nicht gesucht.** `Etappe4-Bestandsaufnahme-Abfragen.md`
lag nicht im Repo (Upload war nie angekommen), aber in den früheren Chats.
Statt zu suchen, wurde vormittags ein komplettes Zweit-Inventar gebaut.
Genau das Muster, vor dem Abschnitt 0 des Konzepts warnt.

**Ein behobener Fehler wurde zweimal als offen gemeldet.**
`GuestContactAlertBanner:68` gilt im Konzept als Bug. `useGuestContactReminders`
mappt aber längst mit den Helfern — der Banner bekommt korrekte Werte. Die
Datei wurde als „dichtester Brocken" zur Bearbeitung vorgeschlagen, obwohl
fertig. → Vor jeder Aussage über eine Lesestelle prüfen, ob der **liefernde
Hook** bereits mappt.

**Die Reihenfolge folgte dem Etappenplan, nicht dem Ziel.** `chat-assistant`
wurde dreimal deployt, ohne den Schreibpfad mitzunehmen — obwohl das Ziel
„Gastdaten in die Gasttabelle" genau dort hing und es 25 Zeilen gewesen wären.

---

## 6. Deploy-Stände am Ende des Tages

| Datei | SHA |
|---|---|
| `supabase/functions/chat-assistant/index.ts` | `1bd02b87…` |
| `supabase/functions/import-guest-list/index.ts` | `1efdaccb…` |
| `src/components/Bookings/BookingOverviewFixed.tsx` | `d89bc188…` |

Frontend läuft über Vercel-Autodeploy, Edge Functions über
`supabase functions deploy … --project-ref usblrulkcgucxtkhugck`.
